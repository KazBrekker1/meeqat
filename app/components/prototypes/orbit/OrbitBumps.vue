<template>
  <div ref="root" class="relative" :style="{ width: size + 'px', height: size + 'px' }">
    <!-- flat sky-coloured ring; each prayer's outer edge swells (spring) on hover -->
    <div class="absolute inset-0" :style="{ background: conic, clipPath: clip, '-webkit-clip-path': clip }" />

    <!-- centre (overridable) -->
    <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
      <slot>
        <PrototypesCelestialMoonPhase :phase="moonPhase" :size="Math.round(size * 0.42)" halo halo-color="#cdd6ff" />
      </slot>
    </div>

    <!-- NOW-MARKER · the moon as gnomon. One arm from the moon's limb toward now,
         clipped to the gap + band: by day the sun's shadow at its true length
         (touching the prayer path at ʿAṣr), by night moonlight. Each arm is a fixed
         shape drawn at 12 o'clock and turned to now by one CSS transform per tick;
         its path/blur only rebuild when its length changes by 0.1 px. -->
    <template v-if="cue">
      <div
        v-if="gn.sun > 0.001"
        class="absolute inset-0 pointer-events-none mix-blend-multiply"
        :style="{ clipPath: armClip, '-webkit-clip-path': armClip, opacity: gn.sun.toFixed(3) }"
      >
        <div class="absolute inset-0" :style="armTurn">
          <svg :viewBox="`0 0 ${size} ${size}`" class="absolute inset-0 w-full h-full overflow-visible">
            <defs>
              <filter :id="`${uid}-s`" x="-100%" y="-10%" width="300%" height="120%"><feGaussianBlur :stdDeviation="(1.4 * k).toFixed(2)" /></filter>
              <filter :id="`${uid}-c`" x="-100%" y="-10%" width="300%" height="120%"><feGaussianBlur :stdDeviation="(0.45 * k).toFixed(2)" /></filter>
            </defs>
            <g :fill="ink">
              <path :d="shadowSoft" opacity="0.42" :filter="`url(#${uid}-s)`" />
              <path :d="shadowCore" opacity="0.9" :filter="`url(#${uid}-c)`" />
            </g>
          </svg>
        </div>
      </div>
      <div
        v-if="gn.moon > 0.001"
        class="absolute inset-0 pointer-events-none mix-blend-screen"
        :style="{ clipPath: armClip, '-webkit-clip-path': armClip, opacity: gn.moon.toFixed(3) }"
      >
        <div class="absolute inset-0" :style="armTurn">
          <svg :viewBox="`0 0 ${size} ${size}`" class="absolute inset-0 w-full h-full overflow-visible">
            <defs>
              <linearGradient :id="`${uid}-bg`" gradientUnits="userSpaceOnUse" x1="0" :y1="C - moonR" x2="0" :y2="C - Ro">
                <stop offset="0" :stop-color="MOONLIGHT_CSS" stop-opacity="0.3" />
                <stop offset="0.55" :stop-color="MOONLIGHT_CSS" stop-opacity="0.5" />
                <stop offset="1" :stop-color="MOONLIGHT_CSS" stop-opacity="0.9" />
              </linearGradient>
              <filter :id="`${uid}-b`" x="-100%" y="-10%" width="300%" height="120%"><feGaussianBlur :stdDeviation="(0.9 * k).toFixed(2)" /></filter>
            </defs>
            <path :d="beamSoft" :fill="`url(#${uid}-bg)`" :filter="`url(#${uid}-b)`" />
            <path :d="beamCore" :fill="`url(#${uid}-bg)`" opacity="0.75" />
          </svg>
        </div>
      </div>
    </template>

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

      <!-- Next prayer: a calm ping (two slow rings) around a small beacon, cool →
           coral as it nears. Now: one small point where the arm meets the path. -->
      <g v-if="cue">
        <circle
          v-for="(r, i) in sonarRings" :key="'sn' + i"
          class="orbit-ping"
          :cx="prayerPt.x" :cy="prayerPt.y" :r="sonarMaxR"
          fill="none" :stroke="beaconColor" stroke-width="1.2"
          :style="{ animationDuration: sonarPeriod + 's', animationDelay: r.delay + 's', '--peak': sonarPeak }"
        />
        <circle :cx="prayerPt.x" :cy="prayerPt.y" :r="3.4 + urgency * 1.6" :fill="beaconColor" />
        <circle
          :cx="headPt.x.toFixed(2)" :cy="headPt.y.toFixed(2)" :r="(3.8 * k).toFixed(2)"
          :fill="nowFill" :stroke="nowStroke" :stroke-width="Math.max(1.2, 1.3 * k).toFixed(2)"
          :style="{ filter: nowGlow }"
        />
      </g>

      <!-- since / until read out as a caption banner anchored at the dial's
           bottom (6 o'clock). Fixed there — rather than riding the prayer dots —
           so the curved text stays upright at every position and never twists;
           the now-point + dots already carry "where", so the banner only carries
           "how long". A soft dark band keeps it legible over the ring. Large orbs
           stack two lines ("in" bright above "ago" muted); the tray packs one. -->
      <template v-if="cue && showLabels">
        <template v-if="twoLine">
          <path :id="`${uid}-bu`" :d="untilBanner.d" fill="none" stroke="none" />
          <path :id="`${uid}-bs`" :d="sinceBanner.d" fill="none" stroke="none" />
          <path :d="sinceBanner.d" fill="none" stroke="rgba(4,6,15,0.74)" :stroke-width="sinceBanner.font + 7" stroke-linecap="round" />
          <path :d="untilBanner.d" fill="none" stroke="rgba(4,6,15,0.74)" :stroke-width="untilBanner.font + 7" stroke-linecap="round" />
          <text :font-size="sinceBanner.font" fill="rgba(255,255,255,0.5)" style="font-variant-numeric: tabular-nums; letter-spacing: 0.02em;">
            <textPath :href="`#${uid}-bs`" startOffset="50%" text-anchor="middle">{{ sinceText }}</textPath>
          </text>
          <text :font-size="untilBanner.font" fill="rgba(255,255,255,0.98)" style="font-variant-numeric: tabular-nums; letter-spacing: 0.02em;">
            <textPath :href="`#${uid}-bu`" startOffset="50%" text-anchor="middle">{{ untilText }}</textPath>
          </text>
        </template>
        <template v-else>
          <path :id="`${uid}-b1`" :d="oneBanner.d" fill="none" stroke="none" />
          <path :d="oneBanner.d" fill="none" stroke="rgba(4,6,15,0.74)" :stroke-width="oneBanner.font + 7" stroke-linecap="round" />
          <text :font-size="oneBanner.font" fill="rgba(255,255,255,0.9)" style="font-variant-numeric: tabular-nums; letter-spacing: 0.02em;">
            <textPath :href="`#${uid}-b1`" startOffset="50%" text-anchor="middle">{{ oneLineText }}</textPath>
          </text>
        </template>
      </template>
    </svg>

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
import { contourPath, ptAt, frac, toMin, bracket, urgencyColor, fmtDur, type BumpPrayer } from "./bump";
import { sunAltitudeDeg, cotD, gnomonWeights, sunInk, mixRgb, rgb, armPath, MOONLIGHT } from "@/utils/moon/gnomon";

const props = withDefaults(
  defineProps<{
    prayers: BumpPrayer[];
    time: string;
    moonPhase: number;
    size?: number;
    baseAmp?: number;
    hoverAmp?: number;
    sigma?: number;
    /** Draw the now-marker (the moon as gnomon) + next-prayer ping. Off → plain dial. */
    cue?: boolean;
    /** Show the since / until caption pills on the orbit. Auto-hidden when small. */
    cueLabels?: boolean;
    /** Seconds-of-day for the now position. Sub-minute precision → the marker
     *  advances smoothly each tick instead of stepping once a minute (which looks
     *  frozen next to a ticking countdown). Falls back to `time` when omitted. */
    nowSeconds?: number;
    /** Scales the sonar ping opacity (0 = off, 1 = full). Lower it to keep the
     *  pings from competing with nearby labels. */
    sonarIntensity?: number;
    /** Observer position for the sun's real altitude (the shadow's length). null → no
     *  arm, just the now-point (day/night from the prayer times). */
    lat?: number | null;
    lng?: number | null;
  }>(),
  { size: 320, baseAmp: 0.022, hoverAmp: 0.07, sigma: 0.022, cue: true, cueLabels: true, sonarIntensity: 0.6, lat: null, lng: null }
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

// ── Next-prayer ping ───────────────────────────────────────────────────────
const BEACON_RANGE = 100; // minutes out at which the ping starts reacting
const SONAR_RINGS = 2;
const sonarMaxR = props.size * 0.062;
// The prayer dots ride outerR-0.016; the now-point rides that exact (live) path so it
// lands on them and tracks the hover bumps.
const rEdge = (t: number) => outerR(t) - props.size * 0.016;

const nowMin = computed(() => (nowSecNorm.value == null ? toMin(props.time) : nowSecNorm.value / 60));
const br = computed(() => bracket(props.prayers, nowMin.value));
const headPt = computed(() => ptAt(nowFrac.value, rEdge(nowFrac.value), C, C));
const prayerPt = computed(() => ptAt(br.value.nextMin / 1440, rEdge(br.value.nextMin / 1440), C, C));
const urgency = computed(() => Math.max(0, Math.min(1, 1 - br.value.untilMin / BEACON_RANGE)));
const beaconColor = computed(() => urgencyColor(urgency.value));
// Quantise the ping speed into a few buckets. Colour (stroke) and peak opacity
// stay smooth — they don't restart the CSS animation — but animation-duration
// does, so it must change rarely or the rings visibly jump every minute.
const SONAR_PERIODS = [3.6, 3.0, 2.4, 1.8];
const sonarPeriod = computed(() => SONAR_PERIODS[Math.min(3, Math.floor(urgency.value * 4))]!);
const sonarPeak = computed(() => ((0.1 + urgency.value * 0.35) * props.sonarIntensity).toFixed(3));
const sonarRings = computed(() =>
  Array.from({ length: SONAR_RINGS }, (_, k) => ({ delay: -(k * sonarPeriod.value) / SONAR_RINGS }))
);

// ── Now-marker · the moon as gnomon ───────────────────────────────────────
// Arm / point scale: never thinner than 80 % at phone size.
const k = Math.max(0.8, props.size / 500);
// Moon disc radius: the centre moon is 0.42 × 0.92 of the orbit (see MoonSphere callers).
const moonR = (props.size * 0.42 * 0.92) / 2;
const r0 = moonR + 0.5;
const rMax = Ro + baseA * 2.5 + 12;
const MOONLIGHT_CSS = rgb(MOONLIGHT);
const f2 = (n: number) => n.toFixed(2);
// The arms live between the moon's limb and the ring's outer contour.
const limbPath = `M ${f2(C - moonR)},${f2(C)} a ${f2(moonR)},${f2(moonR)} 0 1,0 ${f2(2 * moonR)},0 a ${f2(moonR)},${f2(moonR)} 0 1,0 ${f2(-2 * moonR)},0 Z`;
const armClip = computed(() => `path(evenodd, '${outerPath.value} ${limbPath}')`);
const armTurn = computed(() => ({
  transformOrigin: `${C}px ${C}px`,
  transform: `rotate(${(nowFrac.value * 360).toFixed(2)}deg)`,
  willChange: "transform",
}));

const { getNow } = useMockTime();
const hasPlace = computed(() => props.lat != null && props.lng != null);
// The orbit's clock is local seconds-of-day; map a minute-of-day back to an instant today.
function instantAt(min: number): Date {
  const d = getNow();
  d.setHours(0, 0, 0, 0);
  return new Date(d.getTime() + min * 60_000);
}
// Real (apparent) sun altitude now, in degrees; null without a place.
const sunAlt = computed(() =>
  hasPlace.value ? sunAltitudeDeg(instantAt(nowMin.value), props.lat!, props.lng!) : null
);
// Shadow length (in gnomon heights) that exactly reaches the prayer path: today's
// ʿAṣr. Recomputed only when the day, place or ʿAṣr time changes.
const dayKey = computed(() => {
  void nowMin.value;
  return getNow().toDateString();
});
const asrShadow = computed(() => {
  void dayKey.value;
  if (!hasPlace.value) return null;
  const asr = props.prayers.find((p) => p.key === "asr");
  if (asr) return cotD(sunAltitudeDeg(instantAt(toMin(asr.time)), props.lat!, props.lng!));
  // No ʿAṣr on the dial: the classic mithl — the noon shadow plus one gnomon.
  let best = -90;
  for (let m = 600; m <= 780; m += 2) best = Math.max(best, sunAltitudeDeg(instantAt(m), props.lat!, props.lng!));
  return cotD(best) + 1;
});
// Without a place, fall back to the prayer times: sun up between Sunrise and Maghrib.
const altOrGuess = computed(() => {
  if (sunAlt.value != null) return sunAlt.value;
  const sr = props.prayers.find((p) => p.key === "sunrise");
  const ss = props.prayers.find((p) => p.key === "maghrib");
  if (!sr || !ss) return -18;
  return nowMin.value >= toMin(sr.time) && nowMin.value < toMin(ss.time) ? 30 : -18;
});
// Cross-fade weights; the arms need a real sun position.
const gn = computed(() => {
  const w = gnomonWeights(altOrGuess.value);
  return hasPlace.value ? w : { ...w, sun: 0, moon: 0 };
});
// Sky tint quantised to whole degrees so the fill only changes a few times an hour.
const inkRgb = computed(() => sunInk(Math.round(altOrGuess.value)));
const ink = computed(() => rgb(inkRgb.value));

// Tip of the shadow: L / L(ʿAṣr) of the way from the band's inner edge to the prayer
// path, so it lands on the path exactly at ʿAṣr. Bucketed to 0.1 px → the path
// strings below only rebuild when the length visibly changes.
const shadowTip = computed(() => {
  if (sunAlt.value == null || asrShadow.value == null) return 0;
  const rIn = Ri + 2;
  const Rt = rIn + (cotD(sunAlt.value) / asrShadow.value) * (rEdge(nowFrac.value) - rIn);
  return Math.round(Math.min(rMax, Rt) * 10) / 10;
});
const beamTip = computed(() => Math.round(rEdge(nowFrac.value) * 10) / 10);
const shadowCore = computed(() => armPath(C, r0, shadowTip.value, 4.2 * k, k));
const shadowSoft = computed(() => armPath(C, r0, shadowTip.value + 2 * k, 7 * k, k));
const beamSoft = computed(() => armPath(C, r0, beamTip.value + 3 * k, 4.6 * k, k));
const beamCore = computed(() => armPath(C, r0, beamTip.value, 1.5 * k, k));

// Now: ink with a white rim by day, moon-white with a dark rim (and a tiny glow) by night.
const nowFill = computed(() => rgb(mixRgb([246, 249, 255], inkRgb.value, gn.value.day)));
const nowStroke = computed(() => rgb(mixRgb([8, 12, 32], [255, 255, 255], gn.value.day), 0.9));
const nowGlow = computed(() => {
  const day = gn.value.day;
  return day < 0.999 ? `drop-shadow(0 0 ${f2(2.6 * k)}px rgba(214,226,255,${f2((1 - day) * 0.85)}))` : "none";
});

// since / until read out as a caption banner anchored at the dial's bottom
// (6 o'clock). Fixing the position there — instead of riding the prayer dots —
// keeps the curved text upright everywhere; the now-point + dots already carry
// "where we are", so the banner only carries "how long". Shown down to the
// tray's 150px orbit; hidden on tiny widget sizes.
const showLabels = computed(() => props.cueLabels && props.size >= 140);
const uid = useId();
// Scales with the orbit; floor keeps it readable at the small tray size, and the
// cap keeps a big desktop orb's caption from shouting.
const bannerFont = Math.min(22, Math.max(11, Math.round(props.size * 0.05)));
// Rides just outside the ring (Ro = 0.355·size) — far enough to clear a prayer
// dot sitting at the 6-o'clock bottom, close enough that the outer line stays
// within the box (so it never collides with the date beneath the orbit).
const Rbanner = props.size * 0.42;
// Gap between the "until" and "since" lines; 1.3× the font keeps them from crowding.
const LINE_OFF = Math.round(bannerFont * 1.3);
// Two stacked lines need vertical room; on the tiny tray orbit fall back to one.
const twoLine = props.size >= 220;

// Within the final hour the "until" ticks live as M:SS (untilMin is fractional
// thanks to nowSeconds); beyond an hour it stays a coarse "1h 30m".
const UNTIL_LIVE_MIN = 60;
const untilDur = computed(() => {
  const u = br.value.untilMin;
  if (u >= 0 && u < UNTIL_LIVE_MIN) {
    const total = Math.max(0, Math.round(u * 60));
    return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
  }
  return fmtDur(u);
});
const sinceText = computed(() => `${labelFor(br.value.prevKey)} ${fmtDur(br.value.sinceMin)} ago`);
const untilText = computed(() => `${labelFor(br.value.nextKey)} in ${untilDur.value}`);
// One-line fallback packs both halves for the tray (no room to stack).
const oneLineText = computed(
  () => `${labelFor(br.value.prevKey)} ${fmtDur(br.value.sinceMin)} · ${labelFor(br.value.nextKey)} ${untilDur.value}`
);

// Cap the arc a banner may span so its ends never climb into the vertical zones
// (≈±54° of the bottom); if the text is too long for the cap, shrink the font
// rather than let it wrap round and twist.
const SPAN_CAP = 0.3;
function fitBanner(text: string, r: number) {
  const spanAt = (f: number) => (text.length * f * 0.6 * 1.15) / (2 * Math.PI * r);
  let font = bannerFont;
  const need = spanAt(font);
  if (need > SPAN_CAP) font = Math.max(9, Math.round((font * SPAN_CAP) / need));
  return { font, span: Math.min(SPAN_CAP, spanAt(font)) };
}
// Arc centred on the 6-o'clock bottom (frac 0.5), swept right→left so the glyphs
// read left→right upright.
function bottomArcD(r: number, span: number) {
  const n = 22;
  const pts = Array.from({ length: n + 1 }, (_, i) =>
    ptAt(0.5 + span / 2 - span * (i / n), r, C, C)
  );
  return pts.map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
}
// until on the inner line (higher on screen), since one line further out.
const untilBanner = computed(() => {
  const f = fitBanner(untilText.value, Rbanner);
  return { ...f, d: bottomArcD(Rbanner, f.span) };
});
const sinceBanner = computed(() => {
  const r = Rbanner + LINE_OFF;
  const f = fitBanner(sinceText.value, r);
  return { ...f, d: bottomArcD(r, f.span) };
});
const oneBanner = computed(() => {
  const f = fitBanner(oneLineText.value, Rbanner);
  return { ...f, d: bottomArcD(Rbanner, f.span) };
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
/* Next-prayer pings run on the compositor (transform/opacity only) — no JS rAF
   loop, so it stays cheap on mobile. transform-box/origin scale each ring around
   its own centre (the next-prayer dot). */
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
@media (prefers-reduced-motion: reduce) {
  .orbit-ping { animation: none; display: none; }
}
</style>
