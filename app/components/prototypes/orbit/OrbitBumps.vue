<template>
  <div ref="root" class="relative" :style="{ width: size + 'px', height: size + 'px' }">
    <!-- flat sky-coloured ring; each prayer's outer edge swells (spring) on hover -->
    <div class="absolute inset-0" :style="{ background: conic, clipPath: clip, '-webkit-clip-path': clip }" />

    <svg :viewBox="`0 0 ${size} ${size}`" class="absolute inset-0 w-full h-full overflow-visible">
      <path :d="outerPath" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="1" stroke-linejoin="round" />
      <circle :cx="C" :cy="C" :r="Ri" fill="none" stroke="rgba(0,0,0,0.3)" stroke-width="1" />

      <circle
        v-for="p in points"
        :key="p.key"
        :cx="p.x" :cy="p.y" :r="p.key === hovered ? 4 : p.isNext ? 3.4 : 2.2"
        :fill="p.isNext ? '#fcd34d' : p.key === hovered ? '#ffffff' : 'rgba(255,255,255,0.85)'"
        stroke="rgba(6,9,22,0.6)" stroke-width="1"
        class="transition-[r] duration-100"
      />

      <line :x1="now.x" :y1="now.y" :x2="C" :y2="C" stroke="rgba(255,247,224,0.3)" stroke-width="1" />
      <circle :cx="now.x" :cy="now.y" r="7" fill="none" stroke="rgba(6,9,22,0.55)" stroke-width="3" />
      <circle :cx="now.x" :cy="now.y" r="6.5" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="1.3" />
      <circle :cx="now.x" :cy="now.y" r="4.4" fill="#05070f" />
      <circle :cx="now.x" :cy="now.y" r="3" fill="#fff7e0" />
    </svg>

    <!-- centre (overridable) -->
    <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
      <slot>
        <PrototypesCelestialMoonPhase :phase="moonPhase" :size="Math.round(size * 0.42)" halo halo-color="#cdd6ff" />
      </slot>
    </div>

    <button
      v-for="(p, i) in prayers"
      :key="p.key"
      class="absolute rounded-full bg-transparent border-0 p-0 cursor-pointer appearance-none focus:outline-none"
      :style="{ left: hotspot(i).x - hot / 2 + 'px', top: hotspot(i).y - hot / 2 + 'px', width: hot + 'px', height: hot + 'px' }"
      @mouseenter="enter(i)"
      @mousemove="onMove"
      @mouseleave="leave(i)"
      @focusin="enter(i)"
      @focusout="leave(i)"
      :aria-label="labelFor(p.key)"
    />

    <Transition
      enter-active-class="transition duration-100 ease-out"
      enter-from-class="opacity-0 scale-90"
      leave-active-class="transition duration-75 ease-in"
      leave-to-class="opacity-0 scale-90"
    >
      <div
        v-if="hovered"
        class="absolute pointer-events-none whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium bg-[#0b1230]/90 border border-white/15 backdrop-blur-sm shadow-lg"
        :style="{ left: cursor.x + 'px', top: cursor.y + 'px', transform: 'translate(12px, calc(-100% - 10px))' }"
      >
        <span :class="hoveredPrayer?.isNext ? 'text-amber-200' : 'text-white'">{{ labelFor(hovered) }}</span>
        <span class="text-white/55 tabular-nums ml-1.5">{{ hoveredPrayer?.time }}</span>
      </div>
    </Transition>
  </div>
</template>

<script lang="ts" setup>
import { ref, reactive, computed, onBeforeUnmount } from "vue";
import { contourPath, ptAt, frac, type BumpPrayer } from "./bump";

const props = withDefaults(
  defineProps<{
    prayers: BumpPrayer[];
    time: string;
    moonPhase: number;
    size?: number;
    baseAmp?: number;
    hoverAmp?: number;
    sigma?: number;
  }>(),
  { size: 320, baseAmp: 0.022, hoverAmp: 0.07, sigma: 0.022 }
);

const LABELS: Record<string, string> = {
  fajr: "Fajr", sunrise: "Sunrise", dhuhr: "Dhuhr", asr: "ʿAṣr", maghrib: "Maghrib", isha: "ʿIshāʾ",
};
const labelFor = (k: string) => LABELS[k] ?? k;

const C = props.size / 2;
const Ri = props.size * 0.3;
const Ro = props.size * 0.355;
const hot = props.size * 0.16;
const baseA = props.size * props.baseAmp;
const hoverA = props.size * props.hoverAmp;

const fracs = props.prayers.map((p) => frac(p.time));

const root = ref<HTMLElement>();
const hovered = ref<string | null>(null);
const hoveredPrayer = computed(() => props.prayers.find((p) => p.key === hovered.value) ?? null);

const cursor = reactive({ x: C, y: C });
function onMove(e: MouseEvent) {
  const r = root.value?.getBoundingClientRect();
  if (!r) return;
  cursor.x = e.clientX - r.left;
  cursor.y = e.clientY - r.top;
}

const amps = reactive(props.prayers.map(() => baseA));
const vel = props.prayers.map(() => 0);
const targets = props.prayers.map(() => baseA);
const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

let raf = 0;
function loop() {
  let moving = false;
  for (let i = 0; i < amps.length; i++) {
    const f = (targets[i]! - amps[i]!) * 0.36; // snappy spring
    vel[i] = (vel[i]! + f) * 0.58;
    amps[i]! += vel[i]!;
    if (Math.abs(vel[i]!) > 0.02 || Math.abs(targets[i]! - amps[i]!) > 0.05) moving = true;
    else { amps[i] = targets[i]!; vel[i] = 0; }
  }
  if (moving) raf = requestAnimationFrame(loop);
  else raf = 0;
}
function kick() {
  if (reduce) { for (let i = 0; i < amps.length; i++) amps[i] = targets[i]!; return; }
  if (!raf) raf = requestAnimationFrame(loop);
}
function enter(i: number) {
  targets[i] = hoverA;
  hovered.value = props.prayers[i]!.key;
  const a = hotspot(i);
  cursor.x = a.x;
  cursor.y = a.y;
  kick();
}
function leave(i: number) {
  targets[i] = baseA;
  if (hovered.value === props.prayers[i]!.key) hovered.value = null;
  kick();
}
onBeforeUnmount(() => cancelAnimationFrame(raf));

const sig2 = 2 * props.sigma * props.sigma;
function lobe(t: number, i: number) {
  let d = Math.abs(t - fracs[i]!);
  d = Math.min(d, 1 - d);
  return Math.exp(-(d * d) / sig2);
}
function outerR(t: number) {
  let r = Ro;
  for (let i = 0; i < fracs.length; i++) r += amps[i]! * lobe(t, i);
  return r;
}

// 120 samples render the subtle bumps smoothly while keeping the clip-path light
// enough for the mobile GPU to rasterize quickly (matters most during hover, when
// the contour recomputes each animation frame).
const outerPath = computed(() => contourPath(120, C, C, outerR));
// The inner hole is a constant-radius circle — express it as two arcs instead of
// sampling a 120-point contour every render.
const innerPath = `M ${(C - Ri).toFixed(2)},${C.toFixed(2)} a ${Ri.toFixed(2)},${Ri.toFixed(2)} 0 1,0 ${(2 * Ri).toFixed(2)},0 a ${Ri.toFixed(2)},${Ri.toFixed(2)} 0 1,0 ${(-2 * Ri).toFixed(2)},0 Z`;
const clip = computed(() => `path(evenodd, '${outerPath.value} ${innerPath}')`);

const points = computed(() =>
  props.prayers.map((p, i) => {
    const t = fracs[i]!;
    return { ...p, ...ptAt(t, outerR(t) - props.size * 0.016, C, C) };
  })
);
const hotspot = (i: number) => ptAt(fracs[i]!, Ro + baseA, C, C);

const nowFrac = frac(props.time);
const now = computed(() => ptAt(nowFrac, (Ri + outerR(nowFrac)) / 2, C, C));

const minByKey = (k: string) => {
  const p = props.prayers.find((x) => x.key === k);
  return p ? frac(p.time) * 1440 : null;
};
const deg = (m: number) => (m / 1440) * 360;
const conic = computed(() => {
  const sr = minByKey("sunrise") ?? 360;
  const ss = minByKey("maghrib") ?? 1080;
  const fj = minByKey("fajr") ?? sr - 90;
  const ish = minByKey("isha") ?? ss + 90;
  const noon = minByKey("dhuhr") ?? (sr + ss) / 2;
  const stops: [number, string][] = [
    [0, "#0c1336"], [deg(fj) - 6, "#16224d"], [deg(fj), "#3a2e6b"],
    [(deg(fj) + deg(sr)) / 2, "#bd5a6e"], [deg(sr) - 3, "#ff9d5c"], [deg(sr), "#ffd0a0"],
    [deg(sr) + 8, "#9bd4ff"], [deg(noon), "#bfe0ff"], [deg(ss) - 8, "#9bd4ff"],
    [deg(ss) - 3, "#ffd0a0"], [deg(ss), "#ff9d5c"], [(deg(ss) + deg(ish)) / 2, "#bd5a6e"],
    [deg(ish), "#3a2e6b"], [deg(ish) + 6, "#16224d"], [360, "#0c1336"],
  ];
  let prev = -1;
  const parts = stops.map(([d, c]) => {
    let dd = Math.max(0, Math.min(360, d));
    if (dd <= prev) dd = prev + 0.4;
    prev = dd;
    return `${c} ${dd.toFixed(1)}deg`;
  });
  return `conic-gradient(from 0deg, ${parts.join(",")})`;
});
</script>
