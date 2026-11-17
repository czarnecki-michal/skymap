import { describe, expect, it, vi } from "vitest";
import { MapaNiebaCard } from "../src/mapa-nieba-card";

const cfg = {
  geometry: { az_center: 135, alt_center: 15, hfov: 67, aspect: 4 / 3, roll: 0 },
  obstructions: [], twilight: -12, observer: { lat: 53.4, lon: 14.5, elevation: 10 },
  objects: [{ id: "venus", name: "Wenus", kind: "planet", entity_id: "sensor.mapa_nieba_wenus" }],
};

function make(isAdmin: boolean) {
  const el = new MapaNiebaCard();
  el.setConfig({ photo: "/local/balkon.jpg" });
  const callWS = vi.fn(async (msg: any) => {
    if (msg.type === "mapa_nieba/config") return cfg;
    if (msg.type === "mapa_nieba/sky") return { objects: { venus: msg.times.map(() => [30, 140]) }, sun_alt: [], moon: { illumination: [], phase: [] } };
    return { saved: true };
  });
  el.hass = { callWS, user: { is_admin: isAdmin }, states: {} };
  return { el, callWS };
}

describe("card", () => {
  it("requires photo", () => {
    expect(() => new MapaNiebaCard().setConfig({})).toThrow(/photo/);
  });
  it("defaults photo_opacity to 0.5 and registers in customCards", () => {
    const el = new MapaNiebaCard();
    el.setConfig({ photo: "/x.jpg" });
    expect(el._config?.photo_opacity).toBe(0.5);
    expect((window as any).customCards.some((c: any) => c.type === "mapa-nieba-card")).toBe(true);
  });
  it("shows the calibrate button only to admins", async () => {
    for (const [admin, expected] of [[true, true], [false, false]] as const) {
      const { el } = make(admin);
      await el._load();
      document.body.appendChild(el);
      await el.updateComplete;
      const has = [...el.shadowRoot!.querySelectorAll("button")].some((b) => b.textContent?.includes("Kalibruj"));
      expect(has).toBe(expected);
      el.remove();
    }
  });
  it("save sends save_geometry with the draft geometry", async () => {
    const { el, callWS } = make(true);
    await el._load();
    el._startCalibration();
    await el._save();
    const call = callWS.mock.calls.map((c) => c[0]).find((m: any) => m.type === "mapa_nieba/save_geometry");
    expect(call.geometry.az_center).toBe(135);
    expect(el._calibrating).toBe(false);
  });
});
