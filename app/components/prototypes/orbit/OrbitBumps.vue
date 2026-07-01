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

      <!-- COMET · SONAR cue. Tail (gold, trailing behind the head toward the
           previous prayer) = time since. Sonar pings on the next prayer dot =
           time until (faster + cool→coral as it nears). Head = now, riding the
           same wavy dot-path so it lands on the next prayer when the time comes. -->
      <g v-if="cue">
        <path v-for="(q, i) in tail" :key="'tl' + i" :d="q.d" fill="#fcd34d" :opacity="q.o" />
        <circle
          v-for="(r, i) in sonarRings" :key="'sn' + i"
          class="orbit-ping"
          :cx="prayerPt.x" :cy="prayerPt.y" :r="sonarMaxR"
          fill="none" :stroke="beaconColor" stroke-width="1.6"
          :style="{ animationDuration: sonarPeriod + 's', animationDelay: r.delay + 's', '--peak': sonarPeak }"
        />
        <circle :cx="prayerPt.x" :cy="prayerPt.y" :r="4 + urgency * 3" :fill="beaconColor" />
        <circle class="orbit-head-glow" :cx="headPt.x" :cy="headPt.y" :r="headR * 1.4" fill="#fff7d6" />
        <circle :cx="headPt.x" :cy="headPt.y" :r="headR" fill="#fcd34d" stroke="rgba(8,6,2,0.6)" stroke-width="2" />
        <circle :cx="headPt.x" :cy="headPt.y" :r="headR * 0.5" fill="#fff" />
      </g>

      <!-- since / until labels, curved along a slice of the orbit between the
           previous and next prayer. Text auto-flips to stay upright anywhere on
           the dial; a soft band behind it keeps it legible over the ring. The two
           states crossfade so the collapse into a merged label reads as a clean
           morph rather than a hard swap. -->
      <template v-if="cue && showLabels">
        <!-- two separate labels, each riding its own prayer dot -->
        <Transition name="orbit-label">
          <g v-if="!merged" key="sep">
            <path :id="`${uid}-since`" :d="sinceArcD" fill="none" stroke="none" />
            <path :id="`${uid}-until`" :d="untilArcD" fill="none" stroke="none" />
            <path :d="sinceArcD" fill="none" stroke="rgba(4,6,15,0.72)" :stroke-width="labelFont + 7" stroke-linecap="round" />
            <path :d="untilArcD" fill="none" stroke="rgba(4,6,15,0.72)" :stroke-width="labelFont + 7" stroke-linecap="round" />
            <text :font-size="labelFont" fill="rgba(255,255,255,0.6)" style="font-variant-numeric: tabular-nums; letter-spacing: 0.02em;">
              <textPath :href="`#${uid}-since`" startOffset="50%" text-anchor="middle">{{ sinceLabelText }}</textPath>
            </text>
            <text :font-size="labelFont" fill="rgba(255,255,255,0.98)" style="font-variant-numeric: tabular-nums; letter-spacing: 0.02em;">
              <textPath :href="`#${uid}-until`" startOffset="50%" text-anchor="middle">{{ untilLabelText }}</textPath>
            </text>
          </g>
        </Transition>
        <!-- merged. Large orbs: two stacked lines — "in" (bright) above "ago"
             (muted). Small orbs (tray): one line, to stay clear of the edge. -->
        <Transition name="orbit-label">
          <g v-if="merged" key="mg">
            <template v-if="twoLineMerged">
              <path :id="`${uid}-mu`" :d="mergedUntilArcD" fill="none" stroke="none" />
              <path :id="`${uid}-ms`" :d="mergedSinceArcD" fill="none" stroke="none" />
              <path :d="mergedSinceArcD" fill="none" stroke="rgba(4,6,15,0.74)" :stroke-width="labelFont + 7" stroke-linecap="round" />
              <path :d="mergedUntilArcD" fill="none" stroke="rgba(4,6,15,0.74)" :stroke-width="labelFont + 7" stroke-linecap="round" />
              <text :font-size="labelFont" fill="rgba(255,255,255,0.45)" style="font-variant-numeric: tabular-nums; letter-spacing: 0.02em;">
                <textPath :href="`#${uid}-ms`" startOffset="50%" text-anchor="middle">{{ mergedSinceText }}</textPath>
              </text>
              <text :font-size="labelFont" fill="rgba(255,255,255,0.98)" style="font-variant-numeric: tabular-nums; letter-spacing: 0.02em;">
                <textPath :href="`#${uid}-mu`" startOffset="50%" text-anchor="middle">{{ mergedUntilText }}</textPath>
              </text>
            </template>
            <template v-else>
              <path :id="`${uid}-m1`" :d="mergedArcD" fill="none" stroke="none" />
              <path :d="mergedArcD" fill="none" stroke="rgba(4,6,15,0.74)" :stroke-width="labelFont + 7" stroke-linecap="round" />
              <text :font-size="labelFont" fill="rgba(255,255,255,0.85)" style="font-variant-numeric: tabular-nums; letter-spacing: 0.02em;">
                <textPath :href="`#${uid}-m1`" startOffset="50%" text-anchor="middle">{{ mergedOneLineText }}</textPath>
              </text>
            </template>
          </g>
        </Transition>
      </template>
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
import { ref, reactive, computed, onBeforeUnmount, useId } from "vue";
import { contourPath, ptAt, frac, toMin, bracket, tailRibbon, urgencyColor, fmtDur, type BumpPrayer } from "./bump";

const props = withDefaults(
  defineProps<{
    prayers: BumpPrayer[];
    time: string;
    moonPhase: number;
    size?: number;
    baseAmp?: number;
    hoverAmp?: number;
    sigma?: number;
    /** Draw the comet · sonar cue (tail = since, sonar = until). Off → plain dial. */
    cue?: boolean;
    /** Show the since / until caption pills on the orbit. Auto-hidden when small. */
    cueLabels?: boolean;
    /** Seconds-of-day for the now position. Sub-minute precision → the comet
     *  advances smoothly each tick instead of stepping once a minute (which looks
     *  frozen next to a ticking countdown). Falls back to `time` when omitted. */
    nowSeconds?: number;
    /** Scales the sonar ping opacity (0 = off, 1 = full). Lower it to keep the
     *  pings from competing with nearby labels. */
    sonarIntensity?: number;
  }>(),
  { size: 320, baseAmp: 0.022, hoverAmp: 0.07, sigma: 0.022, cue: true, cueLabels: true, sonarIntensity: 1 }
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

const nowSecNorm = computed(() =>
  props.nowSeconds == null ? null : ((props.nowSeconds % 86400) + 86400) % 86400
);
const nowFrac = computed(() => (nowSecNorm.value == null ? frac(props.time) : nowSecNorm.value / 86400));

// ── Comet · sonar cue ──────────────────────────────────────────────────────
const TAIL_CAP = 150; // minutes the tail can span before it saturates
const BEACON_RANGE = 100; // minutes out at which the sonar starts reacting
const SONAR_RINGS = 4;
const headR = props.size * 0.019;
const sonarMaxR = props.size * 0.095;
// The prayer dots ride outerR-0.016; the comet rides that exact (live) path so it
// lands on them and tracks the hover bumps.
const rEdge = (t: number) => outerR(t) - props.size * 0.016;

const nowMin = computed(() => (nowSecNorm.value == null ? toMin(props.time) : nowSecNorm.value / 60));
const br = computed(() => bracket(props.prayers, nowMin.value));
const headPt = computed(() => ptAt(nowFrac.value, rEdge(nowFrac.value), C, C));
const prayerPt = computed(() => ptAt(br.value.nextMin / 1440, rEdge(br.value.nextMin / 1440), C, C));
const tail = computed(() => tailRibbon(nowMin.value, Math.min(br.value.sinceMin, TAIL_CAP), rEdge, props.size * 0.016, C, C));
const urgency = computed(() => Math.max(0, Math.min(1, 1 - br.value.untilMin / BEACON_RANGE)));
const beaconColor = computed(() => urgencyColor(urgency.value));
// Quantise the ping speed into a few buckets. Colour (stroke) and peak opacity
// stay smooth — they don't restart the CSS animation — but animation-duration
// does, so it must change rarely or the rings visibly jump every minute.
const SONAR_PERIODS = [2.4, 1.7, 1.1, 0.6];
const sonarPeriod = computed(() => SONAR_PERIODS[Math.min(3, Math.floor(urgency.value * 4))]!);
const sonarPeak = computed(() => ((0.12 + urgency.value * 0.6) * props.sonarIntensity).toFixed(2));
const sonarRings = computed(() =>
  Array.from({ length: SONAR_RINGS }, (_, k) => ({ delay: -(k * sonarPeriod.value) / SONAR_RINGS }))
);

// since / until labels curve along a slice of the orbit between the previous and
// next prayer. Shown down to the tray's 150px orbit; hidden on tiny widget sizes.
const showLabels = computed(() => props.cueLabels && props.size >= 140);
const uid = useId();
// Scales with the orbit; floor keeps it readable at the small tray size. There's
// ample dark space outside the ring, so the type can breathe.
const labelFont = Math.max(11, Math.round(props.size * 0.042));
// Pushed out far enough to clear the now-comet AND the maximum hover-bump/sonar,
// so nothing dynamic is needed — a modest static gap covers the worst case.
const labelR = props.size * 0.475;
// Two stacked lines need vertical room; on the tiny tray orbit fall back to one.
const twoLineMerged = props.size >= 220;

// Within the final hour the "until" label ticks live as M:SS (untilMin is
// fractional thanks to nowSeconds); beyond an hour it stays a coarse "1h 30m".
const UNTIL_LIVE_MIN = 60;
const untilDur = computed(() => {
  const u = br.value.untilMin;
  if (u >= 0 && u < UNTIL_LIVE_MIN) {
    const total = Math.max(0, Math.round(u * 60));
    return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
  }
  return fmtDur(u);
});
const sinceLabelText = computed(() => `${labelFor(br.value.prevKey)} ${fmtDur(br.value.sinceMin)}`);
const untilLabelText = computed(() => `${labelFor(br.value.nextKey)} ${untilDur.value}`);
// When merged, the single position loses the since/until cue, so the two halves
// are qualified with "ago"/"in" and stacked ("in" above "ago").
const mergedUntilText = computed(() => `${labelFor(br.value.nextKey)} in ${fmtDur(br.value.untilMin)}`);
const mergedSinceText = computed(() => `${labelFor(br.value.prevKey)} ${fmtDur(br.value.sinceMin)} ago`);
// Single-line merged for the small tray orbit (can't fit two stacked lines).
const mergedOneLineText = computed(() => `${mergedSinceText.value} · ${mergedUntilText.value}`);

// The frac of the full circle a label's text needs at radius `r` (with padding).
function spanFor(text: string, r = labelR) {
  const approxW = text.length * labelFont * 0.6;
  return Math.min(0.5, (approxW * 1.15) / (2 * Math.PI * r));
}
// Text-arc path centred on `fc` spanning `span` at radius `r`. On the bottom half
// the path is reversed so glyphs stay upright (textPath flips text on a lower arc).
function arcD(fc: number, span: number, r = labelR) {
  const bottom = Math.sin(fc * 2 * Math.PI - Math.PI / 2) > 0;
  const dir = bottom ? -1 : 1;
  const n = 18;
  const pts = Array.from({ length: n + 1 }, (_, i) =>
    ptAt(fc - (dir * span) / 2 + dir * span * (i / n), r, C, C)
  );
  return pts.map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
}

const prevFrac = computed(() => br.value.prevMin / 1440);
const nextFrac = computed(() => br.value.nextMin / 1440);
const midFrac = computed(() => (prevFrac.value + nextFrac.value) / 2);

// Label radius rides just outside the (bump-swollen) ring, so a label shifts out
// on hover to stay clear of the swell it sits on — capped so it never leaves the
// box on small screens (no runaway outward push).
const LABEL_GAP = props.size * 0.06;
const LABEL_CAP = props.size * 0.48;
function rAt(fc: number) {
  const t = ((fc % 1) + 1) % 1;
  return Math.min(LABEL_CAP, outerR(t) + LABEL_GAP);
}

const sinceSpan = computed(() => spanFor(sinceLabelText.value, rAt(prevFrac.value)));
const untilSpan = computed(() => spanFor(untilLabelText.value, rAt(nextFrac.value)));
// Merge only when the two arcs' half-spans genuinely (nearly) overlap the gap
// between the prayers — a small pad so they don't render uncomfortably close.
const MERGE_PAD = 0.006;
const merged = computed(
  () => (sinceSpan.value + untilSpan.value) / 2 + MERGE_PAD >= nextFrac.value - prevFrac.value
);

const sinceArcD = computed(() => arcD(prevFrac.value, sinceSpan.value, rAt(prevFrac.value)));
const untilArcD = computed(() => arcD(nextFrac.value, untilSpan.value, rAt(nextFrac.value)));
// Merged stack: "in" at the base radius (clears the comet), "ago" one line further
// out — so at the dial's bottom "in" reads above "ago".
const LINE_OFF = labelFont + 2;
const mergedUntilArcD = computed(() => {
  const r = rAt(midFrac.value);
  return arcD(midFrac.value, spanFor(mergedUntilText.value, r), r);
});
const mergedSinceArcD = computed(() => {
  const r = rAt(midFrac.value) + LINE_OFF;
  return arcD(midFrac.value, spanFor(mergedSinceText.value, r), r);
});
const mergedArcD = computed(() => {
  const r = rAt(midFrac.value);
  return arcD(midFrac.value, spanFor(mergedOneLineText.value, r), r);
});

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

<style scoped>
/* since/until ↔ merged crossfade — a clean morph instead of a hard swap. */
.orbit-label-enter-active,
.orbit-label-leave-active {
  transition: opacity 0.3s ease;
}
.orbit-label-enter-from,
.orbit-label-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .orbit-label-enter-active,
  .orbit-label-leave-active {
    transition: none;
  }
}

/* Sonar pings + head glow run on the compositor (transform/opacity only) — no JS
   rAF loop, so it stays cheap on mobile. transform-box/origin scale each ring
   around its own centre (the next-prayer dot). */
.orbit-ping {
  transform-box: fill-box;
  transform-origin: center;
  animation-name: orbit-ping-kf;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  opacity: 0;
}
@keyframes orbit-ping-kf {
  0% { transform: scale(0.06); opacity: var(--peak, 0.4); }
  100% { transform: scale(1); opacity: 0; }
}
.orbit-head-glow {
  transform-box: fill-box;
  transform-origin: center;
  animation: orbit-head-kf 2.4s ease-in-out infinite;
}
@keyframes orbit-head-kf {
  0%, 100% { transform: scale(1); opacity: 0.16; }
  50% { transform: scale(1.45); opacity: 0.3; }
}
@media (prefers-reduced-motion: reduce) {
  .orbit-head-glow { animation: none; opacity: 0.2; }
  .orbit-ping { animation: none; opacity: var(--peak, 0.3); transform: scale(0.72); }
}
</style>
