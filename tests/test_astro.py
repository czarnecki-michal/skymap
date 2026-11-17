from datetime import datetime, timedelta, timezone

import pytest

from custom_components.mapa_nieba.astro import (
    Observer, compute_positions, compute_track, load_ephemeris,
)
from custom_components.mapa_nieba.objects import CATALOG, DEFAULT_OBJECT_IDS

SZCZECIN = Observer(53.4285, 14.5528, 10.0)
UTC = timezone.utc


def test_catalog_has_defaults():
    assert len(DEFAULT_OBJECT_IDS) == 14
    assert all(i in CATALOG for i in DEFAULT_OBJECT_IDS)
    assert len(CATALOG) == 32


def test_sun_culmination_altitude_midsummer():
    start = datetime(2026, 6, 21, 6, 0, tzinfo=UTC)
    transit = compute_positions([CATALOG["sun"]], SZCZECIN, start)["sun"].transit
    assert transit is not None
    pos = compute_positions([CATALOG["sun"]], SZCZECIN, transit)["sun"]
    assert abs(pos.alt - 60.0) < 0.3


def test_polaris_is_circumpolar():
    pos = compute_positions([CATALOG["polaris"]], SZCZECIN, datetime(2026, 1, 1, tzinfo=UTC))["polaris"]
    assert abs(pos.alt - SZCZECIN.lat) < 1.0
    assert pos.rise is None and pos.set is None


def test_moon_phase_new_and_full():
    new = compute_positions([CATALOG["moon"]], SZCZECIN, datetime(2026, 2, 17, 12, 1, tzinfo=UTC))["moon"]
    full = compute_positions([CATALOG["moon"]], SZCZECIN, datetime(2026, 3, 3, 11, 38, tzinfo=UTC))["moon"]
    assert new.illumination < 0.01 and full.illumination > 0.99
    assert abs(full.phase - 0.5) < 0.02


def test_track_length_and_azimuth_range():
    base = datetime(2026, 1, 15, 20, 0, tzinfo=UTC)
    times = [base + timedelta(minutes=10 * i) for i in range(7)]
    objs = [CATALOG[i] for i in ("venus", "sirius", "moon")]
    track = compute_track(objs, SZCZECIN, times)
    assert set(track) == {"venus", "sirius", "moon"}
    for pts in track.values():
        assert len(pts) == 7
        assert all(0 <= az < 360 for _, az in pts)


def test_missing_ephemeris_raises_readable_error(tmp_path):
    with pytest.raises(FileNotFoundError, match="efemerydy"):
        load_ephemeris(tmp_path / "nope.bsp")
