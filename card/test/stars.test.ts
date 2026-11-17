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

describe("constellations", () => {
  const cons = (data as any).constellations as { id: string; name: string; hips: number[] }[];
  it("has Polish names and at least two catalogue stars each", () => {
    expect(cons.length).toBeGreaterThanOrEqual(80);
    for (const c of cons) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.hips.filter((h) => hips.has(h)).length).toBeGreaterThanOrEqual(2);
    }
  });
  it("maps known ids", () => {
    const by = new Map(cons.map((c) => [c.id, c.name]));
    expect(by.get("Ori")).toBe("Orion");
    expect(by.get("UMa")).toBe("Wielka Niedźwiedzica");
  });
});
