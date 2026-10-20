// Search over everything explore mode can name: the named stars, the constellations, the planets,
// the Moon and the Sun, in English or Arabic.
import type { SkyCatalog } from "./catalog";
import { PLANETS, type PlanetKey } from "./planets";

export type SearchTarget =
  | { kind: "star"; index: number }
  | { kind: "constellation"; index: number }
  | { kind: "planet"; key: PlanetKey }
  | { kind: "moon" }
  | { kind: "sun" };

export interface SearchItem {
  target: SearchTarget;
  en: string;
  ar: string;
  /** ranking: brighter (smaller) first */
  mag: number;
  /** normalised English and Arabic names */
  keys: string[];
}

/**
 * Lower case, no Latin accents, no Arabic tashkeel or tatweel, and one letter for each of the
 * forms people type interchangeably: أ إ آ ٱ → ا, ى → ي, ة → ه.
 */
export function normalize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/ـ/g, "")
    .replace(/[آأإٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase()
    .replace(/[\s -‏]+/g, " ")
    .trim();
}

/** Typical magnitudes, only for ranking. */
const PLANET_MAG: Record<PlanetKey, number> = { mercury: 0, venus: -4, mars: 1, jupiter: -2, saturn: 0.7 };
const RANK_MAG = [0, 1, 2.5, 4];

export function buildSearchIndex(cat: SkyCatalog): SearchItem[] {
  const item = (target: SearchTarget, en: string, ar: string, mag: number): SearchItem => ({
    target, en, ar, mag, keys: [normalize(en), normalize(ar)].filter(Boolean),
  });
  return [
    item({ kind: "moon" }, "Moon", "القمر", -12),
    item({ kind: "sun" }, "Sun", "الشمس", -26),
    ...PLANETS.map((p) => item({ kind: "planet", key: p.key }, p.en, p.ar, PLANET_MAG[p.key])),
    ...cat.names.stars.map((s) => item({ kind: "star", index: s.index }, s.en, s.ar, cat.starMag[s.index]!)),
    ...cat.names.constellations.map((c, index) => item({ kind: "constellation", index }, c.en, c.ar, RANK_MAG[c.rank] ?? 4)),
  ];
}

/** Best matches: whole-name prefix, then word prefix, then anywhere; brighter first within each. */
export function search(index: readonly SearchItem[], query: string, limit = 8): SearchItem[] {
  const q = normalize(query);
  if (!q) return [];
  const scored: { item: SearchItem; score: number }[] = [];
  for (const item of index) {
    let score = Infinity;
    for (const k of item.keys) {
      if (k.startsWith(q)) score = Math.min(score, 0);
      else if (k.split(" ").some((w) => w.startsWith(q))) score = Math.min(score, 1);
      else if (k.includes(q)) score = Math.min(score, 2);
    }
    if (score < Infinity) scored.push({ item, score });
  }
  scored.sort((a, b) => a.score - b.score || a.item.mag - b.item.mag);
  return scored.slice(0, limit).map((s) => s.item);
}
