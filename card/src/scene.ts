import stars from "./data/stars.json";
import { skyToPolygon } from "./obstructions";
import { project, type WindowGeometry } from "./projection";
import { localSiderealTime, precess, raDecToAltAz } from "./sky-math";
import { skyVisibility, viewGeometry, type View } from "./view";

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
  photo?: { url: string; version: number } | null;
  photo_opacity?: number;
}
/** Positions of solar-system bodies at one time index of a `mapa_nieba/sky` reply. */
export interface BodyPoints {
  [id: string]: [number, number]; // alt, az
}
export interface SceneBody {
  id: string;
  name: string;
  kind: string;
  entity_id: string | null;
  x: number;
  y: number;
  alt: number;
  az: number;
  a: number;
}
export interface Scene {
  stars: { x: number; y: number; r: number; a: number }[];
  lines: { x1: number; y1: number; x2: number; y2: number; a: number }[];
  labels: { x: number; y: number; text: string; a: number }[];
  bodies: SceneBody[];
  ground: [number, number][];
  horizon: [number, number][];
  obstructions: [number, number][][];
}

type Catalogue = {
  stars: [number, number, number, number][];
  lines: [number, number][];
  constellations: { id: string; name: string; hips: number[] }[];
};
const data = stars as unknown as Catalogue;

export const SOLAR: Record<string, { name: string; kind: ObjectInfo["kind"] }> = {
  sun: { name: "Słońce", kind: "sun" },
  moon: { name: "Księżyc", kind: "moon" },
  mercury: { name: "Merkury", kind: "planet" },
  venus: { name: "Wenus", kind: "planet" },
  mars: { name: "Mars", kind: "planet" },
  jupiter: { name: "Jowisz", kind: "planet" },
  saturn: { name: "Saturn", kind: "planet" },
};

// J2000 coordinates of the named catalogue stars (mirror of objects.py).
export const NAMED: Record<string, [number, number]> = {
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

const STAR_NAMES: Record<string, string> = {
  sirius: "Syriusz", arcturus: "Arktur", vega: "Wega", capella: "Kapella", rigel: "Rigel",
  procyon: "Procjon", betelgeuse: "Betelgeza", altair: "Altair", aldebaran: "Aldebaran", spica: "Spika",
  antares: "Antares", pollux: "Polluks", fomalhaut: "Fomalhaut", deneb: "Deneb", regulus: "Regulus",
  castor: "Kastor", bellatrix: "Bellatrix", elnath: "Elnath", alnilam: "Alnilam", alioth: "Alioth",
  dubhe: "Dubhe", mirfak: "Mirfak", polaris: "Polaris", alphard: "Alphard", hamal: "Hamal",
};

/** Polish name of a named catalogue star (mirror of objects.py). */
export function starName(id: string): string {
  return STAR_NAMES[id] ?? id;
}

export function starRadius(mag: number): number {
  return Math.max(0.6, 3.2 - 0.5 * mag);
}

const inside = (p: [number, number] | null, m = 0.05) =>
  !!p && p[0] >= -m && p[0] <= 1 + m && p[1] >= -m && p[1] <= 1 + m;

export function buildScene(
  cfg: CardData,
  bodies: BodyPoints,
  date: Date,
  view: View,
  w: number,
  h: number,
  sunAlt?: number,
): Scene {
  const vg = viewGeometry(view, w / h);
  const vis = sunAlt === undefined ? 1 : skyVisibility(sunAlt);
  const { lat, lon } = cfg.observer;
  const lst = localSiderealTime(date, lon);
  const px = (p: [number, number]): [number, number] => [p[0] * w, p[1] * h];
  const sc: Scene = { stars: [], lines: [], labels: [], bodies: [], ground: [], horizon: [], obstructions: [] };

  const placed = new Map<number, [number, number] | null>();
  for (const s of data.stars) {
    const [ra, dec] = precess(s[0], s[1], date);
    const { alt, az } = raDecToAltAz(ra, dec, lat, lst);
    const p = alt > 0 ? project(vg, az, alt) : null;
    placed.set(s[3], p);
    if (p && inside(p)) sc.stars.push({ x: p[0] * w, y: p[1] * h, r: starRadius(s[2]), a: vis });
  }
  for (const [a, b] of data.lines) {
    const qa = placed.get(a);
    const qb = placed.get(b);
    if (qa && qb && (inside(qa, 0.3) || inside(qb, 0.3))) {
      sc.lines.push({ x1: qa[0] * w, y1: qa[1] * h, x2: qb[0] * w, y2: qb[1] * h, a: vis });
    }
  }
  for (const c of data.constellations) {
    const pts = c.hips
      .map((hp) => placed.get(hp) ?? null)
      .filter((p): p is [number, number] => inside(p, 0));
    if (pts.length < 2) continue;
    const x = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const y = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    sc.labels.push({ x: x * w, y: y * h, text: c.name, a: vis });
  }

  const infos = new Map<string, ObjectInfo>();
  for (const [id, s] of Object.entries(SOLAR)) if (bodies[id]) infos.set(id, { id, ...s, entity_id: null });
  for (const o of cfg.objects) infos.set(o.id, { ...infos.get(o.id), ...o });
  for (const o of infos.values()) {
    let alt: number;
    let az: number;
    if (o.kind === "star") {
      const st = NAMED[o.id];
      if (!st) continue;
      const [ra, dec] = precess(st[0], st[1], date);
      ({ alt, az } = raDecToAltAz(ra, dec, lat, lst));
    } else {
      const aa = bodies[o.id];
      if (!aa) continue;
      [alt, az] = aa;
    }
    if (alt <= 0) continue;
    const p = project(vg, az, alt);
    if (!p || !inside(p, 0.1)) continue;
    const a = o.kind === "sun" || o.kind === "moon" ? 1 : vis;
    sc.bodies.push({ ...o, x: p[0] * w, y: p[1] * h, alt, az, a });
  }

  for (let d = -90; d <= 90; d += 2) {
    const p = project(vg, view.az + d, 0);
    if (p && p[0] > -0.5 && p[0] < 1.5) sc.horizon.push(px(p));
  }
  if (sc.horizon.length >= 2) {
    const first = sc.horizon[0];
    const last = sc.horizon[sc.horizon.length - 1];
    sc.ground = [...sc.horizon, [last[0], h * 3], [first[0], h * 3]];
  } else if (view.alt < 0) {
    sc.ground = [[0, 0], [w, 0], [w, h], [0, h]];
  }

  sc.obstructions = cfg.obstructions
    .map((poly) => skyToPolygon(vg, poly).map(px))
    .filter((poly) => poly.length >= 3);
  return sc;
}
