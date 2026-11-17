export interface ExifDate {
  local: string; // "YYYY:MM:DD HH:MM:SS"
  offset: string | null; // "+01:00"
}

/** DateTimeOriginal (and OffsetTimeOriginal) from a JPEG; null when absent or not a JPEG. */
export function readExifDate(buf: ArrayBuffer): ExifDate | null {
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
  let p = 2;
  while (p + 4 <= v.byteLength) {
    if (v.getUint8(p) !== 0xff) return null;
    const marker = v.getUint8(p + 1);
    if (marker === 0xd9 || marker === 0xda) return null; // end of image / start of scan
    const len = v.getUint16(p + 2);
    if (marker === 0xe1 && p + 10 <= v.byteLength && v.getUint32(p + 4) === 0x45786966) {
      return parseTiff(v, p + 10);
    }
    p += 2 + len;
  }
  return null;
}

function parseTiff(v: DataView, base: number): ExifDate | null {
  if (base + 8 > v.byteLength) return null;
  const le = v.getUint16(base) === 0x4949;
  const u16 = (o: number) => v.getUint16(base + o, le);
  const u32 = (o: number) => v.getUint32(base + o, le);
  const ascii = (o: number, n: number) => {
    let s = "";
    for (let i = 0; i < n; i++) {
      const c = v.getUint8(base + o + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  };
  const entries = (ifd: number) => {
    const out = new Map<number, { type: number; count: number; value: number }>();
    if (base + ifd + 2 > v.byteLength) return out;
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + 12 * i;
      if (base + e + 12 > v.byteLength) break;
      out.set(u16(e), { type: u16(e + 2), count: u32(e + 4), value: u32(e + 8) });
    }
    return out;
  };
  try {
    const ptr = entries(u32(4)).get(0x8769);
    if (!ptr) return null;
    const exif = entries(ptr.value);
    const dt = exif.get(0x9003);
    if (!dt) return null;
    const off = exif.get(0x9011);
    const str = (e: { count: number; value: number }) => (e.count <= 4 ? "" : ascii(e.value, e.count));
    const local = str(dt);
    if (!/^\d{4}:\d\d:\d\d \d\d:\d\d:\d\d$/.test(local)) return null;
    const offset = off ? str(off) : "";
    return { local, offset: /^[+-]\d\d:\d\d$/.test(offset) ? offset : null };
  } catch {
    return null;
  }
}

function parts(local: string): number[] {
  const [d, t] = local.split(" ");
  const [Y, M, D] = d.split(":").map(Number);
  const [h, m, s] = t.split(":").map(Number);
  return [Y, M - 1, D, h, m, s];
}

/** Wall-clock time in `timeZone` for a UTC instant, expressed as a UTC timestamp. */
function zoned(utcMs: number, timeZone: string): number {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = Object.fromEntries(f.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
}

/** Convert EXIF local time to UTC: explicit offset first, otherwise the HA time zone. */
export function exifToUtc(e: ExifDate, timeZone: string): Date {
  const [Y, M, D, h, m, s] = parts(e.local);
  const wall = Date.UTC(Y, M, D, h, m, s);
  if (e.offset) {
    const sign = e.offset[0] === "-" ? -1 : 1;
    const [oh, om] = e.offset.slice(1).split(":").map(Number);
    return new Date(wall - sign * (oh * 60 + om) * 60000);
  }
  let guess = wall;
  for (let i = 0; i < 2; i++) guess = wall - (zoned(guess, timeZone) - guess);
  return new Date(guess);
}
