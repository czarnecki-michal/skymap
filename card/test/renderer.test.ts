import { describe, expect, it } from "vitest";
import { drawSky, hitTest } from "../src/renderer";
import type { Scene } from "../src/scene";

const scene: Scene = {
  stars: [{ x: 10, y: 10, r: 2.5, a: 1 }, { x: 20, y: 20, r: 1, a: 0.12 }],
  lines: [{ x1: 0, y1: 0, x2: 5, y2: 5, a: 1 }],
  labels: [],
  bodies: [
    { id: "venus", name: "Wenus", kind: "planet", entity_id: null, x: 100, y: 100, alt: 20, az: 130, a: 1 },
    { id: "moon", name: "Księżyc", kind: "moon", entity_id: null, x: 200, y: 100, alt: 30, az: 140, a: 1 },
  ],
  ground: [], horizon: [], obstructions: [],
};

function mockCtx() {
  const calls: Record<string, number> = {};
  const grad = { addColorStop() {} };
  return {
    calls,
    ctx: new Proxy({} as any, {
      get(_t, k: string) {
        if (k === "createLinearGradient" || k === "createRadialGradient") return () => grad;
        return (..._a: unknown[]) => { calls[k] = (calls[k] ?? 0) + 1; };
      },
      set() { return true; },
    }),
  };
}

describe("renderer", () => {
  it("draws every visible star", () => {
    const { ctx, calls } = mockCtx();
    drawSky(ctx, scene, { top: "#000", bottom: "#111" }, 300, 200);
    expect(calls.arc).toBeGreaterThanOrEqual(scene.stars.length);
    expect(calls.fillRect).toBe(1);
  });
  it("hit-tests the nearest body within the radius", () => {
    expect(hitTest(scene, 105, 104)).toBe("venus");
    expect(hitTest(scene, 196, 100)).toBe("moon");
    expect(hitTest(scene, 150, 150)).toBeNull();
  });
});
