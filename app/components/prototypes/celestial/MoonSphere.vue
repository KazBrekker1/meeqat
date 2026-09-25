<template>
  <div class="relative shrink-0" :style="{ width: size + 'px', height: size + 'px' }">
    <!-- Flat SVG moon while the map loads (or if canvas/decoding fails) -->
    <div v-if="!ready" class="absolute inset-0 grid place-items-center">
      <PrototypesCelestialMoonPhase
        :phase="phase"
        :size="fallbackSize"
        :halo="glow"
        :glow="glow"
        :craters="fallbackSize > 24"
        halo-color="#cdd6ff"
      />
    </div>
    <canvas
      ref="canvas"
      class="absolute inset-0 block transition-opacity duration-500"
      :class="ready ? 'opacity-100' : 'opacity-0'"
      :style="{ width: size + 'px', height: size + 'px' }"
      role="img"
      :aria-label="label"
    />
  </div>
</template>

<script lang="ts" setup>
import { moonView, renderMoon, moonGlow, type MoonView } from "@/utils/moon/sphere";
import { loadMoonMap } from "@/utils/moon/map";
import type { MoonMap } from "@/utils/moon/sphere";

const props = withDefaults(
  defineProps<{
    /** Phase for the SVG fallback (0 = new, 0.5 = full). */
    phase: number;
    /** Observer position; null → north-up, geocentric (no place chosen yet). */
    lat?: number | null;
    lng?: number | null;
    /** Canvas size in CSS px (the glow needs room around the disc). */
    size?: number;
    /** Disc diameter as a fraction of `size`. */
    disc?: number;
    /** Soft halo under the disc. */
    glow?: boolean;
  }>(),
  { lat: null, lng: null, size: 160, disc: 0.72, glow: true },
);

const { getNow, getOffset } = useMockTime();

const canvas = ref<HTMLCanvasElement | null>(null);
const ready = ref(false);
const view = shallowRef<MoonView | null>(null);
// The fallback SVG draws its disc at 92% of its box: match the canvas disc.
const fallbackSize = computed(() => Math.round((props.size * props.disc) / 0.92));
const label = computed(() =>
  view.value ? `Moon, ${Math.round(view.value.fraction * 100)}% illuminated` : "Moon",
);

let map: MoonMap | null = null;
let scratch: HTMLCanvasElement | null = null;
let disposed = false;

/** As seen from the chosen place (zenith up) while the Moon is up; north-up below the horizon or with no place. */
function currentView(now: Date): MoonView {
  const { lat, lng } = props;
  if (lat == null || lng == null) return moonView(now, 0, 0, { orientation: "north" });
  const sky = moonView(now, lat, lng);
  return sky.altitude > 0 ? sky : moonView(now, lat, lng, { orientation: "north" });
}

function draw(): void {
  const cv = canvas.value;
  if (!cv || !map || disposed) return;
  const t0 = performance.now();
  const v = currentView(getNow());
  const dpr = window.devicePixelRatio || 1;
  const W = Math.max(1, Math.round(props.size * dpr));
  const ctx = cv.getContext("2d");
  scratch ??= document.createElement("canvas");
  const sctx = scratch.getContext("2d");
  if (!ctx || !sctx) throw new Error("2d canvas unavailable");
  if (cv.width !== W) cv.width = cv.height = W;
  if (scratch.width !== W) scratch.width = scratch.height = W;

  const params = { subLon: v.libLon, subLat: v.libLat, poleAngle: v.poleAngle, phaseAngle: v.phaseAngle, limbAngle: v.limbAngle, disc: props.disc };
  const img = sctx.createImageData(W, W);
  renderMoon(img, map, params);
  sctx.putImageData(img, 0, 0);

  ctx.clearRect(0, 0, W, W);
  if (props.glow) {
    const gl = moonGlow(W, props.disc, v.phaseAngle, v.limbAngle);
    const g = ctx.createRadialGradient(gl.cx, gl.cy, gl.r0, gl.cx, gl.cy, gl.r1);
    for (const [o, c] of gl.stops) g.addColorStop(o, c);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, W);
  }
  ctx.drawImage(scratch, 0, 0);
  view.value = v;
  ready.value = true;
  if (import.meta.dev) console.debug(`[moon] render ${W}×${W}px ${(performance.now() - t0).toFixed(1)} ms`);
}

function safeDraw(): void {
  try {
    draw();
  } catch (err) {
    ready.value = false; // keep the SVG
    console.warn("[moon] render failed", err);
  }
}

// The Moon moves ≲0.5° in 10 minutes: redraw on a slow timer, and whenever the page
// becomes visible again (timers are throttled while hidden).
const REDRAW_MS = 10 * 60 * 1000;
let timer: ReturnType<typeof setInterval> | null = null;
let lastDpr = 0;
const onVisible = () => {
  if (!document.hidden) safeDraw();
};
const onResize = () => {
  if ((window.devicePixelRatio || 1) !== lastDpr) {
    lastDpr = window.devicePixelRatio || 1;
    safeDraw();
  }
};

onMounted(() => {
  lastDpr = window.devicePixelRatio || 1;
  // Load after the first paint so the SVG shows at once (the tray popover paints fast).
  requestAnimationFrame(() =>
    setTimeout(() => {
      loadMoonMap()
        .then((m) => {
          map = m;
          safeDraw();
        })
        .catch((err) => console.warn("[moon] map unavailable, keeping the flat moon", err));
    }, 0),
  );
  timer = setInterval(() => {
    if (!document.hidden) safeDraw();
  }, REDRAW_MS);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("resize", onResize);
});

onBeforeUnmount(() => {
  disposed = true;
  if (timer) clearInterval(timer);
  document.removeEventListener("visibilitychange", onVisible);
  window.removeEventListener("resize", onResize);
});

// Redraw for a new place, size, or a debug time jump.
watch(() => [props.lat, props.lng, props.size, props.disc, props.glow, getOffset()], safeDraw);
</script>
