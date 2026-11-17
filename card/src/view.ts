import type { WindowGeometry } from "./projection";

/** What the card is looking at (independent from the configured window). */
export interface View {
  az: number;
  alt: number;
  hfov: number;
  roll?: number; // only used by the wizard preview (window geometry with roll)
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const wrap360 = (x: number) => ((x % 360) + 360) % 360;

export const MIN_FOV = 20;
export const MAX_FOV = 120;

export function viewGeometry(v: View, aspect: number): WindowGeometry {
  return { az_center: v.az, alt_center: v.alt, hfov: v.hfov, aspect, roll: v.roll ?? 0 };
}

export function fromWindow(g: WindowGeometry): View {
  return { az: g.az_center, alt: g.alt_center, hfov: clamp(g.hfov, MIN_FOV, MAX_FOV) };
}

/** Dragging right (dx>0) turns left; dragging down looks higher. */
export function panView(v: View, dx: number, dy: number, pxPerDeg: number): View {
  return { ...v, az: wrap360(v.az - dx / pxPerDeg), alt: clamp(v.alt + dy / pxPerDeg, -30, 89) };
}

export function zoomView(v: View, factor: number): View {
  return { ...v, hfov: clamp(v.hfov * factor, MIN_FOV, MAX_FOV) };
}

/** 1 = full night sky, 0.12 = barely visible in daylight. */
export function skyVisibility(sunAlt: number): number {
  if (sunAlt <= -18) return 1;
  if (sunAlt >= 0) return 0.12;
  return 0.12 + (0.88 * -sunAlt) / 18;
}

type RGB = [number, number, number];
const hex = (c: RGB) => "#" + c.map((x) => Math.round(x).toString(16).padStart(2, "0")).join("");
const parse = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const mix = (a: string, b: string, t: number) => {
  const A = parse(a);
  const B = parse(b);
  return hex(A.map((x, i) => x + (B[i] - x) * t) as RGB);
};

// keyframes by Sun altitude: day, twilight, night
const KEYS: [number, string, string][] = [
  [5, "#4a86d0", "#a9cdf0"],
  [-6, "#1e2f63", "#e08a5a"],
  [-18, "#050816", "#1b2550"],
];

export function skyColors(sunAlt: number): { top: string; bottom: string } {
  if (sunAlt >= KEYS[0][0]) return { top: KEYS[0][1], bottom: KEYS[0][2] };
  if (sunAlt <= KEYS[2][0]) return { top: KEYS[2][1], bottom: KEYS[2][2] };
  const [hi, lo] = sunAlt >= KEYS[1][0] ? [KEYS[0], KEYS[1]] : [KEYS[1], KEYS[2]];
  const t = (hi[0] - sunAlt) / (hi[0] - lo[0]);
  return { top: mix(hi[1], lo[1], t), bottom: mix(hi[2], lo[2], t) };
}
