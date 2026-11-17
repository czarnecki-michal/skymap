/** SVG path (unit circle, centre 0,0) of the lit part of the Moon; "" when new. */
export function moonPath(illumination: number, phase: number): string {
  if (illumination < 0.01) return "";
  if (illumination > 0.99) return "M0,-1A1,1 0 1 1 0,1A1,1 0 1 1 0,-1Z";
  const rx = Math.abs(1 - 2 * illumination).toFixed(3);
  const waxing = phase < 0.5;
  const crescent = illumination < 0.5;
  const limbSweep = waxing ? 1 : 0;
  // terminator: bottom -> top; bulges toward the lit side for a crescent, away for a gibbous
  const termSweep = waxing === crescent ? 0 : 1;
  return `M0,-1A1,1 0 0 ${limbSweep} 0,1A${rx},1 0 0 ${termSweep} 0,-1Z`;
}

export const STATE_LABELS: Record<string, string> = {
  visible: "widoczny",
  obstructed: "zasłonięty",
  out_of_frame: "poza kadrem",
  hidden: "niewidoczny",
};
