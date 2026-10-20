import { describe, expect, test } from "bun:test";
import { decodeSkyCatalog, encodeSkyCatalog, NO_CONSTELLATION, type NamesFile } from "../../../app/utils/sky/catalog";
import { RAD, angleBetween, vecFromRaDec } from "../../../app/utils/sky/vec";

const names = (await Bun.file("public/sky/names-v1.json").json()) as NamesFile;
const cat = decodeSkyCatalog(await Bun.file("public/sky/sky-v1.bin").arrayBuffer(), names);
const starDir = (i: number): [number, number, number] => [cat.starDirs[i * 3]!, cat.starDirs[i * 3 + 1]!, cat.starDirs[i * 3 + 2]!];
const named = (en: string) => cat.names.stars.find((s) => s.en === en)!;

describe("the committed catalogue", () => {
  test("has the expected sizes", () => {
    expect(cat.starMag.length).toBe(2851);
    expect(cat.names.stars.length).toBe(177);
    expect(cat.names.constellations.length).toBe(89);
    expect(cat.segFigure.length).toBe(743);
    expect(cat.lineDirs.length / 3).toBe(757);
  });

  test("Vega is where it should be, with its magnitude, colour and both names", () => {
    const vega = named("Vega");
    expect(vega.ar).toBe("النسر الواقع");
    expect(angleBetween(starDir(vega.index), vecFromRaDec(279.2347 * RAD, 38.7837 * RAD)) / RAD).toBeLessThan(0.01);
    expect(cat.starMag[vega.index]!).toBeCloseTo(0.0, 1);
    expect(cat.starBv[vega.index]!).toBeCloseTo(0.0, 1);
    expect(cat.names.constellations[cat.starCons[vega.index]!]!.en).toBe("Lyre");
  });

  test("every segment points at real vertices and a real constellation", () => {
    const nVerts = cat.lineDirs.length / 3;
    for (let i = 0; i < cat.segments.length; i++) expect(cat.segments[i]!).toBeLessThan(nVerts);
    for (const f of cat.segFigure) expect(f).toBeLessThan(cat.names.constellations.length);
  });

  test("star constellation indices are valid or 'unknown'", () => {
    for (const c of cat.starCons) expect(c === NO_CONSTELLATION || c < cat.names.constellations.length).toBe(true);
  });
});

describe("encode → decode", () => {
  test("round-trips within quantisation", () => {
    const bin = encodeSkyCatalog({
      stars: [{ ra: 10, dec: 20, mag: -1.44, bv: 0.01, cons: 3 }, { ra: 350, dec: -80, mag: 5.5, bv: 1.7, cons: NO_CONSTELLATION }],
      vertices: [{ ra: 10, dec: 20 }, { ra: 11, dec: 21 }],
      segments: [[0, 1, 3]],
    });
    const back = decodeSkyCatalog(bin.buffer as ArrayBuffer, { stars: [], constellations: [] });
    expect(angleBetween([back.starDirs[0]!, back.starDirs[1]!, back.starDirs[2]!], vecFromRaDec(10 * RAD, 20 * RAD)) / RAD).toBeLessThan(0.005);
    expect(back.starMag[0]!).toBeCloseTo(-1.4, 5);
    expect(back.starBv[1]!).toBeCloseTo(1.7, 5);
    expect(back.starCons[1]!).toBe(NO_CONSTELLATION);
    expect([...back.segments]).toEqual([0, 1]);
    expect([...back.segFigure]).toEqual([3]);
  });

  test("rejects a file in another format", () => {
    expect(() => decodeSkyCatalog(new Uint8Array(12).buffer, { stars: [], constellations: [] })).toThrow("unknown format");
  });
});
