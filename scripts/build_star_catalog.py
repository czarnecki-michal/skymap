"""Build card/src/data/stars.json (stars brighter than mag 5.5 + constellation lines).

Sources (downloaded into the cache dir given as argv[1], default ./.cache):
  * HYG database (Hipparcos-based): ra in hours, dec in degrees, mag
  * Stellarium "modern" sky culture: constellation polylines as HIP ids
"""
import csv
import json
import sys
import urllib.request
from pathlib import Path

HYG = "https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv"
LINES = "https://raw.githubusercontent.com/Stellarium/stellarium/master/skycultures/modern/index.json"
OUT = Path(__file__).resolve().parent.parent / "card" / "src" / "data" / "stars.json"
MAG_LIMIT = 5.5


def fetch(url: str, cache: Path) -> Path:
    cache.mkdir(parents=True, exist_ok=True)
    target = cache / url.rsplit("/", 1)[-1]
    if not target.exists():
        urllib.request.urlretrieve(url, target)
    return target


def main(cache: Path) -> None:
    stars = {}
    with open(fetch(HYG, cache), encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if not row["hip"] or not row["mag"]:
                continue
            mag = float(row["mag"])
            if row["proper"] == "Sol" or mag > MAG_LIMIT:
                continue
            stars[int(row["hip"])] = [round(float(row["ra"]) * 15, 3), round(float(row["dec"]), 3), round(mag, 2), int(row["hip"])]
    culture = json.loads(fetch(LINES, cache).read_text(encoding="utf-8"))
    edges = set()
    for c in culture["constellations"]:
        for poly in c.get("lines", []):
            for a, b in zip(poly, poly[1:]):
                if a in stars and b in stars and a != b:
                    edges.add(tuple(sorted((a, b))))
    OUT.write_text(json.dumps({"stars": list(stars.values()), "lines": [list(e) for e in sorted(edges)]}, separators=(",", ":")))
    print(len(stars), "stars", len(edges), "lines")


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".cache"))
