// Shared geometry for the "blooming" orbit — a ring whose radius bulges into a
// lobe at each prayer time (see the hand sketch).

import { parseTimeToMinutes } from "@/utils/time";
import { prayerClock } from "@/utils/prayerClock";

export interface BumpPrayer {
  key: string;
  time: string;
  isNext?: boolean;
  isPast?: boolean;
}

/** Minutes after midnight for a dial time ("HH:MM"). */
export const toMin = (t: string) => parseTimeToMinutes(t) ?? 0;

/** Fraction of the day (0..1); 0 sits at the top of the dial, increasing clockwise. */
export const frac = (t: string) => toMin(t) / 1440;

/** Point on the dial for fraction `t` at radius `r`, centered at (cx,cy). Top = 0, clockwise. */
export function ptAt(t: number, r: number, cx: number, cy: number) {
  const a = t * 2 * Math.PI - Math.PI / 2;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/** Which prayer we're between, and how far through, for a given minute-of-day.
 * Handles wraparound (before the first prayer / after the last). */
export interface OrbitBracket {
  prevMin: number;
  nextMin: number;
  sinceMin: number;
  untilMin: number;
  prevKey: string;
  nextKey: string;
}
export function bracket(prayers: BumpPrayer[], nowMin: number): OrbitBracket {
  const sorted = [...prayers]
    .map((p) => ({ key: p.key, minutes: toMin(p.time) }))
    .sort((a, b) => a.minutes - b.minutes);
  if (!sorted.length) return { prevMin: nowMin, nextMin: nowMin, sinceMin: 0, untilMin: 0, prevKey: "", nextKey: "" };
  const clock = prayerClock(sorted, nowMin * 60);
  const prev = clock.previous!, next = clock.next!;
  // Before the first time the previous one is yesterday's; after the last, the next is tomorrow's.
  const prevMin = clock.beforeFirst ? prev.minutes - 1440 : prev.minutes;
  const nextMin = clock.allPassed ? next.minutes + 1440 : next.minutes;
  return {
    prevMin, nextMin, sinceMin: nowMin - prevMin, untilMin: nextMin - nowMin,
    prevKey: prev.key, nextKey: next.key,
  };
}

/** Human duration, e.g. 72 → "1h 12m", 12 → "12m". */
export function fmtDur(min: number) {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h}h ${r.toString().padStart(2, "0")}m` : `${r}m`;
}

const mixHex = (c1: string, c2: string, t: number) => {
  const p = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(c1);
  const [r2, g2, b2] = p(c2);
  const m = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${m(r1!, r2!)}, ${m(g1!, g2!)}, ${m(b1!, b2!)})`;
};
/** Beacon colour as the next prayer nears: cool blue → amber → hot coral. */
export const urgencyColor = (u: number) =>
  u < 0.5 ? mixHex("#7db0ff", "#fcd34d", u / 0.5) : mixHex("#fcd34d", "#ff6b4a", (u - 0.5) / 0.5);

/** Sample a closed contour as an SVG path string. radiusFn maps t→radius. */
export function contourPath(
  steps: number,
  cx: number,
  cy: number,
  radiusFn: (t: number) => number
) {
  let d = "";
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const p = ptAt(t, radiusFn(t), cx, cy);
    d += (i === 0 ? "M" : "L") + p.x.toFixed(2) + " " + p.y.toFixed(2);
  }
  return d + "Z";
}
