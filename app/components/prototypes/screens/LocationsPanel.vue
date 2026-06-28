<template>
  <PrototypesCelestialSkyBackground class="h-full" :stars="40" :seed="14" :shooting="false" scrim="full">
    <div class="h-full flex flex-col">
      <header class="flex items-center gap-2 px-3 h-11 shrink-0 border-b border-white/10">
        <UButton icon="lucide:arrow-left" size="xs" variant="ghost" color="neutral" class="text-white/70" />
        <h1 class="text-sm font-semibold">Location</h1>
      </header>

      <div class="flex-1 overflow-y-auto p-3 space-y-3">
        <!-- search -->
        <div class="flex items-center gap-2 rounded-lg bg-white/[0.06] border border-white/10 px-3 py-2">
          <UIcon name="lucide:search" class="size-4 text-white/45" />
          <span class="text-sm text-white/45">Search a city…</span>
        </div>

        <!-- current -->
        <div class="rounded-xl bg-indigo-400/15 border border-indigo-300/30 p-3 flex items-center gap-3">
          <div class="size-9 rounded-lg bg-indigo-400/30 grid place-items-center shrink-0">
            <UIcon name="lucide:navigation" class="size-4 text-indigo-100" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold truncate">{{ d.city }}, {{ d.country }}</p>
            <p class="text-[11px] text-white/55">Current location · {{ d.time }}</p>
          </div>
          <UIcon name="lucide:check-circle-2" class="size-5 text-indigo-200" />
        </div>

        <!-- favorites -->
        <section>
          <div class="flex items-center justify-between mb-2 px-1">
            <p class="text-xs uppercase tracking-wider text-white/45">Favorites</p>
            <span class="text-[11px] text-white/40">3 / 5</span>
          </div>
          <ul class="rounded-xl bg-white/[0.05] border border-white/10 divide-y divide-white/[0.07] overflow-hidden">
            <li v-for="f in favorites" :key="f.city" class="flex items-center gap-3 px-3 py-2">
              <UIcon name="lucide:star" class="size-4 shrink-0 text-amber-300/80 fill-amber-300/80" />
              <div class="flex-1 min-w-0">
                <p class="text-sm truncate">{{ f.city }}</p>
                <p class="text-[11px] text-white/45">{{ f.country }} · {{ f.time }}</p>
              </div>
              <UButton icon="lucide:x" size="xs" variant="ghost" color="neutral" class="text-white/40" />
            </li>
          </ul>
        </section>

        <UButton block label="Add current to favorites" icon="lucide:plus" color="neutral" variant="soft" />

        <!-- map hint -->
        <div class="rounded-xl border border-white/10 overflow-hidden relative h-24 bg-[#0c1430]">
          <div class="absolute inset-0 opacity-40" style="background: radial-gradient(60% 80% at 40% 30%, rgba(99,102,241,0.5), transparent), radial-gradient(50% 70% at 80% 80%, rgba(56,189,248,0.4), transparent);" />
          <div class="absolute inset-0 grid place-items-center">
            <span class="flex items-center gap-1.5 text-xs text-white/70"><UIcon name="lucide:map" class="size-4" /> Pick on map</span>
          </div>
        </div>
      </div>
    </div>
  </PrototypesCelestialSkyBackground>
</template>

<script lang="ts" setup>
import type { CelestialData } from "../celestial/data";
defineProps<{ d: CelestialData }>();

const favorites = [
  { city: "Mecca", country: "Saudi Arabia", time: "15:32" },
  { city: "Istanbul", country: "Türkiye", time: "15:32" },
  { city: "London", country: "United Kingdom", time: "13:32" },
];
</script>
