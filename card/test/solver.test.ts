import { describe, expect, it } from "vitest";
import { project } from "../src/projection";
import { solveGeometry, type Match } from "../src/solver";

const truth = { az_center: 140, alt_center: 20, hfov: 72, aspect: 4 / 3, roll: 4 };
const start = { az_center: 120, alt_center: 10, hfov: 67, aspect: 4 / 3, roll: 0 };
const match = (g: typeof truth, az: number, alt: number): Match => {
  const [x, y] = project(g, az, alt)!;
  return { az, alt, x, y };
};
const angleDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe("solveGeometry", () => {
  it("recovers all parameters from two matches", () => {
    const r = solveGeometry(start, [match(truth, 125, 30), match(truth, 155, 12)]);
    if ("fail" in r) throw new Error(r.fail);
    expect(angleDiff(r.geometry.az_center, 140)).toBeLessThan(0.1);
    expect(Math.abs(r.geometry.alt_center - 20)).toBeLessThan(0.1);
    expect(Math.abs(r.geometry.hfov - 72)).toBeLessThan(0.1);
    expect(Math.abs(r.geometry.roll - 4)).toBeLessThan(0.1);
  });
  it("recovers direction from one match when fov and roll are known", () => {
    const g = { ...truth };
    const r = solveGeometry({ ...g, az_center: 125, alt_center: 12 }, [match(g, 150, 28)]);
    if ("fail" in r) throw new Error(r.fail);
    expect(angleDiff(r.geometry.az_center, 140)).toBeLessThan(0.1);
    expect(Math.abs(r.geometry.alt_center - 20)).toBeLessThan(0.1);
  });
  it("refuses two matches at the same place", () => {
    const m = match(truth, 140, 20);
    expect("fail" in solveGeometry(start, [m, { ...m }])).toBe(true);
  });
  it("works across north", () => {
    const north = { ...truth, az_center: 355 };
    const r = solveGeometry({ ...start, az_center: 340 }, [match(north, 345, 25), match(north, 10, 15)]);
    if ("fail" in r) throw new Error(r.fail);
    expect(angleDiff(r.geometry.az_center, 355)).toBeLessThan(0.1);
  });
});
