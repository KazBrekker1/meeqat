// The orbit's now-marker: the central moon as a gnomon (design/stage-and-moon.html, "Pure").
// By day the moon casts the sun's shadow toward now at its true length; by night the same
// arm is moonlight. Pure helpers only — the orbit owns the drawing.
import { julianDay, sunEcliptic, eclToEq, horizontal } from "./sphere";

const RAD = Math.PI / 180;

/** Atmospheric refraction (Bennett), degrees, for an apparent altitude in degrees. */
const refract = (h: number) => (h < -2 ? 0 : 1.02 / Math.tan((h + 10.3 / (h + 5.11)) * RAD) / 60);

/** Apparent sun altitude (degrees, with refraction) at an instant, for a place (lat/lng degrees, east +). */
export function sunAltitudeDeg(date: Date, lat: number, lng: number): number {
  const jd = julianDay(date);
  const s = sunEcliptic((jd - 2451545) / 36525);
  const e = eclToEq(s.lambda, 0, s.eps);
  const a = horizontal(jd, e.ra, e.dec, lat, lng).altitude / RAD;
  return a + refract(a);
}

/** Shadow length in gnomon heights for a sun altitude (degrees); clamped near the horizon. */
export const cotD = (alt: number) => 1 / Math.tan(Math.max(0.4, alt) * RAD);

export const smooth01 = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export type Rgb = [number, number, number];
export const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb =>
  a.map((v, i) => Math.round(v + (b[i]! - v) * t)) as Rgb;
export const rgb = (c: Rgb, a = 1) => (a === 1 ? `rgb(${c.join(",")})` : `rgba(${c.join(",")},${a})`);

/** Shadows are lit by the sky: deep blue ink at midday, violet in the golden hour, mauve at the horizon. */
export const sunInk = (alt: number): Rgb => {
  const c = mixRgb([70, 44, 128], [20, 38, 104], smooth01(4, 22, alt));
  return mixRgb([104, 52, 108], c, smooth01(-1, 4, alt));
};
export const MOONLIGHT: Rgb = [214, 226, 255];

/**
 * Cross-fade weights for a sun altitude. Maghrib (sun ≈ −0.8°): the long shadow is still
 * there; it dissolves by −3°, and moonlight rises from −1.5° to −6° (≈ 20 min in Doha).
 * Mirrored at sunrise. `day` tints the now-point (ink by day, moon-white by night).
 */
export function gnomonWeights(alt: number) {
  return { day: smooth01(-4, -1.5, alt), sun: smooth01(-3, 0.5, alt), moon: 1 - smooth01(-6, -1.5, alt) };
}

/**
 * A tapered arm drawn straight up (12 o'clock) from the moon's limb r0 to Rt around (C, C):
 * half-width w0 at the limb easing to ~40 % on the band, then a soft rounded point.
 */
export function armPath(C: number, r0: number, Rt: number, w0: number, k: number): string {
  const pts: [number, number][] = [];
  const N = 26;
  const cap = Math.min(7 * k, (Rt - r0) * 0.3);
  for (let j = 0; j <= N; j++) {
    const r = r0 + ((Rt - r0) * j) / N;
    const s = (r - r0) / (Rt - r0);
    const e = Math.max(0, (r - (Rt - cap)) / cap);
    pts.push([w0 * (1 - 0.58 * Math.sqrt(s)) * Math.sqrt(Math.max(0, 1 - e * e)), r]);
  }
  const f = (n: number) => n.toFixed(2);
  const left = pts.map(([w, r]) => `${f(C - w)} ${f(C - r)}`).join(" L ");
  const right = [...pts].reverse().map(([w, r]) => `${f(C + w)} ${f(C - r)}`).join(" L ");
  return `M ${left} L ${right} Z`;
}
