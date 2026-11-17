import { describe, expect, it } from "vitest";
import { buildScene } from "../src/scene";

const cfg: any = {
  geometry: { az_center: 135, alt_center: 30, hfov: 90, aspect: 4 / 3, roll: 0 },
  obstructions: [], twilight: -12, observer: { lat: 53.4, lon: 14.5, elevation: 10 },
  objects: [
    { id: "venus", name: "Wenus", kind: "planet", entity_id: null },
    { id: "moon", name: "Księżyc", kind: "moon", entity_id: null },
    { id: "sirius", name: "Syriusz", kind: "star", entity_id: null },
  ],
};
const bodies = { venus: [30, 135] as [number, number], moon: [30, 140] as [number, number] };
const when = new Date("2026-01-15T12:00:00Z");

describe("daytime", () => {
  it("hides stars, constellation lines, planets and named stars when the Sun is above the twilight limit", () => {
    const day = buildScene(cfg, bodies, when, 1000, 750, 30);
    expect(day.stars.length).toBe(0);
    expect(day.lines.length).toBe(0);
    expect(day.bodies.map((b) => b.id)).toEqual(["moon"]);
  });
  it("shows them at night", () => {
    const night = buildScene(cfg, bodies, when, 1000, 750, -30);
    expect(night.stars.length).toBeGreaterThan(0);
    expect(night.bodies.map((b) => b.id)).toContain("venus");
  });
});
