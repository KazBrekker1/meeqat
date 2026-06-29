// Shared geometry for the "blooming" orbit — a ring whose radius bulges into a
// lobe at each prayer time (see the hand sketch).

export interface BumpPrayer {
  key: string;
  time: string;
  isNext?: boolean;
  isPast?: boolean;
}

export const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Fraction of the day (0..1); 0 sits at the top of the dial, increasing clockwise. */
export const frac = (t: string) => toMin(t) / 1440;

/**
 * Radius at fraction `t` for a bumpy ring. Each prayer adds a gaussian lobe.
 * @param amp  lobe height (px)
 * @param sigma lobe width in fraction-of-day units
 */
export function bumpR(t: number, base: number, amp: number, sigma: number, fracs: number[]) {
  let b = 0;
  for (const f of fracs) {
    let d = Math.abs(t - f);
    d = Math.min(d, 1 - d); // wrap around the circle
    b += Math.exp(-(d * d) / (2 * sigma * sigma));
  }
  return base + amp * b;
}

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
  const sorted = [...prayers].sort((a, b) => toMin(a.time) - toMin(b.time));
  const mins = sorted.map((p) => toMin(p.time));
  if (!sorted.length) return { prevMin: nowMin, nextMin: nowMin, sinceMin: 0, untilMin: 0, prevKey: "", nextKey: "" };
  let pi = -1;
  for (let i = 0; i < mins.length; i++) if (mins[i]! <= nowMin) pi = i;
  let prevI: number, nextI: number, prevMin: number, nextMin: number;
  if (pi === -1) {
    prevI = sorted.length - 1; nextI = 0;
    prevMin = mins[prevI]! - 1440; nextMin = mins[0]!;
  } else if (pi === mins.length - 1) {
    prevI = pi; nextI = 0;
    prevMin = mins[pi]!; nextMin = mins[0]! + 1440;
  } else {
    prevI = pi; nextI = pi + 1;
    prevMin = mins[pi]!; nextMin = mins[pi + 1]!;
  }
  return {
    prevMin, nextMin, sinceMin: nowMin - prevMin, untilMin: nextMin - nowMin,
    prevKey: sorted[prevI]!.key, nextKey: sorted[nextI]!.key,
  };
}

/** Human duration, e.g. 72 → "1h 12m", 12 → "12m". */
export function fmtDur(min: number) {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h}h ${r.toString().padStart(2, "0")}m` : `${r}m`;
}

/**
 * A tapered "comet tail" ribbon riding the ring, from `nowMin` back over
 * `coveredMin`. Returns fading quads — wide at the head, pinching to nothing at the
 * tail — so it reads as a smooth comet. `radiusFn(t)` is the (possibly bumped) path.
 */
export function tailRibbon(
  nowMin: number,
  coveredMin: number,
  radiusFn: (t: number) => number,
  halfW: number,
  cx: number,
  cy: number,
  segments = 28
) {
  const at = (i: number) => {
    const f = i / segments;
    const t = (nowMin - f * coveredMin) / 1440;
    return { t, hw: halfW * (1 - f) ** 0.7, f, r: radiusFn(t) };
  };
  const out: { d: string; o: number }[] = [];
  let a = at(0);
  for (let i = 1; i <= segments; i++) {
    const b = at(i);
    const oa = ptAt(a.t, a.r + a.hw, cx, cy);
    const ob = ptAt(b.t, b.r + b.hw, cx, cy);
    const ib = ptAt(b.t, b.r - b.hw, cx, cy);
    const ia = ptAt(a.t, a.r - a.hw, cx, cy);
    out.push({
      d: `M ${oa.x.toFixed(2)} ${oa.y.toFixed(2)} L ${ob.x.toFixed(2)} ${ob.y.toFixed(2)} L ${ib.x.toFixed(2)} ${ib.y.toFixed(2)} L ${ia.x.toFixed(2)} ${ia.y.toFixed(2)} Z`,
      o: (1 - a.f) ** 1.3,
    });
    a = b;
  }
  return out;
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
