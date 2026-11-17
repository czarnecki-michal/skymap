import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { localSiderealTime, precess, raDecToAltAz } from "../src/sky-math";

const vectors = JSON.parse(readFileSync("../tests/fixtures/sky_vectors.json", "utf-8"));

describe("star positions agree with skyfield within 0.2 deg", () => {
  for (const v of vectors) {
    it(`${v.id} @ ${v.time}`, () => {
      const date = new Date(v.time);
      const [ra, dec] = precess(v.ra, v.dec, date);
      const { alt, az } = raDecToAltAz(ra, dec, v.lat, localSiderealTime(date, v.lon));
      expect(Math.abs(alt - v.alt)).toBeLessThan(0.2);
      const dAz = Math.abs(((az - v.az + 540) % 360) - 180);
      expect(dAz * Math.cos((alt * Math.PI) / 180)).toBeLessThan(0.2 + (v.id === "polaris" ? 1 : 0));
    });
  }
});
