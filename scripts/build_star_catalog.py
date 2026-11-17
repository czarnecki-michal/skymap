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

PL_NAMES = {
    "And": "Andromeda", "Ant": "Pompa", "Aps": "Ptak Rajski", "Aqr": "Wodnik", "Aql": "Orzeł",
    "Ara": "Ołtarz", "Ari": "Baran", "Aur": "Woźnica", "Boo": "Wolarz", "Cae": "Rylec",
    "Cam": "Żyrafa", "Cnc": "Rak", "CVn": "Psy Gończe", "CMa": "Wielki Pies", "CMi": "Mały Pies",
    "Cap": "Koziorożec", "Car": "Kil", "Cas": "Kasjopeja", "Cen": "Centaur", "Cep": "Cefeusz",
    "Cet": "Wieloryb", "Cha": "Kameleon", "Cir": "Cyrkiel", "Col": "Gołąb", "Com": "Warkocz Bereniki",
    "CrA": "Korona Południowa", "CrB": "Korona Północna", "Crv": "Kruk", "Crt": "Puchar",
    "Cru": "Krzyż Południa", "Cyg": "Łabędź", "Del": "Delfin", "Dor": "Złota Ryba", "Dra": "Smok",
    "Equ": "Źrebię", "Eri": "Erydan", "For": "Piec", "Gem": "Bliźnięta", "Gru": "Żuraw",
    "Her": "Herkules", "Hor": "Zegar", "Hya": "Hydra", "Hyi": "Wąż Wodny", "Ind": "Indianin",
    "Lac": "Jaszczurka", "Leo": "Lew", "LMi": "Mały Lew", "Lep": "Zając", "Lib": "Waga",
    "Lup": "Wilk", "Lyn": "Ryś", "Lyr": "Lutnia", "Men": "Góra Stołowa", "Mic": "Mikroskop",
    "Mon": "Jednorożec", "Mus": "Mucha", "Nor": "Węgielnica", "Oct": "Oktant", "Oph": "Wężownik",
    "Ori": "Orion", "Pav": "Paw", "Peg": "Pegaz", "Per": "Perseusz", "Phe": "Feniks",
    "Pic": "Malarz", "Psc": "Ryby", "PsA": "Ryba Południowa", "Pup": "Rufa", "Pyx": "Kompas",
    "Ret": "Sieć", "Sge": "Strzała", "Sgr": "Strzelec", "Sco": "Skorpion", "Scl": "Rzeźbiarz",
    "Sct": "Tarcza", "Ser": "Wąż", "Sex": "Sekstant", "Tau": "Byk", "Tel": "Luneta",
    "Tri": "Trójkąt", "TrA": "Trójkąt Południowy", "Tuc": "Tukan", "UMa": "Wielka Niedźwiedzica",
    "UMi": "Mała Niedźwiedzica", "Vel": "Żagiel", "Vir": "Panna", "Vol": "Ryba Latająca", "Vul": "Lisek",
}


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
    constellations = {}
    for c in culture["constellations"]:
        cid = c["id"].split()[-1].rstrip("0123456789")
        members = constellations.setdefault(cid, set())
        for poly in c.get("lines", []):
            for a, b in zip(poly, poly[1:]):
                if a in stars and b in stars and a != b:
                    edges.add(tuple(sorted((a, b))))
                    members.update((a, b))
    cons = [
        {"id": cid, "name": PL_NAMES[cid], "hips": sorted(m)}
        for cid, m in sorted(constellations.items())
        if cid in PL_NAMES and len(m) >= 2
    ]
    OUT.write_text(json.dumps(
        {"stars": list(stars.values()), "lines": [list(e) for e in sorted(edges)], "constellations": cons},
        separators=(",", ":"), ensure_ascii=False,
    ), encoding="utf-8")
    print(len(stars), "stars", len(edges), "lines", len(cons), "constellations")


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".cache"))
