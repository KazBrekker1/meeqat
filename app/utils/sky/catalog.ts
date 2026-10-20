// The star catalogue: a compact binary (stars + constellation figures) and a names file, built by
// scripts/sky/build-catalog.ts from d3-celestial and served from public/sky (immutable; a format
// change gets a new file name). Decoded once per page and shared.
//
// sky-v1.bin, little-endian:
//   0   "MQSK"          magic
//   4   u16 version     1
//   6   u16 stars
//   8   u16 vertices
//   10  u16 segments
//   12  stars × 9 B     i16 x, i16 y, i16 z (J2000 unit vector × 32767), i8 magnitude × 10,
//                       i8 B−V × 50, u8 constellation index (255 = unknown)
//   ..  vertices × 6 B  i16 x, i16 y, i16 z (figure vertex, J2000 unit vector × 32767)
//   ..  segments × 5 B  u16 a, u16 b (vertex indices), u8 constellation index
import { RAD, vecFromRaDec, type Vec3 } from "./vec";

export const SKY_BIN_URL = "/sky/sky-v1.bin";
export const SKY_NAMES_URL = "/sky/names-v1.json";
export const NO_CONSTELLATION = 255;

const MAGIC = "MQSK";
const VERSION = 1;
const HEADER = 12, STAR = 9, VERTEX = 6, SEGMENT = 5;
const Q = 32767;

/** names-v1.json */
export interface NamesFile {
  /** [star index, English, Arabic] for the named stars */
  stars: [number, string, string][];
  /** in figure order: the index here is the u8 constellation index in the binary */
  constellations: { id: string; en: string; ar: string; ra: number; dec: number; rank: number }[];
}

export interface Constellation {
  id: string;
  en: string;
  ar: string;
  /** where its name is written, J2000 unit vector */
  label: Vec3;
  /** 1 = major … 3 = minor */
  rank: number;
}

export interface SkyCatalog {
  /** J2000 equatorial unit vectors, 3 per star */
  starDirs: Float32Array;
  starMag: Float32Array;
  starBv: Float32Array;
  /** constellation index per star, NO_CONSTELLATION when unknown */
  starCons: Uint8Array;
  /** figure vertices, J2000 unit vectors, 3 per vertex */
  lineDirs: Float32Array;
  /** vertex index pairs, 2 per segment */
  segments: Uint16Array;
  /** constellation index per segment */
  segFigure: Uint8Array;
  names: { stars: { index: number; en: string; ar: string }[]; constellations: Constellation[] };
}

/** What the build script feeds the encoder (angles in degrees). */
export interface CatalogSource {
  stars: { ra: number; dec: number; mag: number; bv: number; cons: number }[];
  vertices: { ra: number; dec: number }[];
  segments: [a: number, b: number, cons: number][];
}

const q = (v: number) => Math.max(-Q, Math.min(Q, Math.round(v * Q)));

export function encodeSkyCatalog(src: CatalogSource): Uint8Array {
  const bytes = new Uint8Array(HEADER + src.stars.length * STAR + src.vertices.length * VERTEX + src.segments.length * SEGMENT);
  const dv = new DataView(bytes.buffer);
  for (let i = 0; i < 4; i++) bytes[i] = MAGIC.charCodeAt(i);
  dv.setUint16(4, VERSION, true);
  dv.setUint16(6, src.stars.length, true);
  dv.setUint16(8, src.vertices.length, true);
  dv.setUint16(10, src.segments.length, true);
  let o = HEADER;
  const putDir = (ra: number, dec: number) => {
    const d = vecFromRaDec(ra * RAD, dec * RAD);
    dv.setInt16(o, q(d[0]), true); dv.setInt16(o + 2, q(d[1]), true); dv.setInt16(o + 4, q(d[2]), true);
    o += 6;
  };
  for (const s of src.stars) {
    putDir(s.ra, s.dec);
    dv.setInt8(o, Math.round(s.mag * 10));
    dv.setInt8(o + 1, Math.round(Math.max(-0.5, Math.min(2.5, s.bv)) * 50));
    dv.setUint8(o + 2, s.cons);
    o += 3;
  }
  for (const v of src.vertices) putDir(v.ra, v.dec);
  for (const [a, b, c] of src.segments) {
    dv.setUint16(o, a, true); dv.setUint16(o + 2, b, true); dv.setUint8(o + 4, c);
    o += SEGMENT;
  }
  return bytes;
}

export function decodeSkyCatalog(buf: ArrayBuffer, names: NamesFile): SkyCatalog {
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== MAGIC || dv.getUint16(4, true) !== VERSION) throw new Error("sky catalogue: unknown format");
  const nStars = dv.getUint16(6, true), nVerts = dv.getUint16(8, true), nSegs = dv.getUint16(10, true);
  if (buf.byteLength !== HEADER + nStars * STAR + nVerts * VERTEX + nSegs * SEGMENT) throw new Error("sky catalogue: truncated");
  let o = HEADER;
  const getDir = (out: Float32Array, i: number) => {
    const x = dv.getInt16(o, true), y = dv.getInt16(o + 2, true), z = dv.getInt16(o + 4, true), n = Math.hypot(x, y, z);
    out[i * 3] = x / n; out[i * 3 + 1] = y / n; out[i * 3 + 2] = z / n;
    o += 6;
  };
  const starDirs = new Float32Array(nStars * 3), starMag = new Float32Array(nStars), starBv = new Float32Array(nStars), starCons = new Uint8Array(nStars);
  for (let i = 0; i < nStars; i++) {
    getDir(starDirs, i);
    starMag[i] = dv.getInt8(o) / 10;
    starBv[i] = dv.getInt8(o + 1) / 50;
    starCons[i] = dv.getUint8(o + 2);
    o += 3;
  }
  const lineDirs = new Float32Array(nVerts * 3);
  for (let i = 0; i < nVerts; i++) getDir(lineDirs, i);
  const segments = new Uint16Array(nSegs * 2), segFigure = new Uint8Array(nSegs);
  for (let i = 0; i < nSegs; i++) {
    segments[i * 2] = dv.getUint16(o, true);
    segments[i * 2 + 1] = dv.getUint16(o + 2, true);
    segFigure[i] = dv.getUint8(o + 4);
    o += SEGMENT;
  }
  return {
    starDirs, starMag, starBv, starCons, lineDirs, segments, segFigure,
    names: {
      stars: names.stars.map(([index, en, ar]) => ({ index, en, ar })),
      constellations: names.constellations.map((c) => ({ id: c.id, en: c.en, ar: c.ar, rank: c.rank, label: vecFromRaDec(c.ra * RAD, c.dec * RAD) })),
    },
  };
}

/** Promise cache that forgets a failure, so a failed load is retried next time. */
let pending: Promise<SkyCatalog> | null = null;
export function loadSkyCatalog(): Promise<SkyCatalog> {
  return (pending ??= (async () => {
    const [bin, names] = await Promise.all([
      fetch(SKY_BIN_URL).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${SKY_BIN_URL}: ${r.status}`)))),
      fetch(SKY_NAMES_URL).then((r) => (r.ok ? (r.json() as Promise<NamesFile>) : Promise.reject(new Error(`${SKY_NAMES_URL}: ${r.status}`)))),
    ]);
    return decodeSkyCatalog(bin, names);
  })().catch((err) => {
    pending = null;
    throw err;
  }));
}
