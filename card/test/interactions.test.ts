import { describe, expect, it } from "vitest";
import { moonPath } from "../src/body-render";
import { HALF_RANGE, POINTS, bodiesAt, rangeTimes, sliderIndex } from "../src/sky-data";

describe("moonPath", () => {
  it("new moon is empty, full is a circle", () => {
    expect(moonPath(0, 0)).toBe("");
    expect(moonPath(1, 0.5)).toContain("A1,1 0 1 1");
  });
  it("waxing and waning crescents are mirrored", () => {
    const waxing = moonPath(0.25, 0.2);
    const waning = moonPath(0.25, 0.8);
    expect(waxing).toContain("A1,1 0 0 1 0,1");
    expect(waning).toContain("A1,1 0 0 0 0,1");
    expect(waxing).not.toBe(waning);
  });
  it("gibbous terminator bulges the other way than crescent", () => {
    expect(moonPath(0.25, 0.2)).not.toBe(moonPath(0.75, 0.2));
  });
});

describe("time range", () => {
  it("covers 145 points and +3h maps to a requested time", () => {
    const now = new Date("2026-01-15T20:00:00Z");
    const times = rangeTimes(now);
    expect(times.length).toBe(POINTS);
    const i = sliderIndex(180);
    expect(i).toBe(HALF_RANGE + 18);
    expect(new Date(times[i]).getTime()).toBe(now.getTime() + 3 * 3600000);
  });
  it("clamps the slider index", () => {
    expect(sliderIndex(10000)).toBe(POINTS - 1);
    expect(sliderIndex(-10000)).toBe(0);
  });
  it("bodiesAt picks the index", () => {
    const sky = { objects: { venus: [[1, 2], [3, 4]] as [number, number][] }, sun_alt: [], moon: { illumination: [], phase: [] } };
    expect(bodiesAt(sky, 1).venus).toEqual([3, 4]);
  });
});
