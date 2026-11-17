import { describe, expect, it } from "vitest";
import { applyDrag, applyZoom } from "../src/calibration";

const g = { az_center: 135, alt_center: 15, hfov: 67, aspect: 4 / 3, roll: 0 };

describe("calibration", () => {
  it("dragging 1 degree right turns the camera 1 degree left", () => {
    expect(applyDrag(g, 10, 0, 10).az_center).toBeCloseTo(134);
  });
  it("dragging down looks higher", () => {
    expect(applyDrag(g, 0, 10, 10).alt_center).toBeCloseTo(16);
  });
  it("azimuth wraps into 0..360", () => {
    expect(applyDrag({ ...g, az_center: 0.5 }, 10, 0, 10).az_center).toBeCloseTo(359.5);
    expect(applyDrag({ ...g, az_center: 359.5 }, -10, 0, 10).az_center).toBeCloseTo(0.5);
  });
  it("zoom is clamped to 10..120", () => {
    expect(applyZoom(g, 100).hfov).toBe(120);
    expect(applyZoom(g, 0.001).hfov).toBe(10);
  });
});
