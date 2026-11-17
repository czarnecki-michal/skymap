import { describe, expect, it } from "vitest";
import { polygonToSky, skyToPolygon } from "../src/obstructions";

const g = { az_center: 0, alt_center: 10, hfov: 67, aspect: 4 / 3, roll: 0 };
const rect: [number, number][] = [[0.05, 0.05], [0.95, 0.05], [0.95, 0.95], [0.05, 0.95]];

describe("obstruction polygons", () => {
  it("corners at north wrap into 0..360 on both sides of 0", () => {
    const sky = polygonToSky(g, rect);
    expect(sky.length).toBe(32);
    expect(sky.every(([az]) => az >= 0 && az < 360)).toBe(true);
    expect(sky.some(([az]) => az > 330)).toBe(true);
    expect(sky.some(([az]) => az < 30)).toBe(true);
  });
  it("round trip keeps the original vertices", () => {
    const back = skyToPolygon(g, polygonToSky(g, rect));
    rect.forEach(([x, y], k) => {
      expect(back[k * 8][0]).toBeCloseTo(x, 6);
      expect(back[k * 8][1]).toBeCloseTo(y, 6);
    });
  });
});
