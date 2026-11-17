import type { WindowGeometry } from "./projection";

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const wrap360 = (x: number) => ((x % 360) + 360) % 360;

/** Dragging the map right (dx>0) means the camera looks further left; dragging down means looking higher. */
export function applyDrag(g: WindowGeometry, dx: number, dy: number, pxPerDeg: number): WindowGeometry {
  return {
    ...g,
    az_center: wrap360(g.az_center - dx / pxPerDeg),
    alt_center: clamp(g.alt_center + dy / pxPerDeg, -10, 90),
  };
}

export function applyZoom(g: WindowGeometry, factor: number): WindowGeometry {
  return { ...g, hfov: clamp(g.hfov * factor, 10, 120) };
}

export function applyRoll(g: WindowGeometry, roll: number): WindowGeometry {
  return { ...g, roll: clamp(roll, -180, 180) };
}
