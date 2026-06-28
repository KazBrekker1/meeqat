<template>
  <PrototypesCelestialSkyBackground class="h-full" :stars="30" :seed="2" :shooting="false" scrim="full">
    <div class="h-full overflow-y-auto p-4 space-y-4 text-sm">
      <h1 class="text-base font-semibold">Celestial components</h1>

      <!-- Moon phases -->
      <section>
        <p class="text-xs uppercase tracking-wider text-white/45 mb-2">Moon phases (SVG, data-driven)</p>
        <div class="flex items-end justify-between rounded-xl bg-white/[0.05] border border-white/10 p-3">
          <div v-for="m in moons" :key="m.label" class="flex flex-col items-center gap-1.5">
            <PrototypesCelestialMoonPhase :phase="m.phase" :size="40" :halo="m.label === 'Full'" />
            <span class="text-[10px] text-white/50">{{ m.label }}</span>
          </div>
        </div>
      </section>

      <!-- Animated dial -->
      <section>
        <p class="text-xs uppercase tracking-wider text-white/45 mb-2">Orbit dial (anime.js)</p>
        <div class="rounded-xl bg-white/[0.05] border border-white/10 p-3 flex justify-center">
          <PrototypesCelestialOrbitDial :prayers="d.prayers" :time="d.time" :moon-phase="d.moonPhase" :size="180" />
        </div>
      </section>

      <!-- Buttons -->
      <section>
        <p class="text-xs uppercase tracking-wider text-white/45 mb-2">Buttons</p>
        <div class="flex flex-wrap gap-2">
          <UButton label="Primary" color="primary" />
          <UButton label="Soft" color="neutral" variant="soft" />
          <UButton label="Ghost" color="neutral" variant="ghost" class="text-white/70" />
          <UButton icon="lucide:bell" label="Icon" color="neutral" variant="soft" />
          <UButton icon="lucide:settings" color="neutral" variant="ghost" square class="text-white/70" />
        </div>
      </section>

      <!-- Prayer rows -->
      <section>
        <p class="text-xs uppercase tracking-wider text-white/45 mb-2">Prayer rows — past · next · upcoming</p>
        <ul class="rounded-xl bg-white/[0.06] border border-white/10 divide-y divide-white/[0.07] overflow-hidden">
          <li v-for="p in d.prayers.slice(2, 5)" :key="p.key" class="flex items-center gap-3 px-4 py-2.5" :class="[p.isPast ? 'opacity-45' : '', p.isNext ? 'bg-white/[0.08]' : '']">
            <UIcon :name="p.isNext ? 'lucide:star' : iconFor(p.key)" class="size-4 shrink-0" :class="p.isNext ? 'text-amber-300 fill-amber-300' : 'text-white/45'" />
            <span class="flex-1" :class="p.isNext ? 'font-semibold' : ''">{{ p.label }}</span>
            <span class="tabular-nums font-mono" :class="p.isNext ? 'text-indigo-100' : 'text-white/65'">{{ p.time }}</span>
          </li>
        </ul>
      </section>

      <!-- Controls -->
      <section class="grid grid-cols-2 gap-4">
        <div>
          <p class="text-xs uppercase tracking-wider text-white/45 mb-2">Segmented</p>
          <div class="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white/[0.06] border border-white/10">
            <button class="rounded-lg py-1.5 bg-indigo-400/25 ring-1 ring-indigo-300/40 font-medium text-xs">City</button>
            <button class="rounded-lg py-1.5 text-white/60 text-xs">GPS</button>
          </div>
        </div>
        <div>
          <p class="text-xs uppercase tracking-wider text-white/45 mb-2">Toggle</p>
          <div class="flex items-center gap-3 rounded-xl bg-white/[0.06] border border-white/10 px-3 py-2">
            <span class="flex-1 text-xs">24-hour</span>
            <span class="relative inline-flex h-5 w-9 items-center rounded-full bg-indigo-400">
              <span class="inline-block size-4 translate-x-4 rounded-full bg-white" />
            </span>
          </div>
        </div>
      </section>

      <!-- Badges + progress -->
      <section>
        <p class="text-xs uppercase tracking-wider text-white/45 mb-2">Badges & progress</p>
        <div class="flex items-center gap-2 flex-wrap mb-3">
          <UBadge label="Next" color="primary" variant="subtle" />
          <UBadge label="Offline" color="warning" variant="subtle" />
          <UBadge label="GPS" color="neutral" variant="subtle" />
          <span class="text-[11px] text-amber-200 inline-flex items-center gap-1"><UIcon name="lucide:moon" class="size-3" /> {{ d.moonPhaseName }}</span>
        </div>
        <div class="h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div class="h-full rounded-full bg-gradient-to-r from-sky-300 to-fuchsia-300" :style="{ width: d.progress + '%' }" />
        </div>
      </section>
    </div>
  </PrototypesCelestialSkyBackground>
</template>

<script lang="ts" setup>
import { iconFor } from "../celestial/prayerIcons";
import type { CelestialData } from "../celestial/data";
defineProps<{ d: CelestialData }>();

const moons = [
  { label: "New", phase: 0.0 },
  { label: "Cresc", phase: 0.12 },
  { label: "1st Qtr", phase: 0.25 },
  { label: "Gibb", phase: 0.406 },
  { label: "Full", phase: 0.5 },
  { label: "Last Qtr", phase: 0.75 },
];
</script>
