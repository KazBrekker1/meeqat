// Where the sky view looks and how directions land on the screen: a zenith-up camera with a
// stereographic projection (shapes stay true, so constellations look right even at 180°).
// Pixels are device pixels; the caller decides the canvas size and the centre point.
import { RAD, altAzOf, clamp, mulVec, wrapPi, wrapTau, type Mat3, type Vec3 } from "./vec";

export const FOV_MIN = 20;
export const FOV_MAX = 180;
/** Directions further than this behind the viewer are not drawn (they would project far off). */
const BEHIND = -0.8;

/** Explore mode's view: centre altitude and azimuth (radians) and the field of view across the width (degrees). */
export interface ViewState {
  alt: number;
  az: number;
  fovDeg: number;
}

export interface Camera {
  /** right, up and forward unit vectors in the horizon frame */
  r: Vec3;
  u: Vec3;
  f: Vec3;
  /** pixels per stereographic unit */
  k: number;
  /** where the view centre lands, and the canvas size, px */
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/** Scale for a field of view `fovDeg` across `w` pixels, and back. */
export const kForFov = (fovDeg: number, w: number) => w / 2 / (2 * Math.tan((fovDeg * RAD) / 4));
export const fovForK = (k: number, w: number) => (4 * Math.atan(w / (4 * k))) / RAD;

/** A zenith-up camera looking at (alt, az). */
export function camera(alt: number, az: number, k: number, cx: number, cy: number, w: number, h: number): Camera {
  const ca = Math.cos(alt), sa = Math.sin(alt), cz = Math.cos(az), sz = Math.sin(az);
  return { f: [ca * sz, ca * cz, sa], r: [cz, -sz, 0], u: [-sz * sa, -cz * sa, ca], k, cx, cy, w, h };
}

/** Horizon direction (read from `d` at `o`) → pixels in out[oo], out[oo + 1]; false when behind the viewer. */
export function project(cam: Camera, d: ArrayLike<number>, out: number[] | Float32Array, o = 0, oo = 0): boolean {
  const x = d[o]!, y = d[o + 1]!, z = d[o + 2]!;
  const X = x * cam.r[0] + y * cam.r[1] + z * cam.r[2];
  const Y = x * cam.u[0] + y * cam.u[1] + z * cam.u[2];
  const Z = x * cam.f[0] + y * cam.f[1] + z * cam.f[2];
  if (Z < BEHIND) return false;
  const s = (2 / (1 + Z)) * cam.k;
  out[oo] = cam.cx + X * s;
  out[oo + 1] = cam.cy - Y * s;
  return true;
}

/** Pixels → horizon direction (unit vector). */
export function unproject(cam: Camera, px: number, py: number): Vec3 {
  const x = (px - cam.cx) / cam.k, y = (cam.cy - py) / cam.k, p2 = x * x + y * y;
  const Z = (4 - p2) / (4 + p2), h = (1 + Z) / 2, X = x * h, Y = y * h;
  return [
    X * cam.r[0] + Y * cam.u[0] + Z * cam.f[0],
    X * cam.r[1] + Y * cam.u[1] + Z * cam.f[1],
    X * cam.r[2] + Y * cam.u[2] + Z * cam.f[2],
  ];
}

export const onScreen = (cam: Camera, x: number, y: number, margin = 0) =>
  x > -margin && y > -margin && x < cam.w + margin && y < cam.h + margin;

/** Drag by (dx, dy) pixels on a canvas `w` pixels wide: the sky follows the pointer. */
export function pan(v: ViewState, dx: number, dy: number, w: number): ViewState {
  const perPx = (v.fovDeg * RAD) / w;
  return {
    alt: clamp(v.alt + dy * perPx, -89.5 * RAD, 89.5 * RAD),
    az: wrapTau(v.az - (dx * perPx) / Math.max(Math.cos(v.alt), 0.3)),
    fovDeg: v.fovDeg,
  };
}

/** Zoom by `factor` (< 1 zooms in) keeping the sky under pixel (x, y) where it is. */
export function zoomAt(v: ViewState, factor: number, x: number, y: number, cx: number, cy: number, w: number, h: number): ViewState {
  const fovDeg = clamp(v.fovDeg * factor, FOV_MIN, FOV_MAX);
  const want = altAzOf(unproject(camera(v.alt, v.az, kForFov(v.fovDeg, w), cx, cy, w, h), x, y));
  let next: ViewState = { alt: v.alt, az: v.az, fovDeg };
  for (let n = 0; n < 4; n++) {
    const got = altAzOf(unproject(camera(next.alt, next.az, kForFov(fovDeg, w), cx, cy, w, h), x, y));
    next = { alt: clamp(next.alt + want.alt - got.alt, -89.5 * RAD, 89.5 * RAD), az: wrapTau(next.az + wrapPi(want.az - got.az)), fovDeg };
  }
  return next;
}

/** Projects every J2000 direction in `dirs` through `rot` and the camera into `out` (x, y per item; NaN when hidden). */
export function projectAll(cam: Camera, rot: Mat3, dirs: Float32Array, out: Float32Array): Float32Array {
  const p = [0, 0];
  for (let i = 0, n = dirs.length / 3; i < n; i++) {
    const d = mulVec(rot, dirs, i * 3);
    if (project(cam, d, p) && onScreen(cam, p[0]!, p[1]!, 8)) {
      out[i * 2] = p[0]!;
      out[i * 2 + 1] = p[1]!;
    } else {
      out[i * 2] = out[i * 2 + 1] = Number.NaN;
    }
  }
  return out;
}

export type Hit = { kind: "body"; index: number } | { kind: "star"; index: number } | { kind: "segment"; index: number };

export interface PickInput {
  x: number;
  y: number;
  /** on-screen points that win over stars (planets, Moon, Sun, Qibla) */
  bodies: readonly { x: number; y: number }[];
  /** projected stars (projectAll) and their magnitudes */
  starXY: Float32Array;
  starMag: Float32Array;
  /** projected figure vertices (projectAll) and the vertex index pairs */
  vertXY: Float32Array;
  segments: Uint16Array;
  /** px: bodies within 1.6 × radius, stars within radius, segments within segRadius */
  radius: number;
  segRadius: number;
}

/** What is under (x, y): a body, else the best star (brighter wins ties), else the nearest figure segment. */
export function pick(p: PickInput): Hit | null {
  let best: Hit | null = null, bs = Infinity;
  p.bodies.forEach((b, index) => {
    const d = Math.hypot(b.x - p.x, b.y - p.y);
    if (d < p.radius * 1.6 && d < bs) { bs = d; best = { kind: "body", index }; }
  });
  if (best) return best;
  for (let i = 0; i < p.starMag.length; i++) {
    const sx = p.starXY[i * 2]!;
    if (Number.isNaN(sx)) continue;
    const d = Math.hypot(sx - p.x, p.starXY[i * 2 + 1]! - p.y);
    if (d > p.radius) continue;
    const score = d + p.starMag[i]! * (p.radius / 7);
    if (score < bs) { bs = score; best = { kind: "star", index: i }; }
  }
  if (best) return best;
  bs = p.segRadius;
  for (let i = 0; i < p.segments.length / 2; i++) {
    const a = p.segments[i * 2]!, b = p.segments[i * 2 + 1]!;
    const x1 = p.vertXY[a * 2]!, y1 = p.vertXY[a * 2 + 1]!, x2 = p.vertXY[b * 2]!, y2 = p.vertXY[b * 2 + 1]!;
    if (Number.isNaN(x1) || Number.isNaN(x2)) continue;
    const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy || 1;
    const t = clamp(((p.x - x1) * dx + (p.y - y1) * dy) / L, 0, 1);
    const d = Math.hypot(x1 + t * dx - p.x, y1 + t * dy - p.y);
    if (d < bs) { bs = d; best = { kind: "segment", index: i }; }
  }
  return best;
}
