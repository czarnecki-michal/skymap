import { describe, expect, it } from "vitest";
import { buildScene } from "../src/scene";

const cfg: any = {
  geometry: { az_center: 135, alt_center: 30, hfov: 90, aspect: 4 / 3, roll: 0 },
  obstructions: [[[130, 0], [140, 0], [140, 20], [130, 20]]],
  twilight: -12,
  observer: { lat: 53.4, lon: 14.5, elevation: 10 },
  objects: [
    { id: "venus", name: "Wenus", kind: "planet", entity_id: "sensor.mapa_nieba_wenus" },
    { id: "sirius", name: "Syriusz", kind: "star", entity_id: null },
  ],
};
const bodies = { venus: [30, 135] as [number, number], moon: [30, 140] as [number, number] };
const when = new Date("2026-01-15T21:00:00Z");
const view = { az: 135, alt: 30, hfov: 90 };

describe("scene", () => {
  it("keeps stars and planets faint in daylight, Moon full", () => {
    const s = buildScene(cfg, bodies, when, view, 1000, 750, 30);
    expect(s.stars.length).toBeGreaterThan(0);
    expect(s.stars[0].a).toBeCloseTo(0.12);
    expect(s.bodies.find((b) => b.id === "venus")!.a).toBeCloseTo(0.12);
    const moon = s.bodies.find((b) => b.id === "moon")!;
    expect(moon.a).toBe(1);
    expect(moon.name).toBe("Księżyc");
  });
  it("is fully visible at night", () => {
    const s = buildScene(cfg, bodies, when, view, 1000, 750, -30);
    expect(s.stars.every((x) => x.a === 1)).toBe(true);
  });
  it("labels Orion when looking at it in a winter night", () => {
    const s = buildScene(cfg, bodies, when, { az: 175, alt: 30, hfov: 90 }, 1000, 750, -30);
    expect(s.labels.map((l) => l.text)).toContain("Orion");
  });
  it("draws ground when looking down and projects obstructions", () => {
    const s = buildScene(cfg, bodies, when, { az: 135, alt: -20, hfov: 67 }, 1000, 750, -30);
    expect(s.ground.length).toBeGreaterThan(2);
    const s2 = buildScene(cfg, bodies, when, view, 1000, 750, -30);
    expect(s2.obstructions.length).toBe(1);
    expect(s2.obstructions[0].length).toBe(4);
  });
});

describe("star names", () => {
  it("are Polish for every named star", async () => {
    const { NAMED, starName } = await import("../src/scene");
    expect(starName("capella")).toBe("Kapella");
    expect(starName("betelgeuse")).toBe("Betelgeza");
    for (const id of Object.keys(NAMED)) expect(starName(id)).not.toBe(id);
  });
});
