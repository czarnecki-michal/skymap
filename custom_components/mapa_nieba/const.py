"""Constants for Mapa nieba."""
from __future__ import annotations

DOMAIN = "mapa_nieba"

CONF_GEOMETRY = "geometry"
CONF_OBSTRUCTIONS = "obstructions"
CONF_OBJECTS = "objects"
CONF_TWILIGHT = "twilight"

DEFAULT_GEOMETRY: dict[str, float] = {
    "az_center": 135.0,
    "alt_center": 15.0,
    "hfov": 67.0,
    "aspect": 4 / 3,
    "roll": 0.0,
}
DEFAULT_TWILIGHT = -12.0
DEFAULT_OBJECTS: list[str] = [
    "sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn",
    "sirius", "arcturus", "vega", "capella", "betelgeuse", "rigel", "polaris",
]

PLATFORMS = ["sensor"]
