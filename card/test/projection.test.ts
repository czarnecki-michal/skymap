import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { project, unproject } from "../src/projection";

const vectors = JSON.parse(readFileSync("../tests/fixtures/projection_vectors.json", "utf-8"));

describe("projection parity with Python", () => {
  for (const [i, v] of vectors.entries()) {
    it(`vector ${i}`, () => {
      const p = project(v.geometry, v.az, v.alt);
      if (v.x === null) expect(p).toBeNull();
      else {
        expect(p![0]).toBeCloseTo(v.x, 6);
        expect(p![1]).toBeCloseTo(v.y, 6);
      }
    });
  }
  it("round trips with roll and portrait aspect", () => {
    const g = { az_center: 200, alt_center: 30, hfov: 50, aspect: 0.75, roll: 15 };
    const [az, alt] = unproject(g, 0.2, 0.7);
    const p = project(g, az, alt)!;
    expect(p[0]).toBeCloseTo(0.2, 6);
    expect(p[1]).toBeCloseTo(0.7, 6);
  });
});
