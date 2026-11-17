"""Catalog of sky objects (pure data, no Home Assistant imports)."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Kind = Literal["sun", "moon", "planet", "star"]


@dataclass(frozen=True)
class SkyObject:
    id: str
    name_pl: str
    kind: Kind
    target: str | None = None
    ra_deg: float | None = None
    dec_deg: float | None = None
    mag: float | None = None


def _body(id_: str, name: str, kind: Kind, target: str, mag: float) -> SkyObject:
    return SkyObject(id_, name, kind, target=target, mag=mag)


def _star(id_: str, name: str, ra: float, dec: float, mag: float) -> SkyObject:
    return SkyObject(id_, name, "star", ra_deg=ra, dec_deg=dec, mag=mag)


_OBJECTS = [
    _body("sun", "Słońce", "sun", "sun", -26.7),
    _body("moon", "Księżyc", "moon", "moon", -12.0),
    _body("mercury", "Merkury", "planet", "mercury barycenter", 0.0),
    _body("venus", "Wenus", "planet", "venus barycenter", -4.0),
    _body("mars", "Mars", "planet", "mars barycenter", 0.7),
    _body("jupiter", "Jowisz", "planet", "jupiter barycenter", -2.2),
    _body("saturn", "Saturn", "planet", "saturn barycenter", 0.8),
    _star("sirius", "Syriusz", 101.287, -16.716, -1.46),
    _star("arcturus", "Arktur", 213.915, 19.182, -0.05),
    _star("vega", "Wega", 279.234, 38.784, 0.03),
    _star("capella", "Kapella", 79.172, 45.998, 0.08),
    _star("rigel", "Rigel", 78.634, -8.202, 0.13),
    _star("procyon", "Procjon", 114.825, 5.225, 0.34),
    _star("betelgeuse", "Betelgeza", 88.793, 7.407, 0.42),
    _star("altair", "Altair", 297.696, 8.868, 0.76),
    _star("aldebaran", "Aldebaran", 68.980, 16.509, 0.85),
    _star("spica", "Spika", 201.298, -11.161, 0.97),
    _star("antares", "Antares", 247.352, -26.432, 1.06),
    _star("pollux", "Polluks", 116.329, 28.026, 1.14),
    _star("fomalhaut", "Fomalhaut", 344.413, -29.622, 1.16),
    _star("deneb", "Deneb", 310.358, 45.280, 1.25),
    _star("regulus", "Regulus", 152.093, 11.967, 1.35),
    _star("castor", "Kastor", 113.650, 31.888, 1.58),
    _star("bellatrix", "Bellatrix", 81.283, 6.350, 1.64),
    _star("elnath", "Elnath", 81.573, 28.608, 1.65),
    _star("alnilam", "Alnilam", 84.054, -1.202, 1.69),
    _star("alioth", "Alioth", 193.507, 55.960, 1.77),
    _star("dubhe", "Dubhe", 165.932, 61.751, 1.79),
    _star("mirfak", "Mirfak", 51.081, 49.861, 1.79),
    _star("polaris", "Polaris", 37.955, 89.264, 1.98),
    _star("alphard", "Alphard", 141.897, -8.659, 1.98),
    _star("hamal", "Hamal", 31.793, 23.463, 2.00),
]

CATALOG: dict[str, SkyObject] = {o.id: o for o in _OBJECTS}

DEFAULT_OBJECT_IDS: list[str] = [
    "sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn",
    "sirius", "arcturus", "vega", "capella", "betelgeuse", "rigel", "polaris",
]
