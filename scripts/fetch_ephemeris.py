"""Download the DE421 ephemeris into custom_components/mapa_nieba/data/."""
from pathlib import Path

from skyfield.api import Loader

data = Path(__file__).resolve().parent.parent / "custom_components" / "mapa_nieba" / "data"
data.mkdir(parents=True, exist_ok=True)
Loader(str(data))("de421.bsp")
print("ok", data / "de421.bsp")
