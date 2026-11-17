import { project, unproject, type WindowGeometry } from "./projection";
import { viewGeometry, type View } from "./view";

type P = [number, number];

/** 3x3 homography (row-major, h33 = 1) mapping 4 src points onto 4 dst points. */
export function homography(src: P[], dst: P[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  return [...solve(A, b), 1];
}

/** Gaussian elimination with partial pivoting. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

export function applyH(h: number[], x: number, y: number): P {
  const w = h[6] * x + h[7] * y + h[8];
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
}

/**
 * CSS matrix3d placing a w x h <img> (transform-origin 0 0) where the window photo
 * appears in `view`. Null when any corner is behind the viewer.
 */
export function photoTransform(win: WindowGeometry, view: View, w: number, h: number): string | null {
  const vg = viewGeometry(view, w / h); // container aspect: the stage may be clamped
  const corners: P[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const dst: P[] = [];
  for (const [cx, cy] of corners) {
    const [az, alt] = unproject(win, cx, cy);
    const p = project(vg, az, alt);
    if (!p) return null;
    dst.push([p[0] * w, p[1] * h]);
  }
  const H = homography(corners.map(([x, y]) => [x * w, y * h] as P), dst);
  if (H.some((x) => !Number.isFinite(x))) return null;
  const [a, b, c, d, e, f, g, k] = H;
  return `matrix3d(${[a, d, 0, g, b, e, 0, k, 0, 0, 1, 0, c, f, 0, 1].join(",")})`;
}
