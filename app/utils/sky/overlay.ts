// Text and markers drawn over the WebGL sky on a 2D canvas: the horizon with compass letters and the
// planets everywhere; in explore mode also the labels, the Sun, the Moon and the Qibla marker (or an
// arrow at the screen edge pointing to it). Returns what can be tapped, with screen positions.
import { moonGlow, type MoonView } from "../moon/sphere";
import type { SkyState } from "./astro";
import type { SkyCatalog } from "./catalog";
import type { PlanetKey } from "./planets";
import { fovForK, onScreen, project, type Camera } from "./view";
import { RAD, mulVec, vecFromAltAz, wrapPi } from "./vec";

export type OverlayBody =
  | { kind: "planet"; key: PlanetKey; x: number; y: number }
  | { kind: "moon" | "sun" | "qibla"; x: number; y: number };

/** The Moon as explore draws it (with the orbit Moon's halo proportions, so the two match). */
export interface OverlayMoon {
  /** the Moon in the user's style (disc = 0.9 of the image); null → a flat disc */
  sprite: CanvasImageSource | null;
  /** disc radius, px */
  radius: number;
  alpha: number;
  labelAlpha: number;
  /** halo colour of the style (styles.ts STYLE_GLOW) */
  glowRgb: [number, number, number];
}

export interface OverlayInput {
  cam: Camera;
  sky: SkyState;
  cat: SkyCatalog;
  /** device pixels per CSS pixel */
  dpr: number;
  explore: boolean;
  /** constellation whose name is drawn in amber, −1 for none */
  figure: number;
  /** Qibla bearing, radians; explore only */
  qiblaAz: number | null;
  /** explore only; null → not drawn */
  moon: OverlayMoon | null;
}

const FONT = "ui-sans-serif, system-ui, -apple-system, sans-serif";
const COMPASS = [["N", 0], ["NE", 45], ["E", 90], ["SE", 135], ["S", 180], ["SW", 225], ["W", 270], ["NW", 315]] as const;
/** Explore's search bar and time slider cover the screen edges (CSS px). */
const EDGE = { top: 76, bottom: 124, side: 30 };

/** The Moon's radius in explore, px: its real 0.26°, but never under 7 CSS px. */
export const moonRadiusPx = (cam: Camera, dpr: number) => Math.max(7 * dpr, cam.k * 0.0091);

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** A phase disc with the lit side toward the bright limb (fallback while the Moon map loads). */
export function drawFlatMoon(ctx: CanvasRenderingContext2D, x: number, y: number, R: number, v: Pick<MoonView, "fraction" | "limbAngle">) {
  ctx.save();
  ctx.translate(x, y);
  disc(ctx, 0, 0, R, "#1a2040");
  ctx.rotate(-v.limbAngle - Math.PI / 2);
  const c = 2 * v.fraction - 1, a = Math.abs(c) * R;
  ctx.beginPath();
  ctx.arc(0, 0, R, -Math.PI / 2, Math.PI / 2, false);
  if (c >= 0) ctx.ellipse(0, 0, a, R, 0, Math.PI / 2, 1.5 * Math.PI, false);
  else ctx.ellipse(0, 0, a, R, 0, Math.PI / 2, -Math.PI / 2, true);
  ctx.closePath();
  ctx.fillStyle = "#efeadc";
  ctx.fill();
  ctx.restore();
}

function kaaba(ctx: CanvasRenderingContext2D, x: number, y: number, dpr: number) {
  const s = 9 * dpr;
  ctx.fillStyle = "#16161c";
  ctx.fillRect(x - s / 2, y - s, s, s);
  ctx.fillStyle = "#fcd34d";
  ctx.fillRect(x - s / 2, y - s * 0.78, s, s * 0.14);
  ctx.lineWidth = dpr;
  ctx.strokeStyle = "rgba(255,255,255,.6)";
  ctx.strokeRect(x - s / 2, y - s, s, s);
}

/** The orbit's Moon sits on a canvas 1 / 0.644 of its diameter: drawing the halo on that box matches it. */
const ORBIT_DISC = (0.42 * 0.92) / 0.6;

function drawMoon(ctx: CanvasRenderingContext2D, x: number, y: number, m: OverlayMoon, v: Pick<MoonView, "fraction" | "limbAngle" | "phaseAngle">) {
  const R = m.radius, W = (2 * R) / ORBIT_DISC, g = moonGlow(W, ORBIT_DISC, v.phaseAngle, v.limbAngle, m.glowRgb);
  const gx = x - W / 2 + g.cx, gy = y - W / 2 + g.cy, halo = ctx.createRadialGradient(gx, gy, g.r0, gx, gy, g.r1);
  for (const [o, c] of g.stops) halo.addColorStop(o, c);
  ctx.globalAlpha = m.alpha;
  ctx.fillStyle = halo;
  ctx.fillRect(x - W / 2, y - W / 2, W, W);
  if (m.sprite) {
    const S = (2 * R) / 0.9;
    ctx.drawImage(m.sprite, x - S / 2, y - S / 2, S, S);
  } else drawFlatMoon(ctx, x, y, R, v);
  ctx.globalAlpha = 1;
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

export function drawOverlay(ctx: CanvasRenderingContext2D, o: OverlayInput): OverlayBody[] {
  const { cam, sky, cat, dpr, explore } = o;
  const bodies: OverlayBody[] = [];
  const p = [0, 0];
  const at = (d: ArrayLike<number>, margin: number) => project(cam, d, p) && onScreen(cam, p[0]!, p[1]!, margin * dpr);
  ctx.clearRect(0, 0, cam.w, cam.h);
  ctx.textBaseline = "middle";

  // Horizon and compass letters
  const horizon = new Path2D();
  let have = false, hx = 0, hy = 0;
  for (let az = 0; az <= 360; az++) {
    const ok = project(cam, vecFromAltAz(0, az * RAD), p);
    if (ok && have && Math.hypot(p[0]! - hx, p[1]! - hy) < cam.w * 0.5) horizon.lineTo(p[0]!, p[1]!);
    else if (ok) horizon.moveTo(p[0]!, p[1]!);
    have = ok;
    hx = p[0]!;
    hy = p[1]!;
  }
  const hc = explore ? "rgba(170,180,255,.4)" : "rgba(170,180,255,.32)";
  ctx.lineWidth = (explore ? 1 : 0.8) * dpr;
  ctx.strokeStyle = hc;
  ctx.stroke(horizon);
  ctx.font = `600 ${(explore ? 11 : 10) * dpr}px ${FONT}`;
  ctx.textAlign = "center";
  for (const [t, az] of COMPASS) if (at(vecFromAltAz(-1.2 * RAD, az * RAD), -10)) label(ctx, t, p[0]!, p[1]! + 6 * dpr, hc);

  // Planets (named and tappable in explore)
  ctx.font = `${12 * dpr}px ${FONT}`;
  ctx.textAlign = "left";
  for (const pl of sky.planets) {
    if (!at(pl.dir, 10)) continue;
    const a = pl.dir[2] < 0 ? 0.36 : 1, r = Math.max(1.4, 2.5 - 0.3 * pl.mag) * 0.9 * dpr;
    disc(ctx, p[0]!, p[1]!, r * 3, `rgba(255,238,205,${(0.22 * a).toFixed(3)})`);
    disc(ctx, p[0]!, p[1]!, r, `rgba(255,240,212,${a})`);
    if (explore) {
      label(ctx, pl.en, p[0]! + r + 4 * dpr, p[1]!, `rgba(255,226,170,${(0.9 * a).toFixed(3)})`);
      bodies.push({ kind: "planet", key: pl.key, x: p[0]!, y: p[1]! });
    }
  }
  if (!explore) return bodies;

  // Star and constellation names, fewer as the view widens
  const fov = fovForK(cam.k, cam.w);
  const magCut = fov > 120 ? 1.0 : fov > 70 ? 1.6 : 2.4;
  ctx.font = `${11 * dpr}px ${FONT}`;
  for (const s of cat.names.stars) {
    if (cat.starMag[s.index]! > magCut) continue;
    const d = mulVec(sky.rot, cat.starDirs, s.index * 3);
    if (at(d, -8)) label(ctx, s.en, p[0]! + 6 * dpr, p[1]!, d[2] < 0 ? "rgba(255,255,255,.3)" : "rgba(255,255,255,.72)");
  }
  const rankCut = fov > 110 ? 1 : fov > 60 ? 2 : 3;
  ctx.font = `600 ${10 * dpr}px ${FONT}`;
  ctx.textAlign = "center";
  cat.names.constellations.forEach((c, i) => {
    if (c.rank > rankCut && i !== o.figure) return;
    const d = mulVec(sky.rot, c.label);
    if (at(d, -20)) label(ctx, c.en.toUpperCase(), p[0]!, p[1]!, i === o.figure ? "rgba(252,211,77,.95)" : d[2] < 0 ? "rgba(165,180,255,.28)" : "rgba(165,180,255,.55)");
  });

  // Sun and Moon
  ctx.font = `${12 * dpr}px ${FONT}`;
  ctx.textAlign = "left";
  if (at(sky.sun.dir, 20)) {
    const R = Math.max(5 * dpr, cam.k * 0.0093);
    disc(ctx, p[0]!, p[1]!, R, sky.sun.altDeg < 0 ? "rgba(255,214,120,.35)" : "rgba(255,236,170,.95)");
    label(ctx, "Sun", p[0]! + R + 5 * dpr, p[1]!, "rgba(255,226,170,.85)");
    bodies.push({ kind: "sun", x: p[0]!, y: p[1]! });
  }
  if (o.moon && at(sky.moon.dir, o.moon.radius / dpr + 30)) {
    const x = p[0]!, y = p[1]!;
    drawMoon(ctx, x, y, o.moon, sky.moon);
    if (o.moon.labelAlpha > 0.01) label(ctx, "Moon", x + o.moon.radius + 6 * dpr, y, `rgba(255,255,255,${(0.85 * o.moon.labelAlpha).toFixed(3)})`);
    bodies.push({ kind: "moon", x, y });
  }

  // Qibla: a marker on the horizon, or an arrow at the edge pointing to it
  if (o.qiblaAz != null) {
    const d = vecFromAltAz(0, o.qiblaAz);
    const inner = { l: EDGE.side * dpr, r: cam.w - EDGE.side * dpr, t: EDGE.top * dpr, b: cam.h - EDGE.bottom * dpr };
    const projected = project(cam, d, p);
    if (projected && p[0]! > inner.l && p[0]! < inner.r && p[1]! > inner.t && p[1]! < inner.b) {
      kaaba(ctx, p[0]!, p[1]!, dpr);
      ctx.textAlign = "center";
      label(ctx, "Qibla", p[0]!, p[1]! - 17 * dpr, "rgba(252,211,77,.95)");
      bodies.push({ kind: "qibla", x: p[0]!, y: p[1]! - 5 * dpr });
    } else {
      const cx = (inner.l + inner.r) / 2, cy = (inner.t + inner.b) / 2;
      let tx: number, ty: number;
      if (projected) {
        tx = p[0]! - cx;
        ty = p[1]! - cy;
      } else {
        tx = Math.sign(wrapPi(o.qiblaAz - Math.atan2(cam.f[0], cam.f[1]))) || 1;
        ty = 0;
      }
      const s = Math.min((inner.r - cx) / Math.max(Math.abs(tx), 1e-6), (inner.b - cy) / Math.max(Math.abs(ty), 1e-6));
      const x = cx + tx * s, y = cy + ty * s, ang = Math.atan2(ty, tx), L = 9 * dpr;
      ctx.fillStyle = "rgba(252,211,77,.95)";
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(ang) * L, y + Math.sin(ang) * L);
      ctx.lineTo(x + Math.cos(ang + 2.4) * L, y + Math.sin(ang + 2.4) * L);
      ctx.lineTo(x + Math.cos(ang - 2.4) * L, y + Math.sin(ang - 2.4) * L);
      ctx.closePath();
      ctx.fill();
      ctx.textAlign = "center";
      label(ctx, "Qibla", x - Math.cos(ang) * 22 * dpr, y - Math.sin(ang) * 14 * dpr, "rgba(252,211,77,.95)");
      bodies.push({ kind: "qibla", x, y });
    }
  }
  return bodies;
}
