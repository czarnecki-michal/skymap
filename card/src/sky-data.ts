import type { BodyPoints } from "./scene";

export const STEP_MIN = 10;
export const HALF_RANGE = 72; // ±12 h in 10 min steps -> 145 points
export const POINTS = 2 * HALF_RANGE + 1;

export interface SkyReply {
  objects: Record<string, [number, number][]>;
  sun_alt: number[];
  moon: { illumination: number[]; phase: number[] };
}

/** 145 ISO times from now-12h to now+12h. */
export function rangeTimes(now: Date): string[] {
  return Array.from({ length: POINTS }, (_, i) =>
    new Date(now.getTime() + (i - HALF_RANGE) * STEP_MIN * 60000).toISOString(),
  );
}

export function sliderIndex(offsetMin: number): number {
  const i = Math.round(offsetMin / STEP_MIN) + HALF_RANGE;
  return Math.min(POINTS - 1, Math.max(0, i));
}

export function bodiesAt(sky: SkyReply, index: number): BodyPoints {
  const out: BodyPoints = {};
  for (const [id, pts] of Object.entries(sky.objects)) out[id] = pts[index];
  return out;
}
