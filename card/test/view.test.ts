import { describe, expect, it } from "vitest";
import { fromWindow, panView, skyColors, skyVisibility, viewGeometry, zoomView } from "../src/view";

const v = { az: 135, alt: 15, hfov: 67 };

describe("view", () => {
  it("pans and wraps azimuth both ways", () => {
    expect(panView({ ...v, az: 1 }, 20, 0, 10).az).toBeCloseTo(359);
    expect(panView({ ...v, az: 359 }, -20, 0, 10).az).toBeCloseTo(1);
  });
  it("dragging down looks higher and is limited below the zenith", () => {
    expect(panView(v, 0, 10, 10).alt).toBeCloseTo(16);
    expect(panView(v, 0, 10000, 10).alt).toBe(89);
    expect(panView(v, 0, -10000, 10).alt).toBe(-30);
  });
  it("zoom is clamped to 20..120", () => {
    expect(zoomView(v, 100).hfov).toBe(120);
    expect(zoomView(v, 0.01).hfov).toBe(20);
  });
  it("converts to and from window geometry", () => {
    const g = viewGeometry(v, 1.5);
    expect(g).toEqual({ az_center: 135, alt_center: 15, hfov: 67, aspect: 1.5, roll: 0 });
    expect(fromWindow({ ...g, roll: 5 })).toEqual(v);
  });
});

describe("sky appearance", () => {
  it("visibility ramps from day to night", () => {
    expect(skyVisibility(-30)).toBe(1);
    expect(skyVisibility(10)).toBeCloseTo(0.12);
    expect(skyVisibility(-9)).toBeCloseTo(0.56);
  });
  it("colors differ by day and night", () => {
    expect(skyColors(20)).not.toEqual(skyColors(-30));
    expect(skyColors(-30).top).toBe("#050816");
  });
});
