"""Write tests/fixtures/sky_vectors.json: skyfield alt/az of stars for card/test/sky-math.test.ts."""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root))
from custom_components.mapa_nieba import astro  # noqa: E402
from custom_components.mapa_nieba.objects import CATALOG  # noqa: E402

obs = astro.Observer(53.4285, 14.5528, 10.0)
out = []
for when in (datetime(2026, 1, 15, 21, 0, tzinfo=timezone.utc), datetime(2026, 7, 1, 2, 0, tzinfo=timezone.utc)):
    for sid in ("sirius", "vega", "polaris", "arcturus", "capella"):
        o = CATALOG[sid]
        p = astro.compute_positions([o], obs, when)[sid]
        out.append({"time": when.isoformat(), "lat": obs.lat, "lon": obs.lon, "id": sid,
                    "ra": o.ra_deg, "dec": o.dec_deg, "alt": p.alt, "az": p.az})
path = root / "tests" / "fixtures" / "sky_vectors.json"
path.write_text(json.dumps(out, indent=1))
print(len(out), "vectors")
