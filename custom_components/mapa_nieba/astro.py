"""Astronomy via skyfield (pure: no Home Assistant imports)."""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Sequence

from skyfield import almanac
from skyfield.api import Star, load, wgs84
from skyfield.jpllib import SpiceKernel

from .objects import SkyObject

EPHEMERIS_PATH = Path(__file__).parent / "data" / "de421.bsp"
_TS = load.timescale()


@dataclass(frozen=True)
class Observer:
    lat: float
    lon: float
    elevation_m: float = 0.0


@dataclass(frozen=True)
class BodyPosition:
    id: str
    alt: float
    az: float
    magnitude: float | None
    rise: datetime | None
    set: datetime | None
    transit: datetime | None
    illumination: float | None
    phase: float | None


def load_ephemeris(path: Path = EPHEMERIS_PATH) -> SpiceKernel:
    if not Path(path).exists():
        raise FileNotFoundError(
            f"Brak pliku efemerydy {path}. Uruchom scripts/fetch_ephemeris.py."
        )
    return SpiceKernel(str(path))


@lru_cache(maxsize=1)
def _eph() -> SpiceKernel:
    return load_ephemeris(EPHEMERIS_PATH)


def ensure_ephemeris() -> SpiceKernel:
    """Load (and cache) the ephemeris; raises FileNotFoundError if missing."""
    return _eph()


def _target(eph: SpiceKernel, obj: SkyObject):
    if obj.kind == "star":
        return Star(ra_hours=obj.ra_deg / 15.0, dec_degrees=obj.dec_deg)
    return eph[obj.target]


def _topos(observer: Observer):
    return wgs84.latlon(observer.lat, observer.lon, elevation_m=observer.elevation_m)


def _times(times: Sequence[datetime]):
    return _TS.from_datetimes([t.astimezone(timezone.utc) for t in times])


def _altaz(eph, obj, observer, t):
    site = eph["earth"] + _topos(observer)
    alt, az, _ = site.at(t).observe(_target(eph, obj)).apparent().altaz()
    return alt.degrees, az.degrees


def _events(eph, obj, observer, when: datetime):
    t0 = _times([when])[0]
    t1 = _times([when + timedelta(days=1)])[0]
    target, topos = _target(eph, obj), _topos(observer)
    f = almanac.risings_and_settings(eph, target, topos)
    times, ys = almanac.find_discrete(t0, t1, f)
    rise = next((t.utc_datetime() for t, y in zip(times, ys) if y == 1), None)
    set_ = next((t.utc_datetime() for t, y in zip(times, ys) if y == 0), None)
    g = almanac.meridian_transits(eph, target, topos)
    times, ys = almanac.find_discrete(t0, t1, g)
    transit = next((t.utc_datetime() for t, y in zip(times, ys) if y == 1), None)
    return rise, set_, transit


def compute_positions(
    objects: Sequence[SkyObject], observer: Observer, when: datetime
) -> dict[str, BodyPosition]:
    eph = _eph()
    t = _times([when])
    out: dict[str, BodyPosition] = {}
    for obj in objects:
        alt, az = _altaz(eph, obj, observer, t)
        rise, set_, transit = _events(eph, obj, observer, when)
        illum = phase = None
        if obj.kind == "moon":
            deg = float(almanac.moon_phase(eph, t).degrees[0])
            phase = (deg % 360.0) / 360.0
            illum = (1.0 - math.cos(math.radians(deg))) / 2.0
        out[obj.id] = BodyPosition(
            obj.id, float(alt[0]), float(az[0]) % 360.0, obj.mag, rise, set_, transit, illum, phase
        )
    return out


def compute_track(
    objects: Sequence[SkyObject], observer: Observer, times: Sequence[datetime]
) -> dict[str, list[tuple[float, float]]]:
    eph = _eph()
    t = _times(times)
    out = {}
    for obj in objects:
        alt, az = _altaz(eph, obj, observer, t)
        out[obj.id] = [(float(a), float(b) % 360.0) for a, b in zip(alt, az)]
    return out


def moon_phases(times: Sequence[datetime]) -> list[tuple[float, float]]:
    """(illumination 0..1, phase 0..1 of the cycle) for each time."""
    deg = almanac.moon_phase(_eph(), _times(times)).degrees
    return [
        ((1.0 - math.cos(math.radians(d))) / 2.0, (float(d) % 360.0) / 360.0) for d in deg
    ]


def sun_altitudes(observer: Observer, times: Sequence[datetime]) -> list[float]:
    eph = _eph()
    site = eph["earth"] + _topos(observer)
    alt, _, _ = site.at(_times(times)).observe(eph["sun"]).apparent().altaz()
    return [float(a) for a in alt.degrees]
