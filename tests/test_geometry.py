import json
import os
from pathlib import Path

import pytest

from custom_components.mapa_nieba.geometry import (
    WindowGeometry, in_frame, point_in_obstruction, project, unproject, vfov,
)

FIXTURE = Path(__file__).parent / "fixtures" / "projection_vectors.json"


def G(az, alt, hfov=67.0, aspect=4 / 3, roll=0.0):
    return WindowGeometry(az, alt, hfov, aspect, roll)


CASES = [
    (G(135, 15), 135, 15),
    (G(135, 0), 135 + 33.5, 0),
    (G(200, 30, 50, 0.75), 210, 35),
    (G(135, 15, roll=90), 135, 25),
    (G(135, 15, roll=-90), 135, 25),
    (G(0, 10), 359, 10),
    (G(135, 15), 315, -15),
]


def _vectors():
    out = []
    for g, az, alt in CASES:
        p = project(g, az, alt)
        out.append({"geometry": g.to_dict(), "az": az, "alt": alt,
                    "x": None if p is None else p[0], "y": None if p is None else p[1]})
    return out


def test_vectors_file_matches_code():
    if os.environ.get("REGEN_VECTORS"):
        FIXTURE.parent.mkdir(exist_ok=True)
        FIXTURE.write_text(json.dumps(_vectors(), indent=1))
    stored, now = json.loads(FIXTURE.read_text()), _vectors()
    assert len(stored) == len(now)
    for s, n in zip(stored, now):
        assert s["geometry"] == pytest.approx(n["geometry"])
        assert (s["az"], s["alt"]) == (n["az"], n["alt"])
        if n["x"] is None:
            assert s["x"] is None and s["y"] is None
        else:
            assert (s["x"], s["y"]) == pytest.approx((n["x"], n["y"]))


def test_vfov():
    assert vfov(G(0, 0)) == pytest.approx(52.8, abs=0.1)


def test_known_projections():
    assert project(G(135, 15), 135, 15) == pytest.approx((0.5, 0.5))
    x, y = project(G(135, 0), 168.5, 0)
    assert x == pytest.approx(1.0) and y == pytest.approx(0.5)
    assert project(G(135, 15), 315, -15) is None
    assert project(G(135, 15, roll=90), 135, 25)[0] > 0.5
    assert project(G(135, 15, roll=-90), 135, 25)[0] < 0.5
    assert project(G(0, 10), 359, 10)[0] < 0.5  # north wrap


def test_portrait_aspect_has_larger_vfov():
    assert vfov(G(0, 0, 50, 0.75)) > 50


def test_in_frame_edges():
    g = G(135, 0)
    assert in_frame(g, 135, 0) and not in_frame(g, 135 + 40, 0)
    assert not in_frame(g, 135 + 180, 0)


@pytest.mark.parametrize("g", [G(135, 15), G(0, 10, roll=20), G(200, 30, 50, 0.75, 15)])
def test_roundtrip(g):
    for x, y in [(0.2, 0.3), (0.5, 0.5), (0.9, 0.8)]:
        az, alt = unproject(g, x, y)
        assert project(g, az, alt) == pytest.approx((x, y), abs=1e-6)


def test_obstruction_basic_and_wrap():
    rect = [[(130, 0), (140, 0), (140, 40), (130, 40)]]
    assert point_in_obstruction(rect, 135, 20)
    assert not point_in_obstruction(rect, 150, 20)
    north = [[(355, 0), (5, 0), (5, 30), (355, 30)]]
    assert point_in_obstruction(north, 359, 10) and point_in_obstruction(north, 2, 10)
    assert not point_in_obstruction(north, 20, 10)
    assert not point_in_obstruction([], 135, 20)
