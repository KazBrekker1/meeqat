<template>
  <PrototypesCelestialSkyBackground class="h-full" :stars="56" :seed="11">
    <div class="h-full flex flex-col px-3 pb-2.5">
      <!-- Top bar -->
      <header class="flex items-center justify-between pt-3 pb-1 shrink-0">
        <div class="flex items-center gap-1.5 min-w-0">
          <UIcon name="lucide:map-pin" class="size-4 text-white/55 shrink-0" />
          <span class="text-sm font-medium truncate">{{ d.city }}, {{ d.country }}</span>
        </div>
        <div class="flex items-center gap-1">
          <span class="text-sm tabular-nums font-mono text-white/55">{{ d.time }}</span>
          <UButton icon="lucide:settings" size="xs" variant="ghost" color="neutral" class="text-white/60" />
        </div>
      </header>

      <!-- Orbit hero -->
      <div class="flex flex-col items-center shrink-0">
        <PrototypesCelestialOrbitDial :prayers="d.prayers" :time="d.time" :moon-phase="d.moonPhase" :size="208" />
        <div class="relative -mt-1 text-center">
          <p class="text-[11px] uppercase tracking-[0.2em] text-white/55" style="text-shadow:0 1px 3px #05070f;">
            Until {{ d.next.label }}
          </p>
          <p class="text-[2.4rem] leading-none font-mono font-bold tabular-nums mt-1 text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)]">
            {{ d.next.countdown }}
          </p>
          <p class="text-[11px] text-white/55 mt-1.5" style="text-shadow:0 1px 3px #05070f;">
            {{ d.hijri }} · {{ d.gregorian }}
          </p>
          <p class="text-xs text-white/60 mt-1" style="text-shadow:0 1px 3px #05070f;">
            <UIcon name="lucide:moon" class="size-3 inline -mt-0.5" /> {{ d.since.ago }} since {{ d.since.label }}
          </p>
        </div>
      </div>

      <!-- Prayer schedule (compact, fits) -->
      <ul class="mt-2.5 flex-1 min-h-0 rounded-xl bg-white/[0.06] border border-white/10 backdrop-blur-sm divide-y divide-white/[0.07] overflow-y-auto">
        <li
          v-for="p in d.prayers"
          :key="p.key"
          class="flex items-center gap-2.5 px-3 py-1.5"
          :class="[p.isPast ? 'opacity-45' : '', p.isNext ? 'bg-white/[0.08]' : '']"
        >
          <UIcon :name="p.isNext ? 'lucide:star' : iconFor(p.key)" class="size-4 shrink-0" :class="p.isNext ? 'text-amber-300 fill-amber-300' : 'text-white/45'" />
          <span class="text-sm flex-1" :class="p.isNext ? 'font-semibold' : ''">{{ p.label }}</span>
          <span class="text-sm tabular-nums font-mono" :class="p.isNext ? 'text-indigo-100' : 'text-white/65'">{{ p.time }}</span>
        </li>
      </ul>
    </div>
  </PrototypesCelestialSkyBackground>
</template>

<script lang="ts" setup>
import { iconFor } from "../celestial/prayerIcons";
import type { CelestialData } from "../celestial/data";
defineProps<{ d: CelestialData }>();
</script>
