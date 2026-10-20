// The five naked-eye planets from JPL's "Approximate Positions of the Planets" (E. M. Standish,
// Table 1: Keplerian elements valid 1800–2050, a few arcminutes at worst), geocentric, J2000.
// Magnitudes: Explanatory Supplement (1992) phase laws; Saturn is the globe only (the rings add
// up to about a magnitude when they are open).
import { RAD, clamp, type Vec3 } from "./vec";

export type PlanetKey = "mercury" | "venus" | "mars" | "jupiter" | "saturn";

export interface Planet {
  key: PlanetKey;
  en: string;
  ar: string;
  /** apparent visual magnitude */
  mag: number;
  /** geocentric J2000 equatorial unit vector */
  dirJ2000: Vec3;
}

// a [au], ȧ, e, ė, I [°], İ, L [°], L̇, ϖ [°], ϖ̇, Ω [°], Ω̇ — rates per Julian century; J2000 ecliptic.
type Elements = readonly [number, number, number, number, number, number, number, number, number, number, number, number];

const EM_BARYCENTRE: Elements = [1.00000261, 0.00000562, 0.01671123, -0.00004392, -0.00001531, -0.01294668, 100.46457166, 35999.37244981, 102.93768193, 0.32327364, 0, 0];

export const PLANETS: readonly { key: PlanetKey; en: string; ar: string; el: Elements; phaseMag: (i: number) => number }[] = [
  { key: "mercury", en: "Mercury", ar: "عطارد", el: [0.38709927, 0.00000037, 0.20563593, 0.00001906, 7.00497902, -0.00594749, 252.2503235, 149472.67411175, 77.45779628, 0.16047689, 48.33076593, -0.12534081], phaseMag: (i) => -0.42 + 0.038 * i - 0.000273 * i * i + 0.000002 * i ** 3 },
  { key: "venus", en: "Venus", ar: "الزهرة", el: [0.72333566, 0.0000039, 0.00677672, -0.00004107, 3.39467605, -0.0007889, 181.9790995, 58517.81538729, 131.60246718, 0.00268329, 76.67984255, -0.27769418], phaseMag: (i) => -4.4 + 0.0009 * i + 0.000239 * i * i - 0.00000065 * i ** 3 },
  { key: "mars", en: "Mars", ar: "المريخ", el: [1.52371034, 0.00001847, 0.0933941, 0.00007882, 1.84969142, -0.00813131, -4.55343205, 19140.30268499, -23.94362959, 0.44441088, 49.55953891, -0.29257343], phaseMag: (i) => -1.52 + 0.016 * i },
  { key: "jupiter", en: "Jupiter", ar: "المشتري", el: [5.202887, -0.00011607, 0.04838624, -0.00013253, 1.30439695, -0.00183714, 34.39644051, 3034.74612775, 14.72847983, 0.21252668, 100.47390909, 0.20469106], phaseMag: (i) => -9.4 + 0.005 * i },
  { key: "saturn", en: "Saturn", ar: "زحل", el: [9.53667594, -0.0012506, 0.05386179, -0.00050991, 2.48599187, 0.00193609, 49.95424423, 1222.49362201, 92.59887831, -0.41897216, 113.66242448, -0.28867794], phaseMag: () => -8.88 },
];

const OBLIQUITY_J2000 = 23.43928 * RAD;

/** Heliocentric J2000 ecliptic position, au. */
function heliocentric(el: Elements, T: number): Vec3 {
  const a = el[0] + el[1] * T, e = el[2] + el[3] * T, I = (el[4] + el[5] * T) * RAD;
  const L = el[6] + el[7] * T, w = el[8] + el[9] * T, O = el[10] + el[11] * T;
  const om = (w - O) * RAD, Om = O * RAD;
  let M = (((L - w) % 360) + 360) % 360;
  if (M > 180) M -= 360;
  M *= RAD;
  let E = M + e * Math.sin(M);
  for (let k = 0; k < 6; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const co = Math.cos(om), so = Math.sin(om), cO = Math.cos(Om), sO = Math.sin(Om), cI = Math.cos(I), sI = Math.sin(I);
  return [
    (co * cO - so * sO * cI) * xp + (-so * cO - co * sO * cI) * yp,
    (co * sO + so * cO * cI) * xp + (-so * sO + co * cO * cI) * yp,
    so * sI * xp + co * sI * yp,
  ];
}

/** Geocentric directions and magnitudes at a Julian Day (UT is fine at this accuracy). */
export function planetsAt(jd: number): Planet[] {
  const T = (jd - 2451545) / 36525;
  const earth = heliocentric(EM_BARYCENTRE, T), R = Math.hypot(...earth);
  const ce = Math.cos(OBLIQUITY_J2000), se = Math.sin(OBLIQUITY_J2000);
  return PLANETS.map(({ key, en, ar, el, phaseMag }) => {
    const p = heliocentric(el, T);
    const x = p[0] - earth[0], y = p[1] - earth[1], z = p[2] - earth[2];
    const r = Math.hypot(...p), delta = Math.hypot(x, y, z);
    const i = Math.acos(clamp((r * r + delta * delta - R * R) / (2 * r * delta), -1, 1)) / RAD;
    const ye = y * ce - z * se, ze = y * se + z * ce;
    return { key, en, ar, mag: phaseMag(i) + 5 * Math.log10(r * delta), dirJ2000: [x / delta, ye / delta, ze / delta] };
  });
}
