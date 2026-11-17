import { project, type WindowGeometry } from "./projection";

/** A known sky object clicked on the photo (x, y normalised to the photo). */
export interface Match {
  az: number;
  alt: number;
  x: number;
  y: number;
}

export type SolveResult = { geometry: WindowGeometry; error: number } | { fail: string };

const rad = (d: number) => (d * Math.PI) / 180;
const wrap360 = (x: number) => ((x % 360) + 360) % 360;

function angularDistance(a: Match, b: Match): number {
  const c =
    Math.sin(rad(a.alt)) * Math.sin(rad(b.alt)) +
    Math.cos(rad(a.alt)) * Math.cos(rad(b.alt)) * Math.cos(rad(a.az - b.az));
  return (Math.acos(Math.min(1, Math.max(-1, c))) * 180) / Math.PI;
}

function linSolve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c || M[c][c] === 0) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => (r[i] === 0 ? 0 : r[n] / r[i]));
}

/**
 * Fit the window geometry to clicked matches.
 * 1 match: az_center, alt_center. 2+ matches: also hfov and roll.
 */
export function solveGeometry(start: WindowGeometry, matches: Match[]): SolveResult {
  if (matches.length === 0) return { fail: "Wskaż przynajmniej jeden obiekt na zdjęciu." };
  for (let i = 0; i < matches.length; i++) {
    for (let j = i + 1; j < matches.length; j++) {
      const a = matches[i];
      const b = matches[j];
      if (angularDistance(a, b) < 3 || Math.hypot(a.x - b.x, a.y - b.y) < 0.05) {
        return { fail: "Wybrane obiekty są za blisko siebie – wybierz dwa oddalone od siebie." };
      }
    }
  }
  const full = matches.length >= 2;
  const toGeo = (p: number[]): WindowGeometry => ({
    ...start,
    az_center: wrap360(p[0]),
    alt_center: Math.max(-10, Math.min(90, p[1])),
    hfov: full ? Math.max(10, Math.min(120, p[2])) : start.hfov,
    roll: full ? p[3] : start.roll,
  });
  const residuals = (p: number[]): number[] => {
    const g = toGeo(p);
    const r: number[] = [];
    for (const m of matches) {
      const q = project(g, m.az, m.alt);
      if (!q) r.push(10, 10);
      else r.push(q[0] - m.x, q[1] - m.y);
    }
    return r;
  };
  const cost = (r: number[]) => r.reduce((s, x) => s + x * x, 0);

  let p = full ? [start.az_center, start.alt_center, start.hfov, start.roll] : [start.az_center, start.alt_center];
  let r = residuals(p);
  let lambda = 1e-3;
  for (let it = 0; it < 50; it++) {
    const h = 1e-4;
    const J = r.map(() => new Array(p.length).fill(0));
    for (let k = 0; k < p.length; k++) {
      const q = [...p];
      q[k] += h;
      const rk = residuals(q);
      for (let i = 0; i < r.length; i++) J[i][k] = (rk[i] - r[i]) / h;
    }
    const JtJ = p.map((_, a) => p.map((__, b) => J.reduce((s, row) => s + row[a] * row[b], 0)));
    const Jtr = p.map((_, a) => J.reduce((s, row, i) => s + row[a] * r[i], 0));
    for (let a = 0; a < p.length; a++) JtJ[a][a] *= 1 + lambda;
    const step = linSolve(JtJ, Jtr.map((x) => -x));
    const cand = p.map((x, i) => x + step[i]);
    const rc = residuals(cand);
    if (cost(rc) < cost(r)) {
      p = cand;
      r = rc;
      lambda = Math.max(1e-7, lambda / 3);
      if (Math.max(...step.map(Math.abs)) < 1e-7) break;
    } else {
      lambda *= 5;
    }
  }
  const error = Math.sqrt(cost(r) / matches.length);
  if (!Number.isFinite(error) || error > 0.01) {
    return { fail: "Nie udało się dopasować zdjęcia – sprawdź, czy kliknięte obiekty są właściwe." };
  }
  return { geometry: toGeo(p), error };
}
