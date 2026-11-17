import { describe, expect, it } from "vitest";
import { applyH, homography, photoTransform } from "../src/homography";
import { project, unproject } from "../src/projection";
import { viewGeometry } from "../src/view";

const win = { az_center: 135, alt_center: 15, hfov: 67, aspect: 4 / 3, roll: 3 };
const W = 400;
const H = 300;

describe("homography", () => {
  it("maps the four source points onto the destination", () => {
    const src: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const dst: [number, number][] = [[10, 5], [90, 12], [85, 70], [3, 60]];
    const h = homography(src, dst);
    src.forEach((p, i) => {
      const q = applyH(h, p[0], p[1]);
      expect(q[0]).toBeCloseTo(dst[i][0], 9);
      expect(q[1]).toBeCloseTo(dst[i][1], 9);
    });
  });
});

describe("photoTransform", () => {
  it("is the identity when the view equals the window (no roll)", () => {
    const m = photoTransform({ ...win, roll: 0 }, { az: 135, alt: 15, hfov: 67 }, W, H)!;
    const nums = m.slice(9, -1).split(",").map(Number);
    expect(nums.map((x) => +x.toFixed(6) || 0)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });
  it("puts the photo centre where the projection says after panning", () => {
    const view = { az: 125, alt: 20, hfov: 80 };
    const m = photoTransform(win, view, W, H)!;
    const n = m.slice(9, -1).split(",").map(Number);
    const h = [n[0], n[4], n[12], n[1], n[5], n[13], n[3], n[7], 1];
    const got = applyH(h, W / 2, H / 2);
    const [az, alt] = unproject(win, 0.5, 0.5);
    const exp = project(viewGeometry(view, win.aspect), az, alt)!;
    expect(got[0]).toBeCloseTo(exp[0] * W, 6);
    expect(got[1]).toBeCloseTo(exp[1] * H, 6);
  });
  it("hides the photo when it is behind the viewer", () => {
    expect(photoTransform(win, { az: 315, alt: 15, hfov: 67 }, W, H)).toBeNull();
  });
});

describe("photoTransform with a clamped stage", () => {
  it("uses the container aspect for the view", () => {
    const view = { az: 130, alt: 18, hfov: 70 };
    const w = 500, h = 560; // stage clamped by max-height, aspect != window aspect
    const n = photoTransform(win, view, w, h)!.slice(9, -1).split(",").map(Number);
    const hm = [n[0], n[4], n[12], n[1], n[5], n[13], n[3], n[7], 1];
    const [az, alt] = unproject(win, 0.5, 0.5);
    const exp = project(viewGeometry(view, w / h), az, alt)!;
    const got = applyH(hm, w / 2, h / 2);
    expect(got[0]).toBeCloseTo(exp[0] * w, 6);
    expect(got[1]).toBeCloseTo(exp[1] * h, 6);
  });
});
