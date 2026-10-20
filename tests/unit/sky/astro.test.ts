import { describe, expect, test } from "bun:test";
import ref from "../../fixtures/sky/reference.json";
import { equatorToHorizon, gmst, skyAt } from "../../../app/utils/sky/astro";
import { horizontal, julianDay } from "../../../app/utils/moon/sphere";
import { RAD, angleBetween, mulVec, vecFromAltAz, vecFromRaDec } from "../../../app/utils/sky/vec";

const { lat, lng } = ref.place;
const offBy = (got: [number, number, number], alt: number, az: number) =>
  angleBetween(got, vecFromAltAz(alt * RAD, az * RAD)) / RAD;

describe("skyAt against astropy (Doha, 2026-10-20)", () => {
  for (const at of ref.instants) {
    const sky = skyAt(new Date(at.iso), lat, lng);

    test(`${at.iso}: stars within 0.1°`, () => {
      for (const [name, s] of Object.entries(at.stars)) {
        const dir = mulVec(sky.rot, vecFromRaDec(s.ra * RAD, s.dec * RAD));
        expect([name, offBy(dir, s.alt, s.az) < 0.1]).toEqual([name, true]);
      }
    });

    test(`${at.iso}: Moon and Sun within 0.3°`, () => {
      expect(offBy(sky.moon.dir, at.bodies.moon.alt, at.bodies.moon.az)).toBeLessThan(0.3);
      expect(offBy(sky.sun.dir, at.bodies.sun.alt, at.bodies.sun.az)).toBeLessThan(0.3);
    });

    test(`${at.iso}: planets within 0.3°`, () => {
      for (const p of sky.planets) {
        const b = at.bodies[p.key];
        expect([p.key, offBy(p.dir, b.alt, b.az) < 0.3]).toEqual([p.key, true]);
      }
    });
  }
});

describe("equatorToHorizon", () => {
  test("agrees with sphere.ts horizontal() for a date-of-equator direction", () => {
    const date = new Date("2026-10-20T18:00:00Z"), jd = julianDay(date);
    const ra = 4.2, dec = 0.3;
    const h = horizontal(jd, ra, dec, lat, lng);
    const dir = mulVec(equatorToHorizon(jd, lat, lng), vecFromRaDec(ra, dec));
    expect(angleBetween(dir, vecFromAltAz(h.altitude, h.azimuth)) / RAD).toBeLessThan(1e-9);
  });

  test("gmst stays in [0, 2π)", () => {
    for (const jd of [2400000.5, 2451545, 2461333.25]) {
      const g = gmst(jd);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThan(2 * Math.PI);
    }
  });
});

describe("planet magnitudes are plausible for 2026-10-20", () => {
  const mags = Object.fromEntries(skyAt(new Date("2026-10-20T18:00:00Z"), lat, lng).planets.map((p) => [p.key, p.mag]));
  test("Jupiter is about −2", () => expect(mags.jupiter!).toBeWithin(-2.9, -1.5));
  test("Saturn near opposition is about +0.5", () => expect(mags.saturn!).toBeWithin(0, 1.2));
  test("Mars is fainter than Jupiter", () => expect(mags.mars!).toBeGreaterThan(mags.jupiter!));
});
