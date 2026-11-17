import { describe, expect, it, vi } from "vitest";
import { project } from "../src/projection";
import {
  addMatch, canNext, horizonToAlt, initWizard, next, savePayload, setPhoto, setPhotoTime, skipPhoto,
} from "../src/wizard";

const data: any = {
  geometry: { az_center: 120, alt_center: 10, hfov: 67, aspect: 4 / 3, roll: 0 },
  obstructions: [], twilight: -12, observer: { lat: 53.4, lon: 14.5, elevation: 10 }, objects: [],
  photo: null, photo_opacity: 0.6,
};
const truth = { az_center: 140, alt_center: 20, hfov: 72, aspect: 4 / 3, roll: 4 };
const m = (az: number, alt: number) => {
  const [x, y] = project(truth, az, alt)!;
  return { az, alt, x, y };
};

describe("wizard state", () => {
  it("without a photo goes straight to the compass step", () => {
    let s = skipPhoto(initWizard(data, ""));
    s = next(s);
    expect(s.step).toBe("compass");
    expect(s.method).toBe("compass");
  });
  it("a photo without EXIF time blocks until the time is given", () => {
    let s = setPhoto(initWizard(data, ""), { blobUrl: "blob:x", aspect: 1.5, exif: null, timeZone: "Europe/Warsaw", blob: new Blob() });
    expect(s.photo.needsTime).toBe(true);
    expect(canNext(s)).toBe(false);
    s = setPhotoTime(s, new Date("2026-01-15T20:30:00Z"));
    expect(canNext(s)).toBe(true);
    expect(s.geometry.aspect).toBe(1.5);
  });
  it("reads the time from EXIF", () => {
    const s = setPhoto(initWizard(data, ""), {
      blobUrl: "blob:x", aspect: 4 / 3, exif: { local: "2026:01:15 21:30:00", offset: null }, timeZone: "Europe/Warsaw", blob: new Blob(),
    });
    expect(s.photo.time!.toISOString()).toBe("2026-01-15T20:30:00.000Z");
    expect(canNext(s)).toBe(true);
  });
  it("two matches update the geometry through the solver", () => {
    let s = initWizard(data, "");
    s = addMatch(s, m(125, 30));
    s = addMatch(s, m(155, 12));
    expect(s.error).toBe("");
    expect(Math.abs(s.geometry.hfov - 72)).toBeLessThan(0.1);
    expect(s.matches.length).toBe(2);
  });
  it("a solver failure keeps the geometry and reports the error", () => {
    let s = initWizard(data, "");
    s = addMatch(s, m(125, 30));
    const before = s.geometry;
    s = addMatch(s, m(125, 30));
    expect(s.error).not.toBe("");
    expect(s.geometry).toEqual(before);
    expect(s.matches.length).toBe(1);
  });
  it("horizon line position sets the frame altitude", () => {
    expect(horizonToAlt({ ...data.geometry }, 0.5)).toBeCloseTo(0);
    expect(horizonToAlt({ ...data.geometry }, 0.8)).toBeGreaterThan(0);
  });
  it("save payload has sky polygons (vertices only) and the opacity", () => {
    let s = initWizard(data, "");
    s = { ...s, polys: [[[0.2, 0.2], [0.4, 0.2], [0.4, 0.6]]], opacity: 0.45 };
    const p = savePayload(s);
    expect(p.obstructions[0].length).toBe(3);
    expect(p.obstructions[0][0][0]).toBeGreaterThan(0);
    expect(p.photo_opacity).toBe(0.45);
    expect(p.geometry).toEqual(s.geometry);
  });
});

describe("wizard UI save", () => {
  it("uploads only a new photo, then saves the geometry", async () => {
    const { MapaNiebaWizard } = await import("../src/wizard-ui");
    const el = new MapaNiebaWizard();
    const fetchWithAuth = vi.fn(async () => ({ ok: true, json: async () => ({ version: 1 }) }));
    const callWS = vi.fn(async () => ({}));
    el.hass = { callWS, fetchWithAuth, config: { time_zone: "Europe/Warsaw" } };
    el.data = data;
    el.state = initWizard(data, "");
    await el._save();
    expect(fetchWithAuth).not.toHaveBeenCalled();
    expect(callWS.mock.calls[0][0].type).toBe("mapa_nieba/save_geometry");

    el.state = setPhoto(initWizard(data, ""), { blobUrl: "blob:x", aspect: 1.5, exif: null, timeZone: "Europe/Warsaw", blob: new Blob(["x"], { type: "image/jpeg" }) });
    await el._save();
    expect(fetchWithAuth).toHaveBeenCalledTimes(1);
    expect(fetchWithAuth.mock.calls[0][0]).toBe("/api/mapa_nieba/photo");
  });
});
