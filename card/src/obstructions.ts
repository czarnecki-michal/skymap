import { project, unproject, type WindowGeometry } from "./projection";

export type Poly = [number, number][];

/** Image polygon (normalised x,y) -> az/alt polygon; every edge is split into `subdivide` pieces. */
export function polygonToSky(g: WindowGeometry, pts: Poly, subdivide = 8): Poly {
  const out: Poly = [];
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    for (let k = 0; k < subdivide; k++) {
      const t = k / subdivide;
      out.push(unproject(g, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t));
    }
  }
  return out;
}

/** az/alt polygon -> image polygon (vertices behind the camera are dropped). */
export function skyToPolygon(g: WindowGeometry, poly: Poly): Poly {
  const out: Poly = [];
  for (const [az, alt] of poly) {
    const p = project(g, az, alt);
    if (p) out.push(p);
  }
  return out;
}
