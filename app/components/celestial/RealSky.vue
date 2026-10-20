<template>
  <!-- The real sky around the Moon: WebGL below, text and markers on a 2D canvas above. Behind the
       page it only draws when something changes; in explore mode it takes drags, zoom and taps. -->
  <div ref="root" class="absolute inset-0" :class="interactive ? 'touch-none' : 'pointer-events-none'">
    <canvas ref="glCanvas" class="absolute inset-0 block h-full w-full" aria-hidden="true" />
    <canvas
      ref="textCanvas"
      class="absolute inset-0 block h-full w-full"
      :class="interactive && 'cursor-grab'"
      aria-hidden="true"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
      @pointerleave="onLeave"
      @wheel.prevent="onWheel"
    />
    <!-- Opening and closing explore only: the explore frame cross-fading out, and the Moon flying -->
    <canvas ref="snapCanvas" class="pointer-events-none absolute inset-0 hidden h-full w-full" aria-hidden="true" />
    <canvas ref="flyer" class="pointer-events-none absolute hidden" aria-hidden="true" />
  </div>
</template>

<script lang="ts" setup>
import { skyAt, type SkyState } from "@/utils/sky/astro";
import { loadSkyCatalog, type SkyCatalog } from "@/utils/sky/catalog";
import { directionOf, figureOf, type SkyPick } from "@/utils/sky/describe";
import { drawOverlay, moonRadiusPx, type OverlayBody, type OverlayInput, type OverlayMoon } from "@/utils/sky/overlay";
import { createSkyRenderer, type SkyFrame, type SkyRenderer } from "@/utils/sky/renderer";
import { camera, fovForK, kForFov, onScreen, pan, pick, project, projectAll, zoomAt, type Camera } from "@/utils/sky/view";
import { RAD, altAzOf, clamp, mulVec } from "@/utils/sky/vec";
import { qiblaBearing } from "@/utils/qibla";
import { loadStyleMap } from "@/utils/moon/map";
import type { MoonMap } from "@/utils/moon/sphere";
import { renderStyle, STYLE_GLOW, type GreyChain, type MoonStyle } from "@/utils/moon/styles";
import { moonStyle } from "@/utils/moonStyle";
import type { SkyStatus } from "@/composables/useSkyExplore";

const props = defineProps<{ lat: number; lng: number; interactive?: boolean }>();
const emit = defineEmits<{ status: [status: SkyStatus] }>();

/** The orbit's Moon disc radius spans this much sky (the chosen mockup's scale). */
const MOON_RADIUS_SKY_DEG = 21;
const MAX_DPR = 2;

const root = ref<HTMLElement | null>(null);
const glCanvas = ref<HTMLCanvasElement | null>(null);
const textCanvas = ref<HTMLCanvasElement | null>(null);
const snapCanvas = ref<HTMLCanvasElement | null>(null);
const flyer = ref<HTMLCanvasElement | null>(null);

const { getNow, getOffset } = useMockTime();
const explore = useSkyExplore();
const anchor = useSkyAnchor();

let cat: SkyCatalog | null = null;
let renderer: SkyRenderer | null = null;
let textCtx: CanvasRenderingContext2D | null = null;
let status: SkyStatus = "loading";
let disposed = false;
let queued = 0;
let tick: ReturnType<typeof setTimeout> | undefined;
let ro: ResizeObserver | null = null;

// The last frame, for taps and hover
let lastCam: Camera | null = null;
let lastSky: SkyState | null = null;
let bodies: OverlayBody[] = [];
let starXY = new Float32Array(0);
let vertXY = new Float32Array(0);

function setStatus(s: SkyStatus) {
  status = s;
  explore.available.value = s === "ready";
  emit("status", s);
}

// One sky per minute and place (the time slider moves in whole minutes too).
let skyKey = "";
let sky: SkyState | null = null;
function skyFor(date: Date): SkyState {
  const minute = Math.floor(date.getTime() / 60_000);
  const key = `${minute}|${props.lat}|${props.lng}`;
  if (key !== skyKey || !sky) {
    sky = skyAt(new Date(minute * 60_000), props.lat, props.lng);
    skyKey = key;
  }
  return sky;
}

const dprNow = () => Math.min(MAX_DPR, window.devicePixelRatio || 1);
const cssWidth = () => root.value?.clientWidth || 1;

/** Canvas size in device px; the text canvas follows the box (the renderer sizes its own). */
function fit(): { w: number; h: number; dpr: number } {
  const dpr = dprNow();
  const w = Math.max(1, Math.round(root.value!.clientWidth * dpr));
  const h = Math.max(1, Math.round(root.value!.clientHeight * dpr));
  const t = textCanvas.value!;
  if (t.width !== w || t.height !== h) {
    t.width = w;
    t.height = h;
  }
  return { w, h, dpr };
}

/** The orbit's Moon on this canvas (device px) and its radius; the upper middle without an orbit. */
function anchorPoint(w: number, h: number, dpr: number) {
  const a = anchor.value;
  if (!a || !a.el.isConnected || !root.value) return { x: w / 2, y: h * 0.3, r: Math.min(w, h) * 0.12 };
  const r = a.el.getBoundingClientRect(), base = root.value.getBoundingClientRect();
  return { x: (r.left + r.width / 2 - base.left) * dpr, y: (r.top + r.height / 2 - base.top) * dpr, r: a.moonRadius * dpr };
}

// ── The Moon in the user's style, for explore ───────────────────────────────
let spriteCanvas: HTMLCanvasElement | null = null;
let spriteKey = "";
let spriteSize = 0;
let spriteMap: MoonMap | GreyChain | null = null;
let spriteStyle: MoonStyle | null = null;
let spriteLoading: MoonStyle | null = null;

/**
 * Re-rendered only when the minute or the style changes, or when it must grow; smaller sizes are
 * drawn scaled, so the open/close morph renders it once. The old style shows until the new map loads.
 */
function moonSprite(s: SkyState, R: number): HTMLCanvasElement | null {
  ensureSpriteMap();
  if (!spriteMap || !spriteStyle) return null;
  const size = Math.max(8, Math.ceil((2 * R) / 0.9));
  const key = `${skyKey}|${spriteStyle}`;
  if (key !== spriteKey || size > spriteSize) {
    spriteCanvas ??= document.createElement("canvas");
    spriteCanvas.width = spriteCanvas.height = size;
    const ctx = spriteCanvas.getContext("2d")!;
    const img = ctx.createImageData(size, size), v = s.moon;
    renderStyle(spriteStyle, img, spriteMap, { subLon: v.libLon, subLat: v.libLat, poleAngle: v.poleAngle, phaseAngle: v.phaseAngle, limbAngle: v.limbAngle, disc: 0.9 });
    ctx.putImageData(img, 0, 0);
    spriteKey = key;
    spriteSize = size;
  }
  return spriteCanvas;
}

/** Loads the map for the user's style (shared with MoonSphere), once per style. */
function ensureSpriteMap() {
  const want = moonStyle.value;
  if (spriteStyle === want || spriteLoading === want) return;
  spriteLoading = want;
  loadStyleMap(want)
    .then((m) => {
      if (disposed || moonStyle.value !== want) return;
      spriteMap = m;
      spriteStyle = want;
      spriteKey = "";
      requestFrame();
    })
    .catch((err) => console.warn("[sky] moon map unavailable", err))
    .finally(() => {
      if (spriteLoading === want) spriteLoading = null;
    });
}

// ── Drawing ─────────────────────────────────────────────────────────────────
function frame() {
  queued = 0;
  if (disposed || !renderer || renderer.lost || !cat || !root.value || !textCtx) return;
  const t0 = performance.now();
  const { w, h, dpr } = fit();
  const a = anchorPoint(w, h, dpr);
  const now = getNow();
  const s = skyFor(props.interactive ? (explore.time.value ?? now) : now);
  // Behind the page: the Moon's direction under the orbit's Moon, the sky scaled to its disc.
  const kHome = a.r / (2 * Math.tan((MOON_RADIUS_SKY_DEG * RAD) / 2));
  const moon = altAzOf(s.moon.dir);
  let cam: Camera;
  if (props.interactive) {
    const v = explore.view.value;
    cam = camera(v.alt, v.az, kForFov(v.fovDeg, w), a.x, a.y, w, h);
  } else {
    cam = camera(moon.alt, moon.az, kHome, a.x, a.y, w, h);
    Object.assign(explore.backdrop, { alt: moon.alt, az: moon.az, fovDeg: fovForK(kHome, w) });
  }
  // Explore draws the Moon itself, except while the flying copy is on its way.
  let moonDraw: OverlayMoon | null = null;
  if (props.interactive && !flying) {
    const R = moonRadiusPx(cam, dpr);
    moonDraw = {
      sprite: moonSprite(s, R),
      radius: R,
      alpha: s.moon.dir[2] < 0 ? 0.55 : 1,
      labelAlpha: 1,
      glowRgb: STYLE_GLOW[spriteStyle ?? moonStyle.value],
    };
  }
  const selected = figureOf(explore.selection.value, cat);
  const figure = props.interactive ? (selected >= 0 ? selected : explore.hoverFigure.value) : -1;
  const fov = fovForK(cam.k, w);
  const frameArgs: SkyFrame = {
    rot: s.rot,
    cam,
    figure,
    lineAlpha: props.interactive ? 0.32 : 0.14,
    lineWidth: (props.interactive ? 1 : 0.7) * dpr,
    starScale: dpr * (props.interactive ? clamp(Math.sqrt(100 / fov), 0.85, 2.2) : 0.9),
  };
  const overlayArgs: OverlayInput = {
    cam,
    sky: s,
    cat,
    dpr,
    explore: !!props.interactive,
    figure,
    qiblaAz: props.interactive ? qiblaBearing(props.lat, props.lng) * RAD : null,
    moon: moonDraw,
  };
  renderer.draw(frameArgs);
  bodies = drawOverlay(textCtx, overlayArgs);
  if (props.interactive) lastExplore = { frame: frameArgs, overlay: overlayArgs };
  lastCam = cam;
  lastSky = s;
  if (import.meta.dev) devRecord(performance.now() - t0, dpr);
}

function requestFrame() {
  if (!queued && !disposed) queued = requestAnimationFrame(frame);
}

// ── Opening and closing explore: moved by the compositor, nothing redrawn while it moves ─────────
/** The flight in progress (the Moon copy's animation). */
let flying: Animation | null = null;
/** The last explore frame, redrawn once on close to freeze it for the cross-fade. */
let lastExplore: { frame: SkyFrame; overlay: OverlayInput } | null = null;
const EASE = "cubic-bezier(0.3, 0.7, 0.2, 1)";

/** The orbit's Moon (MoonSphere's canvas), once its picture is drawn. */
function orbitMoonCanvas(): HTMLCanvasElement | null {
  const c = anchor.value?.el.querySelector("canvas");
  return c && c.width > 0 && c.classList.contains("opacity-100") ? c : null;
}

/** A copy of the orbit's Moon (its pixels, halo included) exactly over it; returns its centre and disc radius (CSS px). */
function placeFlyer(src: HTMLCanvasElement) {
  const f = flyer.value!, r = src.getBoundingClientRect(), base = root.value!.getBoundingClientRect();
  f.width = src.width;
  f.height = src.height;
  f.getContext("2d")!.drawImage(src, 0, 0);
  Object.assign(f.style, { left: `${r.left - base.left}px`, top: `${r.top - base.top}px`, width: `${r.width}px`, height: `${r.height}px`, display: "block" });
  return { x: r.left + r.width / 2 - base.left, y: r.top + r.height / 2 - base.top, r: anchor.value!.moonRadius };
}

function endFlight() {
  const f = flying;
  flying = null;
  f?.cancel();
  if (flyer.value) flyer.value.style.display = "none";
}

/** Opening: explore starts on the home sky, so the sky stays put; the Moon shrinks in place to its sky size. */
function flyOpen() {
  explore.leaving.value = false;
  const src = orbitMoonCanvas();
  if (!src || !lastCam || !root.value) return requestFrame();
  const from = placeFlyer(src), dpr = dprNow();
  const anim = flyer.value!.animate([{ transform: "none" }, { transform: `scale(${moonRadiusPx(lastCam, dpr) / dpr / from.r})` }], { duration: 450, easing: EASE, fill: "forwards" });
  flying = anim;
  // The labels come in once the page has faded, so no blurred panel has to follow them.
  textCanvas.value!.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, delay: 250, fill: "backwards" });
  requestFrame();
  anim.finished.then(() => {
    if (flying !== anim) return;
    endFlight();
    requestFrame();
  }, () => {});
}

/**
 * Closing: the explore frame is frozen on a canvas over the home sky (drawn now, underneath) and
 * fades out while the page is still hidden; the Moon flies back and grows into the orbit's Moon.
 */
function flyClose() {
  endFlight();
  const snap = snapCanvas.value!, gl = glCanvas.value!, text = textCanvas.value!, dpr = dprNow();
  let moonAt: { x: number; y: number; r: number } | null = null;
  const canFreeze = renderer && !renderer.lost && textCtx && lastExplore;
  if (canFreeze) {
    const { frame: f, overlay: o } = lastExplore!;
    renderer!.draw(f);
    drawOverlay(textCtx!, { ...o, moon: null });
    snap.width = gl.width;
    snap.height = gl.height;
    const sctx = snap.getContext("2d")!;
    sctx.drawImage(gl, 0, 0);
    sctx.drawImage(text, 0, 0);
    snap.style.display = "block";
    const p = [0, 0];
    if (o.moon && project(f.cam, o.sky.moon.dir, p) && onScreen(f.cam, p[0]!, p[1]!)) moonAt = { x: p[0]! / dpr, y: p[1]! / dpr, r: o.moon.radius / dpr };
  }
  lastExplore = null;
  frame(); // the home sky, under the frozen frame
  if (canFreeze) {
    snap.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, easing: "ease-out", fill: "forwards" }).finished.then(() => {
      snap.style.display = "none";
      snap.width = snap.height = 0;
      explore.leaving.value = false;
    }, () => {});
  } else explore.leaving.value = false;

  const src = orbitMoonCanvas();
  if (!src || !root.value) {
    explore.moonHidden.value = false;
    return;
  }
  const to = placeFlyer(src);
  const from = moonAt ? `translate(${moonAt.x - to.x}px, ${moonAt.y - to.y}px) scale(${moonAt.r / to.r})` : "scale(0.4)";
  const anim = flyer.value!.animate([{ transform: from, opacity: moonAt ? 1 : 0 }, { transform: "none", opacity: 1 }], { duration: 500, easing: EASE, fill: "forwards" });
  flying = anim;
  anim.finished.then(() => {
    if (flying !== anim) return;
    endFlight();
    explore.moonHidden.value = false;
  }, () => {});
}

/** Dev only: frame count and CPU ms for tests/e2e/sky.mjs, and where a named star is on screen. */
function devRecord(ms: number, dpr: number) {
  const w = window as unknown as { __sky?: { frames: number; ms: number[]; pointOf: (en: string) => { x: number; y: number } | null } };
  const d = (w.__sky ??= { frames: 0, ms: [], pointOf: () => null });
  d.frames++;
  d.ms.push(ms);
  if (d.ms.length > 240) d.ms.shift();
  d.pointOf = (en) => {
    const st = cat?.names.stars.find((x) => x.en === en), p = [0, 0];
    if (!st || !cat || !lastCam || !lastSky || !project(lastCam, mulVec(lastSky.rot, cat.starDirs, st.index * 3), p)) return null;
    return { x: p[0]! / dpr, y: p[1]! / dpr };
  };
}

/** At the top of every minute the sky turns 0.25°: one frame (none while hidden). */
function scheduleTick() {
  clearTimeout(tick);
  tick = setTimeout(() => {
    if (!document.hidden) requestFrame();
    scheduleTick();
  }, 60_000 - (getNow().getTime() % 60_000) + 20);
}

function onVisibility() {
  if (document.hidden) return;
  if (status === "catalog-failed") void start();
  else requestFrame();
}

function onScroll() {
  if (!props.interactive) requestFrame();
}

async function start() {
  const canvas = glCanvas.value;
  if (!canvas || disposed) return;
  setStatus("loading");
  try {
    cat = await loadSkyCatalog();
  } catch (err) {
    console.warn("[sky] catalogue unavailable", err);
    if (!disposed) setStatus("catalog-failed");
    return;
  }
  if (disposed) return;
  renderer ??= createSkyRenderer(canvas, cat, (lost) => {
    if (lost) {
      setStatus("lost");
      if (props.interactive) explore.closeRequests.value++;
    } else {
      setStatus("ready");
      requestFrame();
    }
  });
  if (!renderer) return setStatus("no-webgl");
  textCtx = textCanvas.value!.getContext("2d");
  setStatus("ready");
  ensureSpriteMap();
  requestFrame();
}

onMounted(() => {
  ro = new ResizeObserver(() => requestFrame());
  ro.observe(root.value!);
  if (anchor.value) ro.observe(anchor.value.el);
  window.addEventListener("scroll", onScroll, { capture: true, passive: true });
  document.addEventListener("visibilitychange", onVisibility);
  scheduleTick();
  // After the first paint, like the Moon map: the page shows at once.
  requestAnimationFrame(() => setTimeout(() => void start(), 0));
});

onBeforeUnmount(() => {
  disposed = true;
  cancelAnimationFrame(queued);
  cancelAnimationFrame(inertiaFrame);
  clearTimeout(tick);
  ro?.disconnect();
  window.removeEventListener("scroll", onScroll, { capture: true });
  document.removeEventListener("visibilitychange", onVisibility);
  endFlight();
  renderer?.dispose();
  renderer = null;
  explore.available.value = false;
  explore.moonHidden.value = false;
  explore.leaving.value = false;
});

watch(
  () => anchor.value?.el,
  (el, old) => {
    if (old) ro?.unobserve(old);
    if (el) ro?.observe(el);
    requestFrame();
  },
);
watch(
  [() => props.lat, () => props.lng, () => props.interactive, () => getOffset(), explore.view, explore.time, explore.selection, explore.hoverFigure, moonStyle],
  () => requestFrame(),
);
watch(
  () => props.interactive,
  (on) => {
    pointers.clear();
    gesture = null;
    cancelAnimationFrame(inertiaFrame);
    if (textCanvas.value) textCanvas.value.style.cursor = "";
    if (!renderer || !cat) {
      explore.moonHidden.value = false;
      explore.leaving.value = false;
      return;
    }
    if (on) flyOpen();
    else flyClose();
  },
);

// ── Explore input: drag (with a glide after a flick), pinch and wheel zoom, tap, hover ─────────
const pointers = new Map<number, { x: number; y: number }>();
let gesture: { x0: number; y0: number; moved: boolean; t: number; vx: number; vy: number } | null = null;
let pinch = 0;
let inertiaFrame = 0;

function spread() {
  const [a, b] = [...pointers.values()];
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
}

function onDown(e: PointerEvent) {
  if (!props.interactive) return;
  textCanvas.value!.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (flying) {
    endFlight();
    requestFrame();
  }
  explore.stopGlide();
  cancelAnimationFrame(inertiaFrame);
  if (pointers.size === 1) gesture = { x0: e.clientX, y0: e.clientY, moved: false, t: e.timeStamp, vx: 0, vy: 0 };
  else {
    pinch = spread();
    if (gesture) gesture.moved = true;
  }
}

function onMove(e: PointerEvent) {
  if (!props.interactive) return;
  const prev = pointers.get(e.pointerId);
  if (!prev) {
    if (e.pointerType === "mouse") hover(e);
    return;
  }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size >= 2) {
    const d = spread(), [a, b] = [...pointers.values()];
    if (pinch > 0 && d > 0 && a && b) zoomBy(pinch / d, (a.x + b.x) / 2, (a.y + b.y) / 2);
    pinch = d;
    return;
  }
  if (!gesture) return;
  const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
  if (!gesture.moved && Math.hypot(e.clientX - gesture.x0, e.clientY - gesture.y0) > 6) gesture.moved = true;
  const dt = Math.max(1, e.timeStamp - gesture.t);
  gesture.vx = 0.8 * (dx / dt) + 0.2 * gesture.vx;
  gesture.vy = 0.8 * (dy / dt) + 0.2 * gesture.vy;
  gesture.t = e.timeStamp;
  explore.view.value = pan(explore.view.value, dx, dy, cssWidth());
}

function onUp(e: PointerEvent) {
  if (!pointers.delete(e.pointerId)) return;
  if (pointers.size > 0) {
    pinch = spread();
    return;
  }
  const g = gesture;
  gesture = null;
  pinch = 0;
  if (!g || !props.interactive) return;
  if (!g.moved) tap(e);
  else if (e.timeStamp - g.t < 80) glideOn(g.vx, g.vy);
}

function onLeave(e: PointerEvent) {
  if (e.pointerType === "mouse" && !pointers.size) explore.hoverFigure.value = -1;
}

/** Keeps drifting after a flick, slowing to a stop in about 0.6 s. */
function glideOn(vx: number, vy: number) {
  if (Math.hypot(vx, vy) < 0.05) return;
  let last = performance.now();
  const step = (now: number) => {
    const dt = now - last, k = Math.exp(-dt / 200);
    last = now;
    vx *= k;
    vy *= k;
    explore.view.value = pan(explore.view.value, vx * dt, vy * dt, cssWidth());
    inertiaFrame = Math.hypot(vx, vy) > 0.02 ? requestAnimationFrame(step) : 0;
  };
  inertiaFrame = requestAnimationFrame(step);
}

function onWheel(e: WheelEvent) {
  if (props.interactive) zoomBy(Math.exp(e.deltaY * 0.0012), e.clientX, e.clientY);
}

/** Zoom around a point given in client coordinates. */
function zoomBy(factor: number, clientX: number, clientY: number) {
  if (!lastCam || !root.value) return;
  explore.stopGlide();
  const base = root.value.getBoundingClientRect(), dpr = dprNow();
  explore.view.value = zoomAt(explore.view.value, factor, (clientX - base.left) * dpr, (clientY - base.top) * dpr, lastCam.cx, lastCam.cy, lastCam.w, lastCam.h);
}

function hitAt(clientX: number, clientY: number): SkyPick | null {
  if (!lastCam || !lastSky || !cat || !root.value) return null;
  const base = root.value.getBoundingClientRect(), dpr = dprNow();
  if (starXY.length !== cat.starMag.length * 2) starXY = new Float32Array(cat.starMag.length * 2);
  if (vertXY.length !== (cat.lineDirs.length / 3) * 2) vertXY = new Float32Array((cat.lineDirs.length / 3) * 2);
  projectAll(lastCam, lastSky.rot, cat.starDirs, starXY);
  projectAll(lastCam, lastSky.rot, cat.lineDirs, vertXY);
  const hit = pick({
    x: (clientX - base.left) * dpr,
    y: (clientY - base.top) * dpr,
    bodies,
    starXY,
    starMag: cat.starMag,
    vertXY,
    segments: cat.segments,
    radius: 11 * dpr,
    segRadius: 7 * dpr,
  });
  if (!hit) return null;
  if (hit.kind === "star") return { kind: "star", index: hit.index };
  if (hit.kind === "segment") return { kind: "figure", figure: cat.segFigure[hit.index]! };
  const b = bodies[hit.index]!;
  return b.kind === "planet" ? { kind: "planet", key: b.key } : { kind: b.kind };
}

function tap(e: PointerEvent) {
  const p = hitAt(e.clientX, e.clientY);
  explore.selection.value = p;
  if (p?.kind === "qibla" && lastSky && cat) {
    const { alt, az } = altAzOf(directionOf(p, lastSky, cat, props.lat, props.lng));
    explore.glide({ alt, az });
  }
}

let hoverQueued = false;
function hover(e: PointerEvent) {
  if (hoverQueued) return;
  hoverQueued = true;
  const { clientX, clientY } = e;
  requestAnimationFrame(() => {
    hoverQueued = false;
    if (!cat || !props.interactive) return;
    const p = hitAt(clientX, clientY), fig = figureOf(p, cat);
    if (fig !== explore.hoverFigure.value) explore.hoverFigure.value = fig;
    if (textCanvas.value) textCanvas.value.style.cursor = p ? "pointer" : "";
  });
}
</script>
