<template>
  <PrototypesCelestialSkyBackground class="h-full" :stars="24" :seed="9" :shooting="false" scrim="full">
    <div class="h-full flex flex-col">
      <header class="flex items-center justify-between px-3 h-11 shrink-0 border-b border-white/10">
        <div class="flex items-center gap-1.5">
          <UButton icon="lucide:arrow-left" size="xs" variant="ghost" color="neutral" class="text-white/70" />
          <h1 class="text-sm font-semibold">Calendar</h1>
        </div>
        <div class="flex p-0.5 rounded-lg bg-white/[0.06] border border-white/10 text-[11px]">
          <button class="px-2 py-0.5 rounded-md bg-indigo-400/25 ring-1 ring-indigo-300/40 font-medium">Hijri</button>
          <button class="px-2 py-0.5 rounded-md text-white/60">Gregorian</button>
        </div>
      </header>

      <div class="flex-1 overflow-y-auto p-3 space-y-3">
        <!-- Month nav -->
        <div class="flex items-center justify-between">
          <UButton icon="lucide:chevron-left" size="xs" variant="ghost" color="neutral" class="text-white/70" />
          <div class="text-center leading-tight">
            <p class="text-sm font-semibold">Dhū al-Ḥijjah 1447</p>
            <p class="text-[10px] text-white/45">June – July 2026</p>
          </div>
          <UButton icon="lucide:chevron-right" size="xs" variant="ghost" color="neutral" class="text-white/70" />
        </div>

        <!-- Month grid (solid backing so dates read clearly) -->
        <div class="rounded-xl bg-[#0b1230] border border-white/10 p-2">
          <div class="grid grid-cols-7 gap-1 text-center text-[10px] text-white/40 mb-1">
            <span v-for="w in ['Su','Mo','Tu','We','Th','Fr','Sa']" :key="w">{{ w }}</span>
          </div>
          <div class="grid grid-cols-7 gap-1">
            <button
              v-for="day in 30"
              :key="day"
              class="relative aspect-square grid place-items-center rounded-md text-xs transition"
              :class="day === d.lunarDay ? 'bg-indigo-400/30 ring-1 ring-indigo-300/60 font-semibold' : 'hover:bg-white/5 text-white/75'"
            >
              {{ day }}
              <PrototypesCelestialMoonPhase
                v-if="day % 5 === 0 || day === d.lunarDay"
                :phase="day / 30"
                :size="9"
                :glow="false"
                :craters="false"
                dark-color="rgba(255,255,255,0.12)"
                class="absolute bottom-0.5 right-0.5 opacity-80"
              />
            </button>
          </div>
        </div>

        <!-- Selected day detail -->
        <div class="rounded-xl bg-white/[0.05] border border-white/10 p-3 flex items-center gap-3">
          <PrototypesCelestialMoonPhase :phase="d.moonPhase" :size="48" halo halo-color="#c7d0ff" />
          <div class="leading-tight">
            <p class="text-sm font-semibold">{{ d.hijri }}</p>
            <p class="text-[11px] text-white/55">{{ d.gregorian }}</p>
            <p class="text-[11px] text-white/45 mt-0.5">{{ d.moonPhaseName }} · {{ d.moonIllum }}% illuminated</p>
          </div>
        </div>

        <UButton block size="sm" label="Jump to today" icon="lucide:calendar-check" color="neutral" variant="soft" />
      </div>
    </div>
  </PrototypesCelestialSkyBackground>
</template>

<script lang="ts" setup>
import type { CelestialData } from "../celestial/data";
defineProps<{ d: CelestialData }>();
</script>
