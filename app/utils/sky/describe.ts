// What explore mode knows about the thing you tapped or searched for: the info card's text, the
// constellation to highlight, and where to look.
import { compassPoint, distanceToKaabaKm, qiblaBearing } from "../qibla";
import type { SkyState } from "./astro";
import { NO_CONSTELLATION, type SkyCatalog } from "./catalog";
import type { PlanetKey } from "./planets";
import type { SearchTarget } from "./search";
import { RAD, altAzOf, mulVec, vecFromAltAz, type Vec3 } from "./vec";

export type SkyPick =
  | { kind: "star"; index: number }
  | { kind: "figure"; figure: number }
  | { kind: "planet"; key: PlanetKey }
  | { kind: "moon" }
  | { kind: "sun" }
  | { kind: "qibla" };

export interface SkyInfo {
  title: string;
  ar: string;
  /** "Star in Lyre", "Planet", … */
  kind: string;
  details: string[];
}

/** "37° up · WNW" or "12° below the horizon · NE" */
export function whereInSky(d: ArrayLike<number>): string {
  const { alt, az } = altAzOf(d);
  const a = Math.round(alt / RAD), dir = compassPoint(az / RAD);
  return a >= 0 ? `${a}° up · ${dir}` : `${-a}° below the horizon · ${dir}`;
}

const magnitude = (m: number) => `magnitude ${m.toFixed(1)}`;

export function describePick(p: SkyPick, sky: SkyState, cat: SkyCatalog, lat: number, lng: number): SkyInfo {
  switch (p.kind) {
    case "star": {
      const named = cat.names.stars.find((s) => s.index === p.index);
      const c = cat.starCons[p.index]!;
      const cons = c === NO_CONSTELLATION ? undefined : cat.names.constellations[c];
      return {
        title: named?.en ?? "Star",
        ar: named?.ar ?? "",
        kind: cons ? `Star in ${cons.en}` : "Star",
        details: [magnitude(cat.starMag[p.index]!), whereInSky(mulVec(sky.rot, cat.starDirs, p.index * 3))],
      };
    }
    case "figure": {
      const c = cat.names.constellations[p.figure]!;
      return { title: c.en, ar: c.ar, kind: "Constellation", details: [whereInSky(mulVec(sky.rot, c.label))] };
    }
    case "planet": {
      const pl = sky.planets.find((x) => x.key === p.key)!;
      return { title: pl.en, ar: pl.ar, kind: "Planet", details: [magnitude(pl.mag), whereInSky(pl.dir)] };
    }
    case "moon":
      return { title: "Moon", ar: "القمر", kind: "Moon", details: [`${Math.round(sky.moon.fraction * 100)}% lit`, whereInSky(sky.moon.dir)] };
    case "sun":
      return { title: "Sun", ar: "الشمس", kind: "Star", details: [whereInSky(sky.sun.dir)] };
    case "qibla": {
      const b = qiblaBearing(lat, lng);
      return {
        title: "Qibla",
        ar: "القبلة",
        kind: "Direction of prayer",
        details: [`${Math.round(b)}° ${compassPoint(b)}`, `${Math.round(distanceToKaabaKm(lat, lng)).toLocaleString("en")} km to the Kaaba`],
      };
    }
  }
}

/** The constellation to draw in amber for a pick (−1 for none). */
export function figureOf(p: SkyPick | null, cat: SkyCatalog): number {
  if (p?.kind === "figure") return p.figure;
  if (p?.kind === "star") {
    const c = cat.starCons[p.index]!;
    return c === NO_CONSTELLATION ? -1 : c;
  }
  return -1;
}

/** Where a pick is in the sky (horizon frame). The Qibla is looked at from 15° above the horizon. */
export function directionOf(p: SkyPick, sky: SkyState, cat: SkyCatalog, lat: number, lng: number): Vec3 {
  switch (p.kind) {
    case "star":
      return mulVec(sky.rot, cat.starDirs, p.index * 3);
    case "figure":
      return mulVec(sky.rot, cat.names.constellations[p.figure]!.label);
    case "planet":
      return sky.planets.find((x) => x.key === p.key)!.dir;
    case "moon":
      return sky.moon.dir;
    case "sun":
      return sky.sun.dir;
    case "qibla":
      return vecFromAltAz(15 * RAD, qiblaBearing(lat, lng) * RAD);
  }
}

/** A search result as a pick (a constellation is shown as its figure). */
export function pickForTarget(t: SearchTarget): SkyPick {
  return t.kind === "constellation" ? { kind: "figure", figure: t.index } : t;
}
