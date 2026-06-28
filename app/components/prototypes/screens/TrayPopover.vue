<template>
  <PrototypesCelestialSkyBackground class="h-full" :stars="34" :seed="11" :shooting="false" scrim="top">
    <div class="h-full flex flex-col p-3">
      <!-- header (draggable in real app) -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-1 min-w-0">
          <UIcon name="lucide:map-pin" class="size-3 text-white/55 shrink-0" />
          <span class="text-xs font-medium truncate">{{ d.city }}</span>
        </div>
        <UButton icon="lucide:x" size="xs" variant="ghost" color="neutral" class="text-white/50 -mr-1" />
      </div>

      <!-- compact dial -->
      <div class="flex flex-col items-center mt-1">
        <PrototypesCelestialOrbitDial :prayers="d.prayers" :time="d.time" :moon-phase="d.moonPhase" :size="150" />
        <p class="text-[10px] uppercase tracking-[0.18em] text-white/55 -mt-1">Until {{ d.next.label }}</p>
        <p class="text-2xl font-mono font-bold tabular-nums text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">{{ d.next.countdown }}</p>
        <p class="text-[10px] text-white/50">{{ d.hijri }}</p>
        <p class="text-[10px] text-white/50"><UIcon name="lucide:moon" class="size-2.5 inline -mt-0.5" /> {{ d.since.ago }} since {{ d.since.label }}</p>
      </div>

      <!-- list -->
      <ul class="mt-2 flex-1 min-h-0 rounded-xl bg-white/[0.06] border border-white/10 divide-y divide-white/[0.07] overflow-y-auto">
        <li
          v-for="p in d.prayers"
          :key="p.key"
          class="flex items-center gap-2 px-3 py-1"
          :class="[p.isPast ? 'opacity-45' : '', p.isNext ? 'bg-white/[0.08]' : '']"
        >
          <span class="size-1.5 rounded-full shrink-0" :class="p.isNext ? 'bg-amber-300' : 'bg-white/35'" />
          <span class="text-xs flex-1" :class="p.isNext ? 'font-semibold' : ''">{{ p.label }}</span>
          <span class="text-xs tabular-nums font-mono text-white/70">{{ p.time }}</span>
        </li>
      </ul>

      <!-- actions -->
      <div class="flex gap-2 pt-2">
        <UButton label="Open Meeqat" size="xs" color="neutral" variant="soft" class="flex-1 justify-center" />
        <UButton label="Quit" size="xs" color="neutral" variant="ghost" class="flex-1 justify-center text-white/60" />
      </div>
    </div>
  </PrototypesCelestialSkyBackground>
</template>

<script lang="ts" setup>
import type { CelestialData } from "../celestial/data";
defineProps<{ d: CelestialData }>();
</script>
