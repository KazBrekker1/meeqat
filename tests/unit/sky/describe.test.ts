import { describe, expect, test } from "bun:test";
import { skyAt } from "../../../app/utils/sky/astro";
import { decodeSkyCatalog, type NamesFile } from "../../../app/utils/sky/catalog";
import { describePick, directionOf, figureOf, pickForTarget, whereInSky } from "../../../app/utils/sky/describe";
import { RAD, altAzOf, vecFromAltAz } from "../../../app/utils/sky/vec";

const names = (await Bun.file("public/sky/names-v1.json").json()) as NamesFile;
const cat = decodeSkyCatalog(await Bun.file("public/sky/sky-v1.bin").arrayBuffer(), names);
const DOHA = { lat: 25.2854, lng: 51.531 };
// 21:00 in Doha: Vega 29.6° up WNW, the Moon 40.5° up SW (astropy, tests/fixtures/sky)
const sky = skyAt(new Date("2026-10-20T18:00:00Z"), DOHA.lat, DOHA.lng);
const vega = cat.names.stars.find((s) => s.en === "Vega")!.index;
const lyre = cat.names.constellations.findIndex((c) => c.en === "Lyre");

describe("whereInSky", () => {
  test("above and below the horizon", () => {
    expect(whereInSky(vecFromAltAz(37.4 * RAD, 292 * RAD))).toBe("37° up · WNW");
    expect(whereInSky(vecFromAltAz(-12 * RAD, 45 * RAD))).toBe("12° below the horizon · NE");
  });
});

describe("describePick", () => {
  test("a named star: both names, its constellation, magnitude and place", () => {
    expect(describePick({ kind: "star", index: vega }, sky, cat, DOHA.lat, DOHA.lng)).toEqual({
      title: "Vega", ar: "النسر الواقع", kind: "Star in Lyre", details: ["magnitude 0.0", "30° up · WNW"],
    });
  });

  test("the Moon: how much is lit and where", () => {
    const info = describePick({ kind: "moon" }, sky, cat, DOHA.lat, DOHA.lng);
    expect(info.title).toBe("Moon");
    expect(info.details).toEqual(["70% lit", "40° up · SW"]);
  });

  test("a planet", () => {
    const info = describePick({ kind: "planet", key: "saturn" }, sky, cat, DOHA.lat, DOHA.lng);
    expect([info.title, info.ar, info.kind]).toEqual(["Saturn", "زحل", "Planet"]);
  });

  test("the Qibla from Doha", () => {
    const info = describePick({ kind: "qibla" }, sky, cat, DOHA.lat, DOHA.lng);
    expect(info.details[0]).toBe("253° WSW");
    expect(info.details[1]).toMatch(/^1,\d{3} km to the Kaaba$/);
  });
});

describe("figureOf and directionOf", () => {
  test("a star highlights its constellation; a figure itself; others nothing", () => {
    expect(figureOf({ kind: "star", index: vega }, cat)).toBe(lyre);
    expect(figureOf({ kind: "figure", figure: 3 }, cat)).toBe(3);
    expect(figureOf({ kind: "moon" }, cat)).toBe(-1);
    expect(figureOf(null, cat)).toBe(-1);
  });

  test("the Qibla is looked at 15° above the horizon at its bearing", () => {
    const { alt, az } = altAzOf(directionOf({ kind: "qibla" }, sky, cat, DOHA.lat, DOHA.lng));
    expect(alt / RAD).toBeCloseTo(15, 9);
    expect(Math.round(az / RAD)).toBe(253);
  });

  test("search targets become picks", () => {
    expect(pickForTarget({ kind: "constellation", index: lyre })).toEqual({ kind: "figure", figure: lyre });
    expect(pickForTarget({ kind: "star", index: vega })).toEqual({ kind: "star", index: vega });
  });
});
