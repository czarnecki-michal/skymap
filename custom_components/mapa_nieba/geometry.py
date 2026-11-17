"""Window geometry: rectilinear projection and obstruction masks (pure Python).

Conventions (mirrored by card/src/projection.ts and pinned by
tests/fixtures/projection_vectors.json):
  * az is degrees clockwise from north, alt degrees above the horizon.
  * Image coordinates are normalised: x to the right, y downwards, [0,1] = in frame.
  * Positive roll rotates the image content clockwise as displayed
    (an object above the frame centre moves to the right).
"""
from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from typing import Mapping, Sequence

Point = tuple[float, float]


@dataclass(frozen=True)
class WindowGeometry:
    az_center: float
    alt_center: float
    hfov: float
    aspect: float  # photo width / height
    roll: float = 0.0

    @classmethod
    def from_dict(cls, d: Mapping) -> "WindowGeometry":
        return cls(
            float(d["az_center"]) % 360.0,
            float(d["alt_center"]),
            float(d["hfov"]),
            float(d["aspect"]),
            float(d.get("roll", 0.0)),
        )

    def to_dict(self) -> dict[str, float]:
        return asdict(self)


def vfov(g: WindowGeometry) -> float:
    return math.degrees(2 * math.atan(math.tan(math.radians(g.hfov) / 2) / g.aspect))


def _basis(g: WindowGeometry):
    az, alt = math.radians(g.az_center), math.radians(g.alt_center)
    f = (math.sin(az) * math.cos(alt), math.cos(az) * math.cos(alt), math.sin(alt))
    r = (math.cos(az), -math.sin(az), 0.0)
    u = (-math.sin(alt) * math.sin(az), -math.sin(alt) * math.cos(az), math.cos(alt))
    return f, r, u


def _dot(a, b) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def project(g: WindowGeometry, az: float, alt: float) -> Point | None:
    f, r, u = _basis(g)
    a, e = math.radians(az), math.radians(alt)
    v = (math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), math.sin(e))
    c = _dot(v, f)
    if c <= 1e-9:
        return None
    px, py = _dot(v, r) / c, _dot(v, u) / c
    rho = math.radians(g.roll)
    qx = px * math.cos(rho) + py * math.sin(rho)
    qy = -px * math.sin(rho) + py * math.cos(rho)
    th = math.tan(math.radians(g.hfov) / 2)
    return 0.5 + qx / (2 * th), 0.5 - qy * g.aspect / (2 * th)


def unproject(g: WindowGeometry, x: float, y: float) -> Point:
    th = math.tan(math.radians(g.hfov) / 2)
    qx = (x - 0.5) * 2 * th
    qy = -(y - 0.5) * 2 * th / g.aspect
    rho = math.radians(g.roll)
    px = qx * math.cos(rho) - qy * math.sin(rho)
    py = qx * math.sin(rho) + qy * math.cos(rho)
    f, r, u = _basis(g)
    v = [f[i] + px * r[i] + py * u[i] for i in range(3)]
    n = math.sqrt(_dot(v, v))
    alt = math.degrees(math.asin(v[2] / n))
    az = math.degrees(math.atan2(v[0], v[1])) % 360.0
    return az, alt


def in_frame(g: WindowGeometry, az: float, alt: float) -> bool:
    p = project(g, az, alt)
    return p is not None and 0.0 <= p[0] <= 1.0 and 0.0 <= p[1] <= 1.0


def _rel(az: float, ref: float) -> float:
    return (az - ref + 180.0) % 360.0 - 180.0


def point_in_obstruction(
    polygons: Sequence[Sequence[Point]], az: float, alt: float
) -> bool:
    """Ray-casting test on (az, alt) polygons; azimuth wrap safe."""
    for poly in polygons:
        if len(poly) < 3:
            continue
        ref = poly[0][0]
        pts = [(_rel(p[0], ref), p[1]) for p in poly]
        x, y = _rel(az, ref), alt
        inside = False
        j = len(pts) - 1
        for i in range(len(pts)):
            xi, yi = pts[i]
            xj, yj = pts[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                inside = not inside
            j = i
        if inside:
            return True
    return False
