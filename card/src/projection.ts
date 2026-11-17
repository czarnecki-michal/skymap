// Mirror of custom_components/mapa_nieba/geometry.py (pinned by tests/fixtures/projection_vectors.json).
export interface WindowGeometry {
  az_center: number;
  alt_center: number;
  hfov: number;
  aspect: number;
  roll: number;
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

function basis(g: WindowGeometry) {
  const az = rad(g.az_center);
  const alt = rad(g.alt_center);
  const f = [Math.sin(az) * Math.cos(alt), Math.cos(az) * Math.cos(alt), Math.sin(alt)];
  const r = [Math.cos(az), -Math.sin(az), 0];
  const u = [-Math.sin(alt) * Math.sin(az), -Math.sin(alt) * Math.cos(az), Math.cos(alt)];
  return { f, r, u };
}

const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function project(g: WindowGeometry, az: number, alt: number): [number, number] | null {
  const { f, r, u } = basis(g);
  const a = rad(az);
  const e = rad(alt);
  const v = [Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), Math.sin(e)];
  const c = dot(v, f);
  if (c <= 1e-9) return null;
  const px = dot(v, r) / c;
  const py = dot(v, u) / c;
  const rho = rad(g.roll);
  const qx = px * Math.cos(rho) + py * Math.sin(rho);
  const qy = -px * Math.sin(rho) + py * Math.cos(rho);
  const th = Math.tan(rad(g.hfov) / 2);
  return [0.5 + qx / (2 * th), 0.5 - (qy * g.aspect) / (2 * th)];
}

export function unproject(g: WindowGeometry, x: number, y: number): [number, number] {
  const th = Math.tan(rad(g.hfov) / 2);
  const qx = (x - 0.5) * 2 * th;
  const qy = (-(y - 0.5) * 2 * th) / g.aspect;
  const rho = rad(g.roll);
  const px = qx * Math.cos(rho) - qy * Math.sin(rho);
  const py = qx * Math.sin(rho) + qy * Math.cos(rho);
  const { f, r, u } = basis(g);
  const v = [0, 1, 2].map((i) => f[i] + px * r[i] + py * u[i]);
  const n = Math.sqrt(dot(v, v));
  const alt = deg(Math.asin(v[2] / n));
  const az = (deg(Math.atan2(v[0], v[1])) + 360) % 360;
  return [az, alt];
}
