import { describe, expect, it, vi } from "vitest";
import { MapaNiebaCard } from "../src/mapa-nieba-card";

const cfg = {
  geometry: { az_center: 135, alt_center: 15, hfov: 67, aspect: 4 / 3, roll: 0 },
  obstructions: [], twilight: -12, observer: { lat: 53.4, lon: 14.5, elevation: 10 },
  objects: [{ id: "venus", name: "Wenus", kind: "planet", entity_id: "sensor.mapa_nieba_wenus" }],
  photo: { url: "/api/mapa_nieba/photo", version: 7 }, photo_opacity: 0.6,
};

function make(isAdmin: boolean, yaml: any = {}) {
  const el = new MapaNiebaCard();
  el.setConfig(yaml);
  const callWS = vi.fn(async (msg: any) => {
    if (msg.type === "mapa_nieba/config") return cfg;
    if (msg.type === "mapa_nieba/sky")
      return { objects: { venus: msg.times.map(() => [30, 140]) }, sun_alt: msg.times.map(() => -30),
               moon: { illumination: [], phase: [] }, rises: { sun: null, moon: null } };
    if (msg.type === "auth/sign_path") return { path: msg.path + "&authSig=x" };
    return {};
  });
  el.hass = { callWS, user: { is_admin: isAdmin }, states: {}, config: { time_zone: "Europe/Warsaw" } };
  return { el, callWS };
}

async function mounted(el: MapaNiebaCard) {
  await el._load();
  document.body.appendChild(el);
  await el.updateComplete;
  return el.shadowRoot!;
}

describe("card v2", () => {
  it("works without any options and offers a stub config", () => {
    expect(MapaNiebaCard.getStubConfig()).toEqual({});
    expect(() => new MapaNiebaCard().setConfig({})).not.toThrow();
  });
  it("keeps the bar and the recentre button inside the map", async () => {
    const { el } = make(true);
    const root = await mounted(el);
    const stage = root.querySelector(".stage")!;
    expect(stage.querySelector(".bar")).not.toBeNull();
    expect(stage.querySelector(".recenter")).not.toBeNull();
    el.remove();
  });
  it("shows the wizard button only to admins", async () => {
    for (const [admin, expected] of [[true, true], [false, false]] as const) {
      const { el } = make(admin);
      const root = await mounted(el);
      expect(!!root.querySelector(".wizard-btn")).toBe(expected);
      el.remove();
    }
  });
  it("recentre restores the window direction after panning", async () => {
    const { el } = make(true);
    await el._load();
    el._pan(200, -50, 10);
    expect(el._view.az).not.toBeCloseTo(135);
    el._recenter();
    expect(el._view).toEqual({ az: 135, alt: 15, hfov: 67 });
  });
  it("play runs to the end of the range and stops", async () => {
    const { el } = make(true);
    await el._load();
    el._togglePlay();
    expect(el._playing).toBe(true);
    el._advance(30000);
    expect(el._offset).toBe(720);
    expect(el._playing).toBe(false);
  });
  it("YAML photo wins over the integration photo", async () => {
    const a = make(true, { photo: "/local/balkon.jpg" });
    await a.el._load();
    expect(a.el._photoSrc).toBe("/local/balkon.jpg");
    const b = make(true);
    await b.el._load();
    expect(b.el._photoSrc).toContain("/api/mapa_nieba/photo?v=7");
  });
  it("hass-only updates do not re-render once loaded", async () => {
    const { el } = make(true);
    await el._load();
    expect(el.shouldUpdate(new Map([["hass", 1]]))).toBe(false);
    expect(el.shouldUpdate(new Map([["_offset", 1]]))).toBe(true);
  });
  it("the wizard button opens the wizard", async () => {
    const { el } = make(true);
    const root = await mounted(el);
    (root.querySelector(".wizard-btn") as HTMLButtonElement).click();
    await el.updateComplete;
    expect(root.querySelector("mapa-nieba-wizard")).not.toBeNull();
    el.remove();
  });
});
