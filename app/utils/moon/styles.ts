// Illustrated Moon styles — TypeScript port of design/moon-styles.js (approved in
// design/stage-and-moon.html, "Moon style"; Contours was dropped and is not shipped).
//
// Every style is driven by the same astronomy and projection as the photographic sphere
// (sphere.ts: moonView → RenderParams → sphereFrame/projectPixel/projectBody), so terminator,
// libration and the tilt for the selected city are always true. Only the "paint" differs.
//
// Pipeline (pure, no DOM):
//   1. sphereFields(): one pass over the disc → per-pixel coverage, normal, selenographic lat/lon,
//      sun cosine μ0, and an albedo sample from a mip level matched to the disc size.
//   2. a style pass turns those fields into RGBA. Line styles get screen-space derivatives
//      ("fwidth") from neighbouring pixels, so hatching anti-aliases and fades to an even tone
//      where lines would crowd.
//   3. dot styles (stipple, manuscript maria, lapis flecks) splat points of a jittered Fibonacci
//      lattice fixed to the lunar surface, so the dots turn with libration and tilt.
//
// Maps: albedo = NASA SVS CGI Moon Kit LROC WAC colour as greyscale (albedo-512.webp); duotone
// samples the full LROC map (the photo's lroc-1024.webp) as greyscale. Public domain (NASA SVS).

import { PX_LAT, PX_LON, PX_MU0, PX_X, PX_Y, PX_Z, projectBody, projectPixel, renderMoon, smooth, sphereFrame, type MoonMap, type RenderParams, type SphereFrame } from "./sphere";

export const MOON_STYLES = ["photo", "engraved", "manuscript", "duotone", "stipple", "glass"] as const;
export type MoonStyle = (typeof MOON_STYLES)[number];
export const isMoonStyle = (v: unknown): v is MoonStyle => typeof v === "string" && (MOON_STYLES as readonly string[]).includes(v);

const TAU = Math.PI * 2;
const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
type Rgb = [number, number, number];
const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// ─── maps ────────────────────────────────────────────────────────────────────
/** One mip level of a greyscale equirectangular map, 0…1. */
export interface GreyLevel {
  w: number;
  h: number;
  d: Float32Array;
}
/** Mip chain, level 0 = source. */
export type GreyChain = GreyLevel[];

/** Greyscale equirectangular map (RGBA, uses luminance) → mip chain of Float32 (0…1). */
export function prepareGrey(img: { width: number; height: number; data: Uint8ClampedArray | Uint8Array }): GreyChain {
  const { width: w, height: h, data: px } = img, d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = (px[i * 4]! * .2126 + px[i * 4 + 1]! * .7152 + px[i * 4 + 2]! * .0722) / 255;
  const chain: GreyChain = [{ w, h, d }];
  let s = chain[0]!;
  while (s.w > 32) {
    const nw = s.w >> 1, nh = s.h >> 1, n = new Float32Array(nw * nh), sd = s.d;
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      const a = 2 * y * s.w + 2 * x;
      n[y * nw + x] = (sd[a]! + sd[a + 1]! + sd[a + s.w]! + sd[a + s.w + 1]!) / 4;
    }
    s = { w: nw, h: nh, d: n };
    chain.push(s);
  }
  return chain;
}
// Level whose texel ≈ the output pixel at the disc centre (map width ≈ 2πR · k).
function pick(chain: GreyChain, R: number, k = .8): GreyLevel {
  let L = chain[0]!;
  for (const c of chain) if (c.w >= TAU * R * k) L = c;
  return L;
}
function sample(L: GreyLevel, lat: number, lon: number): number {
  const { w, h, d } = L;
  const u = (lon / TAU + .5) * w - .5;
  let v = (.5 - lat / Math.PI) * h - .5;
  if (v < 0) v = 0; else if (v > h - 1.001) v = h - 1.001;
  const ui = Math.floor(u), vi = v | 0, fu = u - ui, fv = v - vi, ua = ((ui % w) + w) % w, ub = (ua + 1) % w;
  const o = vi * w;
  return (d[o + ua]! * (1 - fu) + d[o + ub]! * fu) * (1 - fv) + (d[o + w + ua]! * (1 - fu) + d[o + w + ub]! * fu) * fv;
}

// ─── geometry pass ───────────────────────────────────────────────────────────
// Scratch arrays per output size, allocated on first use. Only a few sizes live at once
// (stage, tray, chip, picker thumbnails); drop them all if that ever grows.
const scratch = new Map<number, Float32Array[]>();
function buf(W: number, n: number): Float32Array {
  let s = scratch.get(W);
  if (!s) {
    if (scratch.size >= 6) scratch.clear();
    s = [];
    scratch.set(W, s);
  }
  return (s[n] ??= new Float32Array(W * W));
}

/** Per-pixel sphere fields for one render. Arrays are W×W, valid where cov > 0. */
interface Fields {
  f: SphereFrame;
  W: number;
  R: number;
  x0: number;
  x1: number;
  frac: number;
  cov: Float32Array;
  z: Float32Array;
  nx: Float32Array;
  ny: Float32Array;
  mu0: Float32Array;
  lat: Float32Array;
  lon: Float32Array;
  A: Float32Array;
}

const PIX = new Float64Array(6);

function sphereFields(W: number, p: RenderParams, alb: GreyChain, albK: number): Fields {
  const f = sphereFrame(W, p), R = f.R, o = PIX;
  const cov = buf(W, 0), z = buf(W, 1), mu0 = buf(W, 2), lat = buf(W, 3), lon = buf(W, 4), A = buf(W, 5), nx = buf(W, 7), ny = buf(W, 8);
  cov.fill(0);
  const La = pick(alb, R, albK);
  for (let j = f.x0; j < f.x1; j++) for (let i = f.x0; i < f.x1; i++) {
    const c = projectPixel(f, i, j, o);
    if (c <= 0) continue;
    const q = j * W + i, la = o[PX_LAT]!, lo = o[PX_LON]!;
    cov[q] = c; z[q] = o[PX_Z]!; nx[q] = o[PX_X]!; ny[q] = o[PX_Y]!; lat[q] = la; lon[q] = lo; mu0[q] = o[PX_MU0]!;
    A[q] = sample(La, la, lo);
  }
  return { f, W, R, x0: f.x0, x1: f.x1, frac: f.frac, cov, z, nx, ny, mu0, lat, lon, A };
}
// screen-space derivative magnitude of a field (forward differences, falling back to backward at the rim)
function fwidth(F: Fields, a: Float32Array, q: number, wrap = 0): number {
  const W = F.W, c = F.cov;
  const dx = c[q + 1]! > 0 ? a[q + 1]! - a[q]! : a[q]! - a[q - 1]!, dy = c[q + W]! > 0 ? a[q + W]! - a[q]! : a[q]! - a[q - W]!;
  if (!wrap) return Math.abs(dx) + Math.abs(dy);
  const w = (d: number) => { d = Math.abs(d); return d > wrap / 2 ? wrap - d : d; };
  return w(dx) + w(dy);
}
// Lunar photometry (as the photo renderer): Lommel–Seeliger + a little Lambert; `soft` widens the terminator.
function lunarL(mu0: number, z: number, soft = .05): number {
  const s = mu0 > 0 ? mu0 : 0, mu = z > .02 ? z : .02, ls = Math.min(2 * s / (s + mu), 1.25);
  return (.72 * ls + .28 * s) * smooth(-soft * .25, soft, mu0);
}
const earthshine = (frac: number) => .02 + .1 * (1 - frac) * (1 - frac);
// albedo (sRGB grey, maria ≈ .30, highlands ≈ .62) → relative reflectance for illustration
const albN = (a: number) => .28 + .72 * clamp((a - .26) / .38);

// jittered Fibonacci lattice on the unit sphere, fixed to the Moon (body frame); cached per count
const latCache = new Map<number, Float32Array>();
function lattice(N: number): Float32Array {
  let L = latCache.get(N);
  if (L) return L;
  L = new Float32Array(N * 4);
  const ga = Math.PI * (3 - Math.sqrt(5)), jit = 2.4 / Math.sqrt(N);
  let s = 12345;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < N; i++) {
    const y = 1 - 2 * (i + .5) / N, r = Math.sqrt(1 - y * y), ph = i * ga;
    const X = r * Math.cos(ph) + (rnd() - .5) * jit, Y = r * Math.sin(ph) + (rnd() - .5) * jit, Z = y + (rnd() - .5) * jit;
    const n = Math.hypot(X, Y, Z);
    L[i * 4] = X / n; L[i * 4 + 1] = Y / n; L[i * 4 + 2] = Z / n; L[i * 4 + 3] = rnd();
  }
  if (latCache.size >= 8) latCache.clear();
  latCache.set(N, L);
  return L;
}
/**
 * Splat surface-fixed dots. `radius(q, rnd)` → dot radius in px for the pixel under the dot (≤ 0 = skip).
 * Coverage is max-accumulated into `acc` (W×W).
 */
function splat(F: Fields, spacing: number, acc: Float32Array, radius: (q: number, rnd: number) => number): Float32Array {
  const { W, R, cov, f } = F, o = PIX;
  const N = Math.round(4 * Math.PI * R * R / (spacing * spacing)), L = lattice(N);
  acc.fill(0, 0, W * W);
  for (let k = 0; k < N; k++) {
    if (projectBody(f, L[k * 4]!, L[k * 4 + 1]!, L[k * 4 + 2]!, o) <= .03) continue;
    const fx = o[0]!, fy = o[1]!;
    const q = (fy | 0) * W + (fx | 0);
    if (!(cov[q]! > .5)) continue;
    const r = radius(q, L[k * 4 + 3]!);
    if (r <= .05) continue;
    // ellipse foreshortened toward the limb is too fussy at 1–2 px; draw circles, area-compensated by the caller
    const ext = Math.ceil(r + 1), ix = fx | 0, iy = fy | 0;
    for (let v = iy - ext; v <= iy + ext; v++) for (let u = ix - ext; u <= ix + ext; u++) {
      if (u < 0 || v < 0 || u >= W || v >= W) continue;
      const d = Math.hypot(u + .5 - fx, v + .5 - fy), c = clamp(r - d + .5) * (r < .7 ? r / .7 : 1), oq = v * W + u;
      if (c > acc[oq]!) acc[oq] = c;
    }
  }
  return acc;
}

interface Out {
  width: number;
  data: Uint8ClampedArray;
}
function put(out: Out, q: number, c: Rgb, a: number): void {
  const px = out.data, o = q * 4;
  px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = a * 255;
}
function each(F: Fields, fn: (q: number) => void): void {
  const { W, x0, x1, cov } = F;
  for (let j = x0; j < x1; j++) for (let i = x0; i < x1; i++) { const q = j * W + i; if (cov[q]! > 0) fn(q); }
}
// limb hairline: coverage of a ~w px ring at the disc edge
const limbLine = (F: Fields, q: number, w = 1) => { const r = Math.hypot(F.nx[q]!, F.ny[q]!) * F.R; return clamp(1 - Math.abs(F.R - w * .5 - .5 - r) / (w * .5 + .5)); };

// ─── styles ──────────────────────────────────────────────────────────────────
const C = {
  navy: hex("#0e1434"), navyDeep: hex("#0a0f2a"), cream: hex("#f4ecd6"), ink: hex("#3a2812"),
  lapisHi: hex("#233a8e"), lapisLo: hex("#111a4c"), goldLo: hex("#a97b2c"), goldHi: hex("#f3d68a"), goldSpec: hex("#fff3cf"), sepia: hex("#6e4a1c"),
};
const lerp3 = (a: Rgb, b: Rgb, t: number): Rgb => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

/** Engraved — copperplate hatching along the lunar parallels, line width ∝ light. Cream on navy. Below R 40 px: an even tone. */
function engraved(out: Out, F: Fields): void {
  const { R, frac } = F, es = earthshine(frac), tone = buf(F.W, 9); // brightness field (0…1)
  each(F, (q) => { tone[q] = clamp(albN(F.A[q]!) * lunarL(F.mu0[q]!, F.z[q]!, .06) * 1.05); });
  const spacing = clamp(R / 34, 3, 6.5), per = spacing / R; // line period in radians of latitude at the disc centre
  const lineOK = R >= 40 ? 1 : 0;
  each(F, (q) => {
    const m0 = F.mu0[q]!, night = 1 - smooth(-.04, .04, m0), t = tone[q]!;
    const s = F.lat[q]! / per, fw = Math.max(1e-4, fwidth(F, F.lat, q) / per), d1 = Math.abs(s - Math.round(s));
    const crowd = lineOK ? smooth(.2, .45, fw) : 1;
    // family 1: parallels. Width ∝ tone (cream = light); swells from a hairline; AA with fwidth, flat tone where lines crowd
    const w1 = t > .004 ? .1 + Math.pow(t, .9) * .78 : 0;
    const c1 = mix(clamp((w1 * .5 - d1) / fw + .5), w1, crowd) * smooth(0, .06, t);
    // family 2 (brightest highlands only): meridians, a light cross-hatch
    let c2 = 0;
    const w2 = smooth(.66, .98, t) * .5;
    if (w2 > 0) {
      const cosl = Math.max(.05, Math.cos(F.lat[q]!)), s2 = F.lon[q]! * cosl / per, fw2 = Math.max(1e-4, fwidth(F, F.lon, q, TAU) * cosl / per), d2 = Math.abs(s2 - Math.round(s2));
      c2 = mix(clamp((w2 * .5 - d2) / fw2 + .5), w2, lineOK ? smooth(.2, .45, fw2) : 1);
    }
    // night side: earthshine as sparse, faint hairlines (every other parallel)
    let cn = 0;
    if (night > 0 && lineOK) {
      const s3 = s / 2, d3 = Math.abs(s3 - Math.round(s3)), fw3 = fw / 2;
      cn = clamp((.05 - d3) / fw3 + .5) * (1 - smooth(.15, .35, fw3)) * night * (.05 + es * 1.1) * (.5 + .5 * albN(F.A[q]!));
    }
    if (!lineOK) cn = night * es * .5;
    let a = 1 - (1 - c1) * (1 - c2) * (1 - cn);
    const rim = limbLine(F, q, 1.1) * (.22 + .5 * (1 - night));
    a = 1 - (1 - a) * (1 - rim);
    put(out, q, lerp3(lerp3(C.navyDeep, C.navy, F.z[q]!), C.cream, a), F.cov[q]!);
  });
}

/** Stipple — pen-and-ink dots on a jittered lattice fixed to the Moon; dot area ∝ light (sparse dots in earthshine). Cream on navy. Below R 36 px: a tone. */
function stipple(out: Out, F: Fields): void {
  const { R, frac } = F, es = earthshine(frac), tone = buf(F.W, 9);
  each(F, (q) => { tone[q] = clamp(albN(F.A[q]!) * lunarL(F.mu0[q]!, F.z[q]!, .07) * 1.08 + es * .6 * albN(F.A[q]!) * (1 - smooth(-.05, .03, F.mu0[q]!))); });
  const small = R < 36, spacing = clamp(R / 66, 1.6, 3.4), rmax = spacing * .6;
  const acc = small ? null : splat(F, spacing, buf(F.W, 6), (q, rnd) => {
    const t = tone[q]! * Math.pow(Math.max(.15, F.z[q]!), .6);
    if (F.mu0[q]! < -.03) return rnd < .05 ? rmax * Math.sqrt(t) * 1.8 : 0;
    return rmax * Math.sqrt(t) * (.8 + .4 * rnd);
  });
  each(F, (q) => {
    let a = acc ? 1 - (1 - acc[q]! * .95) * (1 - tone[q]! * .12) : tone[q]! * .95;
    const night = 1 - smooth(-.04, .04, F.mu0[q]!);
    a = 1 - (1 - a) * (1 - limbLine(F, q, 1.1) * (.2 + .45 * (1 - night)));
    put(out, q, lerp3(lerp3(C.navyDeep, C.navy, F.z[q]!), C.cream, a), F.cov[q]!);
  });
}

/** Manuscript — lapis night side with gold flecks, gilded day side, sepia-stippled maria, ink terminator, gold rim. Below R 36 px: washes, no dots. */
function manuscript(out: Out, F: Fields): void {
  const { R } = F, small = R < 36, spacing = clamp(R / 60, 1.9, 3.6), rd = clamp(spacing * .38, .7, 1.2);
  const mare = buf(F.W, 9);
  each(F, (q) => { mare[q] = smooth(.5, .28, F.A[q]!); });
  const acc = small ? null : splat(F, spacing, buf(F.W, 6), (q, rnd) => { const m = mare[q]!; if (F.mu0[q]! < -.005) return 0; return rnd < m * .62 ? rd * (.8 + .4 * rnd) : 0; });
  // lapis flecks: a sparse lattice, a few percent of points, night side only
  const fleck = small ? null : splat(F, spacing * 3.4, buf(F.W, 10), (q, r) => (r < .06 && F.mu0[q]! < -.03 ? .55 + r * 6 : 0));
  const Lx = -.42, Ly = .56, Lz = .71; // fixed "window" light for the gold's burnish (not the sun)
  each(F, (q) => {
    const x = F.nx[q]!, y = F.ny[q]!, z = F.z[q]!, m0 = F.mu0[q]!;
    const sheen = x * Lx + y * Ly + z * Lz, g = smooth(-.1, 1, sheen);
    let gold = lerp3(C.goldLo, C.goldHi, g);
    gold = lerp3(gold, C.goldSpec, Math.pow(clamp(sheen), 14) * .6);
    const k = .82 + .18 * smooth(0, .3, m0);
    gold = [gold[0] * k, gold[1] * k, gold[2] * k];
    gold = lerp3(gold, C.sepia, mare[q]! * (small ? .45 : .16)); // a faint wash under the stipple
    if (acc) gold = lerp3(gold, C.sepia, acc[q]! * .9);
    let lap = lerp3(C.lapisLo, C.lapisHi, Math.pow(z, .8) * .75);
    lap = lerp3(lap, [lap[0] * .8, lap[1] * .84, lap[2] * .88], mare[q]! * .6);
    if (fleck) lap = lerp3(lap, C.goldHi, fleck[q]! * .7);
    const fw = Math.max(1e-4, fwidth(F, F.mu0, q)), day = clamp(m0 / fw + .5);
    let col = lerp3(lap, gold, day);
    // ink line along the terminator (≈ 1 px), only where the terminator is on the disc
    const ink = clamp(1 - Math.abs(m0) / (fw * (small ? .7 : 1.1))) * (F.frac < .995 ? .8 : 0);
    col = lerp3(col, C.ink, ink);
    col = lerp3(col, C.goldHi, limbLine(F, q, small ? 1 : 1.3) * .95);
    put(out, q, col, F.cov[q]!);
  });
}

/** Duotone — the real LROC albedo under true lunar lighting, mapped into the app's navy → indigo → cream. */
const RAMP = ([[0, "#0d1336"], [.12, "#1b2259"], [.3, "#3b3f86"], [.5, "#7577b9"], [.68, "#b3b4e6"], [.84, "#e6e1f4"], [1, "#fffaee"]] as const).map(([t, h]) => [t, hex(h)] as const);
function ramp(v: number): Rgb {
  for (let k = 1; k < RAMP.length; k++) {
    const [t1, c1] = RAMP[k]!;
    if (v <= t1) { const [t0, c0] = RAMP[k - 1]!; return lerp3(c0, c1, (v - t0) / (t1 - t0)); }
  }
  return RAMP[RAMP.length - 1]![1];
}
const LUT = Array.from({ length: 256 }, (_, i) => ramp(i / 255));
function duotone(out: Out, F: Fields): void {
  const { frac } = F, es = .002 + .016 * (1 - frac) * (1 - frac), expo = 1.95 + .5 * (1 - frac);
  each(F, (q) => {
    const m0 = F.mu0[q]!, A = F.A[q]!, al = Math.pow(clamp(.5 + (A - .5) * 1.1), 2.2), L = lunarL(m0 + (A - .45) * .02, F.z[q]!, .05);
    const dark = 1 - smooth(-.05, .02, m0);
    const lin = al * L * expo + al * es * dark + .004;
    const v = Math.pow(lin, 1 / 2.2);
    put(out, q, LUT[Math.min(255, (v * 255) | 0)]!, F.cov[q]!);
  });
}

/** Soft glass — a luminous, near-flat sphere; maria only as a breath; soft terminator and rim light. */
const G = { lav: hex("#b9c0f4"), white: hex("#f7f6ff"), deep: hex("#0b1030"), mid: hex("#161d4d"), rim: hex("#8f9bf5"), mare: hex("#8e96dc") };
const WHITE: Rgb = [255, 255, 255];
function glass(out: Out, F: Fields): void {
  const { Sx, Sy, Sz } = F.f;
  const hx = Sx, hy = Sy, hz = Sz + 1, hn = Math.hypot(hx, hy, hz);
  each(F, (q) => {
    const x = F.nx[q]!, y = F.ny[q]!, z = F.z[q]!, m0 = F.mu0[q]!;
    const day = smooth(-.14, .3, m0), mare = smooth(.5, .3, F.A[q]!);
    let lit = lerp3(G.lav, G.white, Math.pow(z, .8) * .92);
    lit = lerp3(lit, G.mare, mare * .38);
    // gentle specular from the true sun, reflected toward the viewer
    const spec = Math.pow(clamp((x * hx + y * hy + z * hz) / hn), 24) * .2;
    lit = lerp3(lit, WHITE, spec);
    const night = lerp3(G.deep, G.mid, Math.pow(z, 1.5) * .7);
    let col = lerp3(night, lit, day);
    const fres = Math.pow(1 - z, 2.4);
    col = lerp3(col, G.rim, fres * (1 - day) * .45); // cool rim on the night side
    col = lerp3(col, G.white, fres * day * .3);      // bright rim on the day side
    put(out, q, col, F.cov[q]!);
  });
}

// ─── public ──────────────────────────────────────────────────────────────────
type Painted = Exclude<MoonStyle, "photo">;
const STYLE_FNS: Record<Painted, (out: Out, F: Fields) => void> = { engraved, stipple, manuscript, duotone, glass };

/** Which map each style needs: "photo" = the LROC colour map (MoonMap), "lroc" = the same map as greyscale, "albedo" = albedo-512. */
export type MapKind = "photo" | "lroc" | "albedo";
/** Map + mip bias per style (the exploration's STYLE_SRC). */
export const STYLE_SRC: Record<MoonStyle, { map: MapKind; albK: number }> = {
  photo: { map: "photo", albK: 1 },
  engraved: { map: "albedo", albK: .5 }, stipple: { map: "albedo", albK: .4 }, manuscript: { map: "albedo", albK: .35 },
  duotone: { map: "lroc", albK: .8 }, glass: { map: "albedo", albK: .12 },
};
/** Halo colour per style (fed to sphere.ts moonGlow). */
export const STYLE_GLOW: Record<MoonStyle, [number, number, number]> = {
  photo: [205, 214, 255], engraved: [236, 228, 205], stipple: [236, 228, 205], manuscript: [243, 214, 138], duotone: [205, 214, 255], glass: [201, 207, 251],
};

/**
 * Render `style` into `out` (square RGBA ImageData-like). `map` is what STYLE_SRC[style].map
 * names: a MoonMap for "photo", a grey mip chain otherwise.
 */
export function renderStyle<T extends { width: number; height: number; data: Uint8ClampedArray }>(style: MoonStyle, out: T, map: MoonMap | GreyChain, p: RenderParams): T {
  if (style === "photo") return renderMoon(out, map as MoonMap, p);
  const F = sphereFields(out.width, p, map as GreyChain, STYLE_SRC[style].albK);
  out.data.fill(0);
  STYLE_FNS[style](out, F);
  return out;
}
