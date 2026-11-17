import stars from "./data/stars.json";
import { project, type WindowGeometry } from "./projection";
import { localSiderealTime, precess, raDecToAltAz } from "./sky-math";

export interface ObjectInfo {
  id: string;
  name: string;
  kind: "sun" | "moon" | "planet" | "star";
  entity_id: string | null;
}
export interface CardData {
  geometry: WindowGeometry;
  obstructions: [number, number][][];
  twilight: number;
  observer: { lat: number; lon: number; elevation: number };
  objects: ObjectInfo[];
}
/** Positions of solar-system bodies at one time index of a `mapa_nieba/sky` reply. */
export interface BodyPoints {
  [id: string]: [number, number]; // alt, az
}
export interface Scene {
  stars: { x: number; y: number; r: number }[];
  lines: { x1: number; y1: number; x2: number; y2: number }[];
  bodies: { id: string; name: string; kind: string; x: number; y: number; alt: number; az: number; entity_id: string | null }[];
  horizon: string;
}

const data = stars as { stars: [number, number, number, number][]; lines: [number, number][] };

export function starRadius(mag: number): number {
  return Math.max(0.6, 3.2 - 0.5 * mag);
}

export function buildScene(cfg: CardData, bodies: BodyPoints, date: Date, w: number, h: number): Scene {
  const { lat, lon } = cfg.observer;
  const lst = localSiderealTime(date, lon);
  const px = (p: [number, number] | null): [number, number] | null => (p ? [p[0] * w, p[1] * h] : null);
  const place = (ra: number, dec: number) => {
    const [r2, d2] = precess(ra, dec, date);
    const { alt, az } = raDecToAltAz(r2, d2, lat, lst);
    return { alt, az, p: px(project(cfg.geometry, az, alt)) };
  };
  const cache = new Map<number, { alt: number; p: [number, number] | null }>();
  const sc: Scene = { stars: [], lines: [], bodies: [], horizon: "" };
  for (const s of data.stars) {
    const q = place(s[0], s[1]);
    cache.set(s[3], q);
    if (q.alt > 0 && q.p) sc.stars.push({ x: q.p[0], y: q.p[1], r: starRadius(s[2]) });
  }
  for (const [a, b] of data.lines) {
    const qa = cache.get(a);
    const qb = cache.get(b);
    if (qa && qb && qa.alt > 0 && qb.alt > 0 && qa.p && qb.p) {
      sc.lines.push({ x1: qa.p[0], y1: qa.p[1], x2: qb.p[0], y2: qb.p[1] });
    }
  }
  for (const o of cfg.objects) {
    const alt_az = bodies[o.id];
    if (o.kind === "star") {
      const st = starCatalogEntry(o.id);
      if (!st) continue;
      const q = place(st[0], st[1]);
      if (q.alt > 0 && q.p) sc.bodies.push({ ...o, x: q.p[0], y: q.p[1], alt: q.alt, az: q.az });
    } else if (alt_az && alt_az[0] > 0) {
      const p = px(project(cfg.geometry, alt_az[1], alt_az[0]));
      if (p) sc.bodies.push({ ...o, x: p[0], y: p[1], alt: alt_az[0], az: alt_az[1] });
    }
  }
  let path = "";
  let pen = false;
  for (let az = 0; az <= 360; az += 2) {
    const p = px(project(cfg.geometry, az, 0));
    if (p) {
      path += `${pen ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`;
      pen = true;
    } else pen = false;
  }
  sc.horizon = path;
  return sc;
}

// J2000 coordinates of the named catalogue stars (mirror of objects.py).
const NAMED: Record<string, [number, number]> = {
  sirius: [101.287, -16.716], arcturus: [213.915, 19.182], vega: [279.234, 38.784],
  capella: [79.172, 45.998], rigel: [78.634, -8.202], procyon: [114.825, 5.225],
  betelgeuse: [88.793, 7.407], altair: [297.696, 8.868], aldebaran: [68.98, 16.509],
  spica: [201.298, -11.161], antares: [247.352, -26.432], pollux: [116.329, 28.026],
  fomalhaut: [344.413, -29.622], deneb: [310.358, 45.28], regulus: [152.093, 11.967],
  castor: [113.65, 31.888], bellatrix: [81.283, 6.35], elnath: [81.573, 28.608],
  alnilam: [84.054, -1.202], alioth: [193.507, 55.96], dubhe: [165.932, 61.751],
  mirfak: [51.081, 49.861], polaris: [37.955, 89.264], alphard: [141.897, -8.659],
  hamal: [31.793, 23.463],
};
function starCatalogEntry(id: string): [number, number] | undefined {
  return NAMED[id];
}
