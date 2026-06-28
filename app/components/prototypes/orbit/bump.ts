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
