const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const mod = (x: number, m: number) => ((x % m) + m) % m;

export const julianDate = (date: Date) => date.getTime() / 86400000 + 2440587.5;

/** Local mean sidereal time in degrees. */
export function localSiderealTime(date: Date, lonDeg: number): number {
  const d = julianDate(date) - 2451545.0;
  const T = d / 36525;
  const gmst = 280.46061837 + 360.98564736629 * d + 0.000387933 * T * T - (T * T * T) / 38710000;
  return mod(gmst + lonDeg, 360);
}

/** Precess J2000 equatorial coordinates (degrees) to the equinox of `date`. */
export function precess(raDeg: number, decDeg: number, date: Date): [number, number] {
  const T = (julianDate(date) - 2451545.0) / 36525;
  const zeta = rad((2306.2181 * T + 0.30188 * T * T + 0.017998 * T ** 3) / 3600);
  const z = rad((2306.2181 * T + 1.09468 * T * T + 0.018203 * T ** 3) / 3600);
  const theta = rad((2004.3109 * T - 0.42665 * T * T - 0.041833 * T ** 3) / 3600);
  const a = rad(raDeg);
  const d = rad(decDeg);
  const A = Math.cos(d) * Math.sin(a + zeta);
  const B = Math.cos(theta) * Math.cos(d) * Math.cos(a + zeta) - Math.sin(theta) * Math.sin(d);
  const C = Math.sin(theta) * Math.cos(d) * Math.cos(a + zeta) + Math.cos(theta) * Math.sin(d);
  return [mod(deg(Math.atan2(A, B)) + deg(z), 360), deg(Math.asin(C))];
}

export function raDecToAltAz(raDeg: number, decDeg: number, latDeg: number, lstDeg: number) {
  const H = rad(lstDeg - raDeg);
  const d = rad(decDeg);
  const p = rad(latDeg);
  const sinAlt = Math.sin(d) * Math.sin(p) + Math.cos(d) * Math.cos(p) * Math.cos(H);
  const alt = deg(Math.asin(sinAlt));
  const az = mod(
    deg(Math.atan2(-Math.cos(d) * Math.sin(H), Math.sin(d) * Math.cos(p) - Math.cos(d) * Math.sin(p) * Math.cos(H))),
    360,
  );
  return { alt, az };
}
