<template>
  <PrototypesCelestialSkyBackground class="h-full" :stars="90" :seed="7" scrim="none">
    <div class="h-full flex flex-col">
      <!-- App bar -->
      <header class="flex items-center justify-between px-5 h-12 shrink-0 border-b border-white/10 bg-black/20 backdrop-blur-sm">
        <div class="flex items-center gap-2">
          <UIcon name="lucide:moon-star" class="size-4 text-indigo-300" />
          <span class="text-sm font-semibold">Meeqat</span>
        </div>
        <div class="flex items-center gap-3">
          <button class="flex items-center gap-1.5 text-sm text-white/80 hover:text-white">
            <UIcon name="lucide:map-pin" class="size-4" /> {{ d.city }}, {{ d.country }}
            <UIcon name="lucide:chevron-down" class="size-3.5 text-white/50" />
          </button>
          <span class="text-sm tabular-nums font-mono text-white/55">{{ d.time }}</span>
          <UButton icon="lucide:settings" size="xs" variant="ghost" color="neutral" class="text-white/70" />
        </div>
      </header>

      <!-- Two-pane body -->
      <div class="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_360px]">
        <!-- LEFT: orbit + countdown -->
        <section class="relative flex flex-col items-center justify-center gap-3 p-6">
          <PrototypesCelestialOrbitDial :prayers="d.prayers" :time="d.time" :moon-phase="d.moonPhase" :size="300" />
          <div class="text-center mt-1">
            <p class="text-xs uppercase tracking-[0.25em] text-white/55">Until {{ d.next.label }}</p>
            <p class="text-6xl font-mono font-bold tabular-nums mt-2 drop-shadow-[0_2px_14px_rgba(0,0,0,0.5)]">{{ d.next.countdown }}</p>
            <p class="text-sm text-white/55 mt-2">{{ d.hijri }} · {{ d.gregorian }}</p>
            <p class="text-sm text-white/60 mt-1 inline-flex items-center gap-1.5">
              <UIcon name="lucide:moon" class="size-4" /> {{ d.since.ago }} since {{ d.since.label }}
            </p>
          </div>
        </section>

        <!-- RIGHT: schedule + calendar -->
        <aside class="min-h-0 overflow-y-auto border-l border-white/10 bg-black/25 backdrop-blur-md p-3 flex flex-col gap-3">
          <div>
            <h2 class="text-[11px] uppercase tracking-wider text-white/45 mb-1.5 px-1">Today's prayers</h2>
            <ul class="rounded-xl bg-white/[0.05] border border-white/10 divide-y divide-white/[0.07] overflow-hidden">
              <li
                v-for="p in d.prayers"
                :key="p.key"
                class="flex items-center gap-3 px-3 py-2"
                :class="[p.isPast ? 'opacity-45' : '', p.isNext ? 'bg-white/[0.08]' : '']"
              >
                <UIcon :name="p.isNext ? 'lucide:star' : iconFor(p.key)" class="size-4 shrink-0" :class="p.isNext ? 'text-amber-300 fill-amber-300' : 'text-white/45'" />
                <span class="text-sm flex-1" :class="p.isNext ? 'font-semibold' : ''">{{ p.label }}</span>
                <span v-if="p.isNext" class="text-[10px] text-amber-300/80">in {{ shortCountdown }}</span>
                <span class="text-sm tabular-nums font-mono" :class="p.isNext ? 'text-indigo-100' : 'text-white/65'">{{ p.time }}</span>
              </li>
            </ul>
          </div>

          <!-- mini month -->
          <div>
            <div class="flex items-center justify-between mb-1.5 px-1">
              <h2 class="text-[11px] uppercase tracking-wider text-white/45">{{ d.hijri }}</h2>
              <div class="flex gap-1">
                <UButton icon="lucide:chevron-left" size="xs" variant="ghost" color="neutral" class="text-white/60" />
                <UButton icon="lucide:chevron-right" size="xs" variant="ghost" color="neutral" class="text-white/60" />
              </div>
            </div>
            <div class="rounded-xl bg-[#0b1230] border border-white/10 p-2">
              <div class="grid grid-cols-7 gap-1 text-center text-[10px] text-white/40 mb-1">
                <span v-for="w in ['S','M','T','W','T','F','S']" :key="w">{{ w }}</span>
              </div>
              <div class="grid grid-cols-7 gap-1">
                <div
                  v-for="day in 30"
                  :key="day"
                  class="aspect-square grid place-items-center rounded-md text-xs"
                  :class="day === d.lunarDay ? 'bg-indigo-400/30 text-white font-semibold ring-1 ring-indigo-300/50' : 'text-white/65 hover:bg-white/5'"
                >{{ day }}</div>
              </div>
            </div>
          </div>

          <UButton block label="Open calendar" icon="lucide:calendar" color="neutral" variant="soft" class="mt-auto" />
        </aside>
      </div>
    </div>
  </PrototypesCelestialSkyBackground>
</template>

<script lang="ts" setup>
import { iconFor } from "../celestial/prayerIcons";
import type { CelestialData } from "../celestial/data";
const props = defineProps<{ d: CelestialData }>();
const shortCountdown = computed(() => props.d.next.countdown.split(":").slice(0, 2).join(":"));
</script>
