// Sphere-projected Moon — TypeScript port of design/moon-sphere.js (kept faithful so the
// Android widget's Kotlin port can follow the same source).
//
// Two independent halves, both pure (no DOM, no globals, no dependencies):
//
// 1. ASTRONOMY — `moonView(date, lat, lng, { orientation })` returns everything needed to draw
//    the Moon as seen from a place at an instant:
//      phase (0 = new, .5 = full), illuminated fraction, phase angle i,
//      bright-limb position angle χ, lunar-axis position angle P, parallactic angle q,
//      optical libration (l, b) = selenographic lon/lat of the sub-Earth point,
//      altitude/azimuth of Moon and Sun,
//    and, pre-combined for the renderer, the on-screen angles of the bright limb and of the
//    lunar north pole (CCW from screen-up) for a "zenith-up" (as seen in the sky) or
//    "north-up" (celestial north up, like an atlas) presentation.
//    Sources: Meeus, "Astronomical Algorithms" 2nd ed. — Sun ch. 25 (low accuracy),
//    Moon ch. 47 (the 14 largest longitude/distance terms and 8 latitude terms),
//    illumination ch. 48, libration & position angle ch. 53 (optical part only).
//    Accuracy (vs. full theory): Moon λ/β ≈ 0.05°, distance ≈ 100 km; Sun ≈ 0.01°;
//    phase/fraction ≈ 0.1 %; χ and q ≈ 0.1°; libration l, b ≈ 0.05° (checked against Meeus
//    Example 53.a: l −1.218° vs −1.206°, b 4.194° vs 4.194°, P 15.06° vs 15.08°).
//    Not modelled: physical libration (≤ 0.04°), nutation (≤ 0.005°), TT−UT (~70 s),
//    topocentric libration/parallax of the disc centre (≤ ~1°; diurnal) — all invisible
//    at widget/stage sizes. Altitude includes horizontal parallax (≈ 1°), no refraction.
//
// 2. RENDERER — `prepareMoonMap(imageData)` turns an equirectangular map (lon −180…180 left→right,
//    lat +90…−90 top→bottom; e.g. NASA SVS CGI Moon Kit LROC colour, 1024×512) into linear
//    floats once; `renderMoon(out, map, params)` fills a square RGBA ImageData with an
//    orthographic view of the sphere: per output pixel → sphere normal → rotate by the pole
//    angle → selenographic lat/lon via the sub-observer point → bilinear map lookup →
//    lunar photometry (Lommel–Seeliger blended with a little Lambert, soft terminator,
//    albedo-dependent terminator jitter, mild limb darkening, earthshine on the night side).
//    Alpha is anti-aliased coverage of the disc; pixels outside are transparent.
//    `moonGlow()` returns the soft halo as plain numbers (centre, radii, colour stops) so each
//    platform can draw it with its own radial gradient under the disc.
//    Cost is one pass over the disc's bounding box: ~N²·0.6 pixel evaluations for an N×N output.

const RAD = Math.PI / 180;
const norm360 = (x: number) => ((x % 360) + 360) % 360;

/** Julian Day (UT used as TT; ΔT ignored). */
export function julianDay(date: Date): number {
  return date.getTime() / 864e5 + 2440587.5;
}

/** Sun, geocentric apparent ecliptic longitude and distance (Meeus ch. 25, low accuracy). T = Julian centuries since J2000; lambda & eps in radians. */
export function sunEcliptic(T: number): { lambda: number; distKm: number; eps: number } {
  const L0 = 280.46646 + 36000.76983 * T, M = (357.52911 + 35999.05029 * T) * RAD, e = 0.016708634 - 0.000042037 * T;
  const C = (1.914602 - 0.004817 * T) * Math.sin(M) + 0.019993 * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M);
  const om = (125.04 - 1934.136 * T) * RAD, v = M + C * RAD;
  const lambda = (L0 + C - 0.00569 - 0.00478 * Math.sin(om)) * RAD;
  const distKm = 149597870.7 * (1.000001018 * (1 - e * e)) / (1 + e * Math.cos(v));
  const eps = (23.4392911 - 0.0130042 * T + 0.00256 * Math.cos(om)) * RAD;
  return { lambda, distKm, eps };
}

export interface MoonEcliptic {
  lambda: number;
  beta: number;
  distKm: number;
  F: number;
  omega: number;
}

/** Moon, geocentric ecliptic position + the fundamental arguments libration needs (Meeus ch. 47, truncated). Radians / km. */
export function moonEcliptic(T: number): MoonEcliptic {
  const Lp = norm360(218.3164477 + 481267.88123421 * T), D = norm360(297.8501921 + 445267.1114034 * T);
  const M = norm360(357.5291092 + 35999.0502909 * T), Mp = norm360(134.9633964 + 477198.8675055 * T);
  const F = norm360(93.272095 + 483202.0175233 * T), Om = norm360(125.0445479 - 1934.1362891 * T);
  const E = 1 - 0.002516 * T, s = (d: number) => Math.sin(d * RAD), c = (d: number) => Math.cos(d * RAD);
  const lon = Lp + 6.288774 * s(Mp) + 1.274027 * s(2 * D - Mp) + 0.658314 * s(2 * D) + 0.213618 * s(2 * Mp) - 0.185116 * E * s(M) - 0.114332 * s(2 * F)
    + 0.058793 * s(2 * D - 2 * Mp) + 0.057066 * E * s(2 * D - M - Mp) + 0.053322 * s(2 * D + Mp) + 0.045758 * E * s(2 * D - M) - 0.040923 * E * s(M - Mp)
    - 0.03472 * s(D) - 0.030383 * E * s(M + Mp) + 0.015327 * s(2 * D - 2 * F);
  const lat = 5.128122 * s(F) + 0.280602 * s(Mp + F) + 0.277693 * s(Mp - F) + 0.173237 * s(2 * D - F) + 0.055413 * s(2 * D - Mp + F)
    + 0.046271 * s(2 * D - Mp - F) + 0.032573 * s(2 * D + F) + 0.017198 * s(2 * Mp + F);
  const dist = 385000.56 + (-20905.355 * c(Mp) - 3699.111 * c(2 * D - Mp) - 2955.968 * c(2 * D) - 569.925 * c(2 * Mp) + 48.888 * E * c(M) - 3.149 * c(2 * F)
    + 246.158 * c(2 * D - 2 * Mp) - 152.138 * E * c(2 * D - M - Mp) - 170.733 * c(2 * D + Mp) - 204.586 * E * c(2 * D - M) - 129.62 * E * c(M - Mp)
    + 108.743 * c(D) + 104.755 * E * c(M + Mp)) / 1000;
  return { lambda: lon * RAD, beta: lat * RAD, distKm: dist, F: F * RAD, omega: Om * RAD };
}

/** Ecliptic → equatorial, radians. */
export function eclToEq(lambda: number, beta: number, eps: number): { ra: number; dec: number } {
  return {
    ra: Math.atan2(Math.sin(lambda) * Math.cos(eps) - Math.tan(beta) * Math.sin(eps), Math.cos(lambda)),
    dec: Math.asin(Math.sin(beta) * Math.cos(eps) + Math.cos(beta) * Math.sin(eps) * Math.sin(lambda)),
  };
}

/** Local horizontal coordinates + parallactic angle. lat/lng in degrees (east +). Angles returned in radians; azimuth from north, eastward. */
export function horizontal(jd: number, ra: number, dec: number, lat: number, lng: number) {
  const gmst = norm360(280.46061837 + 360.98564736629 * (jd - 2451545)) * RAD;
  const H = gmst + lng * RAD - ra, phi = lat * RAD;
  const altitude = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const azimuth = (Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) + Math.PI) % (2 * Math.PI);
  const parallactic = Math.atan2(Math.sin(H), Math.tan(phi) * Math.cos(dec) - Math.sin(dec) * Math.cos(H));
  return { altitude, azimuth, parallactic, hourAngle: H };
}

/**
 * Optical libration and position angle of the lunar axis (Meeus ch. 53, ρ = σ = 0), radians.
 * l, b = selenographic lon/lat of the sub-Earth point (l > 0: more of the eastern limb / Mare
 * Crisium is visible); P = position angle of the Moon's north pole, from celestial north
 * through east (CCW on a north-up sky view).
 */
export function libration(moon: MoonEcliptic, eps: number, moonRa: number): { l: number; b: number; P: number } {
  const I = 1.54242 * RAD, W = moon.lambda - moon.omega, b0 = moon.beta;
  const A = Math.atan2(Math.sin(W) * Math.cos(b0) * Math.cos(I) - Math.sin(b0) * Math.sin(I), Math.cos(W) * Math.cos(b0));
  let l = A - moon.F; l = Math.atan2(Math.sin(l), Math.cos(l));
  const b = Math.asin(-Math.sin(W) * Math.cos(b0) * Math.sin(I) - Math.sin(b0) * Math.cos(I));
  const X = Math.sin(I) * Math.sin(moon.omega), Y = Math.sin(I) * Math.cos(moon.omega) * Math.cos(eps) - Math.cos(I) * Math.sin(eps);
  const P = Math.asin(Math.min(1, Math.max(-1, Math.sqrt(X * X + Y * Y) * Math.cos(moonRa - Math.atan2(X, Y)) / Math.cos(b))));
  return { l, b, P };
}

export interface MoonView {
  /** 0 = new, .25 first quarter, .5 full, .75 last quarter */
  phase: number;
  /** illuminated fraction 0..1 */
  fraction: number;
  /** i, radians (π = new, 0 = full) */
  phaseAngle: number;
  /** χ, radians, from celestial north through east */
  brightLimbPA: number;
  /** P, radians, from celestial north through east */
  axisPA: number;
  /** q, radians (0 when orientation = "north") */
  parallactic: number;
  /** l, radians (sub-observer selenographic longitude) */
  libLon: number;
  /** b, radians (sub-observer selenographic latitude) */
  libLat: number;
  /** on-screen bright-limb direction, radians CCW from screen-up (χ − q) */
  limbAngle: number;
  /** on-screen lunar-north direction, radians CCW from screen-up (P − q) */
  poleAngle: number;
  /** Moon altitude, radians (with parallax) */
  altitude: number;
  /** Moon azimuth, radians from north */
  azimuth: number;
  /** Sun altitude, radians */
  sunAltitude: number;
  distanceKm: number;
}

/**
 * Everything the renderer needs, for one place and instant. lat/lng in degrees (north/east +).
 * orientation "zenith" (default) = as seen in the sky, zenith up; "north" = celestial north up.
 */
export function moonView(date: Date, lat: number, lng: number, opts: { orientation?: "zenith" | "north" } = {}): MoonView {
  const jd = julianDay(date), T = (jd - 2451545) / 36525;
  const sun = sunEcliptic(T), moon = moonEcliptic(T), eps = sun.eps;
  const s = eclToEq(sun.lambda, 0, eps), m = eclToEq(moon.lambda, moon.beta, eps);
  // phase angle i and illuminated fraction (Meeus 48.2–48.4)
  const psi = Math.acos(Math.cos(moon.beta) * Math.cos(moon.lambda - sun.lambda));
  const i = Math.atan2(sun.distKm * Math.sin(psi), moon.distKm - sun.distKm * Math.cos(psi));
  const fraction = (1 + Math.cos(i)) / 2;
  const waxing = Math.sin(moon.lambda - sun.lambda) > 0;
  const phase = waxing ? (Math.PI - i) / (2 * Math.PI) : (Math.PI + i) / (2 * Math.PI);
  // bright-limb position angle χ (Meeus 48.5)
  const chi = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
  const lib = libration(moon, eps, m.ra);
  const hz = horizontal(jd, m.ra, m.dec, lat, lng), hs = horizontal(jd, s.ra, s.dec, lat, lng);
  const altitude = hz.altitude - Math.asin((6378.14 / moon.distKm) * Math.cos(hz.altitude));
  const q = opts.orientation === "north" ? 0 : hz.parallactic;
  return {
    phase, fraction, phaseAngle: i, brightLimbPA: chi, axisPA: lib.P, parallactic: q, libLon: lib.l, libLat: lib.b,
    limbAngle: chi - q, poleAngle: lib.P - q, altitude, azimuth: hz.azimuth, sunAltitude: hs.altitude, distanceKm: moon.distKm,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Renderer
// ─────────────────────────────────────────────────────────────────────────────
const toLin = (c: number) => Math.pow(c, 2.2);
const toSrgb = (c: number) => Math.pow(c > 0 ? c : 0, 1 / 2.2);
export const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Linear-RGB floats, row-major. */
export interface MoonMap {
  w: number;
  h: number;
  data: Float32Array;
  mean: number;
}

interface Rgba {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

/**
 * Decode an equirectangular map once. `contrast` stretches around the mean in sRGB (1.25 matches the
 * design's pre-projected disc; the app uses 1.12). `mean` = average linear green over the near side
 * (|lat|, |lon| < 60°).
 */
export function prepareMoonMap(img: Rgba, opts: { contrast?: number } = {}): MoonMap {
  const { width: w, height: h, data: px } = img, k = opts.contrast ?? 1.25;
  let m = 0; for (let i = 0; i < w * h; i++) m += px[i * 4 + 1]!; m /= w * h * 255;
  const lut = new Float32Array(256);
  for (let v = 0; v < 256; v++) lut[v] = toLin(Math.min(1, Math.max(0, m + (v / 255 - m) * k)));
  const data = new Float32Array(w * h * 3);
  let sum = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    data[i * 3] = lut[px[i * 4]!]!; data[i * 3 + 1] = lut[px[i * 4 + 1]!]!; data[i * 3 + 2] = lut[px[i * 4 + 2]!]!;
    if (Math.abs(x / w - .5) < 1 / 6 && Math.abs(y / h - .5) < 1 / 3) { sum += data[i * 3 + 1]!; n++; }
  }
  return { w, h, data, mean: sum / n };
}

export interface RenderParams {
  /** sub-observer selenographic longitude, radians (MoonView.libLon) */
  subLon: number;
  /** sub-observer selenographic latitude, radians (MoonView.libLat) */
  subLat: number;
  /** lunar north on screen, radians CCW from up (MoonView.poleAngle) */
  poleAngle: number;
  /** i, radians (MoonView.phaseAngle) */
  phaseAngle: number;
  /** bright limb on screen, radians CCW from up (MoonView.limbAngle) */
  limbAngle: number;
  /** disc diameter as a fraction of the output width (room for the glow); default .72 */
  disc?: number;
  /** multiplier on the default earthshine (0 = off); default 1 */
  earthshine?: number;
  /** overrides the default auto exposure (crescents a little brighter) */
  exposure?: number;
  /** overlay a 30° selenographic grid (equator + prime meridian amber) */
  graticule?: boolean;
}

/**
 * The orthographic sphere for one render, shared by the photo renderer and the illustrated
 * styles (styles.ts): disc geometry, the sun direction in screen space, and the rotations
 * screen → lunar-north-up → body frame. Build once per render with `sphereFrame()`, then map
 * pixels with `projectPixel()` (screen → surface) or surface points with `projectBody()`.
 */
export interface SphereFrame {
  W: number;
  /** disc radius and centre, px */
  R: number;
  c0: number;
  /** bounding box of the disc (same range for x and y), px */
  x0: number;
  x1: number;
  /** illuminated fraction */
  frac: number;
  /** sun direction, screen space (x right, y up, z toward viewer) */
  Sx: number;
  Sy: number;
  Sz: number;
  /** cos/sin of the pole angle and of the sub-observer lon/lat */
  cp: number;
  sp: number;
  sl: number;
  cl: number;
  sb: number;
  cb: number;
}

export function sphereFrame(W: number, p: RenderParams): SphereFrame {
  const disc = p.disc ?? .72, R = W * disc / 2, c0 = W / 2, inc = p.phaseAngle;
  const lx = -Math.sin(p.limbAngle), ly = Math.cos(p.limbAngle);
  return {
    W, R, c0, x0: Math.max(0, Math.floor(c0 - R - 2)), x1: Math.min(W, Math.ceil(c0 + R + 2)), frac: (1 + Math.cos(inc)) / 2,
    Sx: Math.sin(inc) * lx, Sy: Math.sin(inc) * ly, Sz: Math.cos(inc),
    // screen → lunar-north-up: rotate by −poleAngle; lunar-north-up view → body frame (X → lat 0/lon 0, Y → lon 90° E, Z → north pole)
    cp: Math.cos(p.poleAngle), sp: Math.sin(p.poleAngle),
    sl: Math.sin(p.subLon), cl: Math.cos(p.subLon), sb: Math.sin(p.subLat), cb: Math.cos(p.subLat),
  };
}

/** Output slots of `projectPixel`. */
export const PX_X = 0, PX_Y = 1, PX_Z = 2, PX_LAT = 3, PX_LON = 4, PX_MU0 = 5;

/**
 * Pixel (i, j) → point on the sphere. Returns the anti-aliased disc coverage (≤ 0: off the disc,
 * `o` untouched); otherwise writes x, y (disc units, y up), z (normal toward viewer), selenographic
 * lat/lon (radians) and μ0 (cosine to the sun, unclipped) into `o` at the PX_* slots.
 */
export function projectPixel(f: SphereFrame, i: number, j: number, o: Float64Array): number {
  const x = (i + .5 - f.c0) / f.R, y = -(j + .5 - f.c0) / f.R, rr = x * x + y * y;
  const cov = Math.min(1, Math.max(0, (1 - Math.sqrt(rr)) * f.R + .5));
  if (cov <= 0) return 0;
  const z = Math.sqrt(1 - Math.min(rr, 1));
  const { cp, sp, sl, cl, sb, cb } = f;
  const xr = x * cp + y * sp, yr = -x * sp + y * cp;
  const Px = -xr * sl - yr * sb * cl + z * cb * cl, Py = xr * cl - yr * sb * sl + z * cb * sl, Pz = yr * cb + z * sb;
  o[0] = x; o[1] = y; o[2] = z;
  o[3] = Math.asin(Math.max(-1, Math.min(1, Pz))); o[4] = Math.atan2(Py, Px);
  o[5] = x * f.Sx + y * f.Sy + z * f.Sz;
  return cov;
}

/**
 * Body-frame unit vector (X, Y, Z) → screen. Returns the normal's z (≤ 0: far side, `o` untouched);
 * otherwise writes the pixel position fx, fy into o[0], o[1]. Inverse of `projectPixel`.
 */
export function projectBody(f: SphereFrame, X: number, Y: number, Z: number, o: Float64Array): number {
  const { cp, sp, sl, cl, sb, cb } = f;
  const z = cb * cl * X + cb * sl * Y + sb * Z;
  if (z <= 0) return z;
  const xr = -sl * X + cl * Y, yr = -sb * cl * X - sb * sl * Y + cb * Z;
  o[0] = f.c0 + (xr * cp - yr * sp) * f.R; o[1] = f.c0 - (xr * sp + yr * cp) * f.R;
  return z;
}

const PIX = new Float64Array(6);

/** Fill `out` (square RGBA ImageData-like) with the lit sphere. */
export function renderMoon<T extends { width: number; height: number; data: Uint8ClampedArray }>(out: T, map: MoonMap, p: RenderParams): T {
  const W = out.width, px = out.data, f = sphereFrame(W, p), R = f.R, o = PIX;
  const { w: mw, h: mh, data, mean } = map;
  const frac = f.frac;
  const es = (.0008 + .008 * (1 - frac) * (1 - frac)) * (p.earthshine ?? 1);
  const expo = p.exposure ?? 1.02 + .3 * (1 - frac);
  const grat = !!p.graticule, gW = .7 / R / RAD; // half-width of a grid line in degrees (≈ 1.4 px at disc centre)
  px.fill(0);
  for (let j = f.x0; j < f.x1; j++) for (let i = f.x0; i < f.x1; i++) {
    const cov = projectPixel(f, i, j, o);
    if (cov <= 0) continue;
    const z = o[2]!, lat = o[3]!, lon = o[4]!;
    // bilinear lookup, wrapping in longitude
    const u = (lon / (2 * Math.PI) + .5) * mw - .5;
    let v = (.5 - lat / Math.PI) * mh - .5;
    if (v < 0) v = 0; else if (v > mh - 1.001) v = mh - 1.001;
    const ui = Math.floor(u), vi = v | 0, fu = u - ui, fv = v - vi;
    const ua = ((ui % mw) + mw) % mw, ub = (ua + 1) % mw;
    const o00 = (vi * mw + ua) * 3, o10 = (vi * mw + ub) * 3, o01 = o00 + mw * 3, o11 = o10 + mw * 3;
    const w00 = (1 - fu) * (1 - fv), w10 = fu * (1 - fv), w01 = (1 - fu) * fv, w11 = fu * fv;
    const A0 = data[o00]! * w00 + data[o10]! * w10 + data[o01]! * w01 + data[o11]! * w11;
    const A1 = data[o00 + 1]! * w00 + data[o10 + 1]! * w10 + data[o01 + 1]! * w01 + data[o11 + 1]! * w11;
    const A2 = data[o00 + 2]! * w00 + data[o10 + 2]! * w10 + data[o01 + 2]! * w01 + data[o11 + 2]! * w11;
    // photometry: Lommel–Seeliger (flat full moon) + a little Lambert → gentle limb darkening
    const mu0raw = o[5]!, mu = Math.max(z, .02);
    const m0 = mu0raw + (A1 - mean) * .35 * .25;        // dark maria catch the light a touch later
    const s = m0 > 0 ? m0 : 0;
    const ls = Math.min(2 * s / (s + mu), 1.25);
    let L = (.72 * ls + .28 * s) * smooth(-.012, .05, m0);
    L *= .9 + .1 * Math.sqrt(mu);
    const dark = 1 - smooth(-.05, .02, m0);
    let r = A0 * L * expo + A0 * es * dark * .72 + .0012;
    let g = A1 * L * .985 * expo + A1 * es * dark * .82 + .0016;
    let b = A2 * L * .955 * expo + A2 * es * dark + .0042;
    if (grat) {
      const near30 = (deg: number) => { const d = ((deg % 30) + 30) % 30; return Math.min(d, 30 - d); };
      const onLat = near30(lat / RAD) < gW, onLon = near30(lon / RAD) * Math.cos(lat) < gW && Math.abs(lat) < 80 * RAD;
      if (onLat || onLon) {
        const key = (onLat && Math.abs(lat) < .2) || (onLon && Math.abs(lon) < .2);
        const a = key ? .8 : .45, cr = key ? [1, .62, .15] : [.6, .85, 1];
        r = r * (1 - a) + cr[0]! * a * .5; g = g * (1 - a) + cr[1]! * a * .5; b = b * (1 - a) + cr[2]! * a * .5;
      }
    }
    const q = (j * W + i) * 4;
    px[q] = toSrgb(r) * 255; px[q + 1] = toSrgb(g) * 255; px[q + 2] = toSrgb(b) * 255; px[q + 3] = cov * 255;
  }
  return out;
}

export interface MoonGlow {
  cx: number;
  cy: number;
  r0: number;
  r1: number;
  stops: [number, string][];
}

/**
 * Soft halo under the disc, leaning toward the lit side for crescents. Pure numbers; draw with a
 * radial gradient (canvas createRadialGradient / Android RadialGradient) before the disc.
 * W = output width in px.
 */
export function moonGlow(W: number, disc: number, phaseAngle: number, limbAngle: number, rgb: [number, number, number] = [205, 214, 255]): MoonGlow {
  const R = W * disc / 2, c0 = W / 2, frac = (1 + Math.cos(phaseAngle)) / 2, k = .22 * Math.sin(phaseAngle);
  const cx = c0 - Math.sin(limbAngle) * R * k, cy = c0 - Math.cos(limbAngle) * R * k;
  const a = .05 + .22 * Math.pow(frac, .8), c = rgb.join(",");
  return { cx, cy, r0: R * .85, r1: Math.min(R * 1.55, W / 2 - R * k), stops: [[0, `rgba(${c},${a})`], [.4, `rgba(${c},${a * .35})`], [1, `rgba(${c},0)`]] };
}
