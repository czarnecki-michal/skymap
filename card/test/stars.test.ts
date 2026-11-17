import { describe, expect, it } from "vitest";
import data from "../src/data/stars.json";

const hips = new Set((data.stars as number[][]).map((s) => s[3]));

describe("star catalogue", () => {
  it("has enough stars incl. Sirius and Polaris", () => {
    expect(data.stars.length).toBeGreaterThanOrEqual(1500);
    expect(hips.has(32349)).toBe(true);
    expect(hips.has(11767)).toBe(true);
  });
  it("every constellation line points at an existing star", () => {
    expect(data.lines.length).toBeGreaterThan(300);
    for (const [a, b] of data.lines as number[][]) {
      expect(hips.has(a) && hips.has(b)).toBe(true);
    }
  });
});
