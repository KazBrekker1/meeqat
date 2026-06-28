<!-- RECOMMENDED — Live orbit hero + slim times strip (hybrid of A).
     Keeps A's orbit centerpiece but adds an always-visible one-line daily times
     strip (next highlighted), so every prayer is glanceable WITHOUT hover/tap —
     which a home-screen widget can't do (touch-only, frozen bitmap). 4×2 keeps the
     moon accent. Native: orbit = Kotlin Canvas bitmap; strip = weighted TextViews. -->
<script setup lang="ts">
import type { WidgetData } from "./data";
import { ORBIT_PRAYERS, NOW_HHMM } from "./data";
defineProps<{ d: WidgetData }>();
const SKY = "linear-gradient(225deg, #1f2a63 0%, #141c40 45%, #0a0e22 100%)";
const BAR = "linear-gradient(90deg, #818cf8, #fcd34d)";
</script>

<template>
  <div class="flex flex-wrap items-start gap-6">
    <!-- 4×2 — moon accent + countdown, times strip across the bottom -->
    <PrototypesWidgetWidgetFrame label="4×2 · moon accent" :w="320" :h="136">
      <div class="flex h-full w-full flex-col justify-center gap-2 px-5 py-3 text-white" :style="{ background: SKY }">
        <div class="flex items-center gap-4">
          <PrototypesCelestialMoonPhase :phase="d.moonPhase" :size="42" halo halo-color="#cdd6ff" class="shrink-0" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-[10px] uppercase tracking-[0.16em] text-white/55">Until {{ d.next.label }} · {{ d.next.time }}</p>
            <p class="mt-0.5 font-mono text-[23px] font-bold tabular-nums leading-none">{{ d.next.countdown }}</p>
            <div class="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div class="h-full rounded-full" :style="{ width: d.progress * 100 + '%', background: BAR }" />
            </div>
            <p class="mt-1 truncate text-[9px] text-white/45">{{ d.prev.label }} · {{ d.prev.elapsed }}</p>
          </div>
        </div>
        <PrototypesWidgetTimesStrip :prayers="d.prayers" />
      </div>
    </PrototypesWidgetWidgetFrame>

    <!-- wide — orbit + info on top, times strip across the bottom -->
    <PrototypesWidgetWidgetFrame label="wide" :w="420" :h="184">
      <div class="flex h-full w-full flex-col gap-2.5 px-5 py-4 text-white" :style="{ background: SKY }">
        <div class="flex flex-1 items-center gap-5">
          <PrototypesOrbitBumps :prayers="ORBIT_PRAYERS" :time="NOW_HHMM" :moon-phase="d.moonPhase" :size="104" class="shrink-0" />
          <div class="flex min-w-0 flex-1 flex-col">
            <p class="truncate text-[10px] text-white/55">{{ d.city }} · {{ d.hijri }}</p>
            <p class="mt-1 text-[10px] uppercase tracking-[0.16em] text-white/55">Until {{ d.next.label }}</p>
            <p class="mt-0.5 font-mono text-[28px] font-bold tabular-nums leading-none">{{ d.next.countdown }}</p>
            <div class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div class="h-full rounded-full" :style="{ width: d.progress * 100 + '%', background: BAR }" />
            </div>
            <p class="mt-1.5 truncate text-[10px] text-white/45">{{ d.prev.label }} · {{ d.prev.elapsed }}</p>
          </div>
        </div>
        <PrototypesWidgetTimesStrip :prayers="d.prayers" />
      </div>
    </PrototypesWidgetWidgetFrame>

    <!-- compact — orbit hero, countdown, times strip -->
    <PrototypesWidgetWidgetFrame label="compact" :w="320" :h="224">
      <div class="flex h-full w-full flex-col items-center px-5 py-4 text-white" :style="{ background: SKY }">
        <div class="flex w-full items-center justify-between text-[10px] text-white/55">
          <span class="truncate">{{ d.city }}</span>
          <span class="shrink-0 tabular-nums">{{ d.now }}</span>
        </div>
        <PrototypesOrbitBumps :prayers="ORBIT_PRAYERS" :time="NOW_HHMM" :moon-phase="d.moonPhase" :size="84" class="my-0.5" />
        <p class="text-[10px] uppercase tracking-[0.16em] text-white/55">{{ d.next.label }} · {{ d.next.time }}</p>
        <p class="font-mono text-lg font-bold tabular-nums leading-tight">{{ d.next.countdown }}</p>
        <div class="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div class="h-full rounded-full" :style="{ width: d.progress * 100 + '%', background: BAR }" />
        </div>
        <p class="mt-1 text-[10px] text-white/45">{{ d.prev.label }} · {{ d.prev.elapsed }}</p>
        <PrototypesWidgetTimesStrip :prayers="d.prayers" class="mt-auto" />
      </div>
    </PrototypesWidgetWidgetFrame>

    <!-- 4×4 full — header, big orbit hero, countdown/progress, times strip, since -->
    <PrototypesWidgetWidgetFrame label="4×4 · full" :w="320" :h="436">
      <div class="flex h-full w-full flex-col items-center p-5 text-white" :style="{ background: SKY }">
        <div class="flex w-full items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate text-[13px] font-medium">{{ d.city }}</p>
            <p class="truncate text-[10px] text-white/55">{{ d.greg }} · {{ d.hijri }}</p>
          </div>
          <span class="shrink-0 text-[11px] tabular-nums text-white/60">{{ d.now }}</span>
        </div>
        <PrototypesOrbitBumps :prayers="ORBIT_PRAYERS" :time="NOW_HHMM" :moon-phase="d.moonPhase" :size="196" class="my-3" />
        <p class="text-[10px] uppercase tracking-[0.16em] text-white/55">Until {{ d.next.label }} · {{ d.next.time }}</p>
        <p class="mt-0.5 font-mono text-[32px] font-bold tabular-nums leading-none">{{ d.next.countdown }}</p>
        <div class="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div class="h-full rounded-full" :style="{ width: d.progress * 100 + '%', background: BAR }" />
        </div>
        <PrototypesWidgetTimesStrip :prayers="d.prayers" class="mt-4" />
        <p class="mt-auto pt-3 text-[10px] text-white/45">{{ d.prev.label }} · {{ d.prev.elapsed }}</p>
      </div>
    </PrototypesWidgetWidgetFrame>
  </div>
</template>
