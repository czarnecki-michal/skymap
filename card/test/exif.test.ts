import { describe, expect, it } from "vitest";
import { exifToUtc, readExifDate } from "../src/exif";

/** Minimal JPEG with an APP1 Exif block holding DateTimeOriginal (+ optional OffsetTimeOriginal). */
function jpeg(date: string, le: boolean, offset?: string): ArrayBuffer {
  const strs: [number, string][] = [[0x9003, date + "\0"]];
  if (offset) strs.push([0x9011, offset + "\0"]);
  const ifd0 = 8;
  const exifIfd = ifd0 + 2 + 12 + 4;
  const dataStart = exifIfd + 2 + 12 * strs.length + 4;
  const tiffLen = dataStart + strs.reduce((s, [, v]) => s + v.length, 0);
  const tiff = new DataView(new ArrayBuffer(tiffLen));
  const u8 = new Uint8Array(tiff.buffer);
  u8.set(le ? [0x49, 0x49] : [0x4d, 0x4d], 0);
  tiff.setUint16(2, 42, le);
  tiff.setUint32(4, ifd0, le);
  tiff.setUint16(ifd0, 1, le);
  tiff.setUint16(ifd0 + 2, 0x8769, le);
  tiff.setUint16(ifd0 + 4, 4, le);
  tiff.setUint32(ifd0 + 6, 1, le);
  tiff.setUint32(ifd0 + 10, exifIfd, le);
  tiff.setUint16(exifIfd, strs.length, le);
  let data = dataStart;
  strs.forEach(([tag, v], i) => {
    const e = exifIfd + 2 + 12 * i;
    tiff.setUint16(e, tag, le);
    tiff.setUint16(e + 2, 2, le);
    tiff.setUint32(e + 4, v.length, le);
    tiff.setUint32(e + 8, data, le);
    for (let k = 0; k < v.length; k++) u8[data + k] = v.charCodeAt(k);
    data += v.length;
  });
  const app1Len = 2 + 6 + tiffLen;
  const out = new Uint8Array(2 + 2 + app1Len + 2);
  out.set([0xff, 0xd8, 0xff, 0xe1, app1Len >> 8, app1Len & 0xff], 0);
  out.set([0x45, 0x78, 0x69, 0x66, 0, 0], 6);
  out.set(u8, 12);
  out.set([0xff, 0xd9], 12 + tiffLen);
  return out.buffer;
}

describe("EXIF", () => {
  it("reads DateTimeOriginal in both byte orders", () => {
    for (const le of [true, false]) {
      expect(readExifDate(jpeg("2026:01:15 21:30:00", le))).toEqual({ local: "2026:01:15 21:30:00", offset: null });
    }
  });
  it("uses OffsetTimeOriginal when present", () => {
    const e = readExifDate(jpeg("2026:01:15 21:30:00", true, "+01:00"))!;
    expect(exifToUtc(e, "America/New_York").toISOString()).toBe("2026-01-15T20:30:00.000Z");
  });
  it("falls back to the HA time zone, including summer time", () => {
    expect(exifToUtc({ local: "2026:01:15 21:30:00", offset: null }, "Europe/Warsaw").toISOString())
      .toBe("2026-01-15T20:30:00.000Z");
    expect(exifToUtc({ local: "2026:07:15 21:30:00", offset: null }, "Europe/Warsaw").toISOString())
      .toBe("2026-07-15T19:30:00.000Z");
  });
  it("returns null for non-JPEG data", () => {
    expect(readExifDate(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]).buffer)).toBeNull();
    expect(readExifDate(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer)).toBeNull();
  });
});
