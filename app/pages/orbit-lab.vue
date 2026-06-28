<template>
  <div class="h-screen overflow-y-auto bg-[#070a1c] text-white scroll-celestial">
    <header class="sticky top-0 z-20 backdrop-blur-md bg-[#070a1c]/85 border-b border-white/10">
      <div class="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2 min-w-0">
          <UIcon name="lucide:orbit" class="size-5 text-indigo-300 shrink-0" />
          <div class="min-w-0">
            <h1 class="text-sm font-semibold truncate">Orbit Lab — final</h1>
            <p class="text-xs text-white/55 truncate">spring bumps · pure moon · now live in /prototypes</p>
          </div>
        </div>
        <NuxtLink to="/prototypes" class="text-xs text-indigo-300 hover:text-indigo-200">← full prototypes</NuxtLink>
      </div>
    </header>

    <main class="max-w-5xl mx-auto p-4 sm:p-6">
      <section class="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
        <div class="relative grid place-items-center py-12" style="background: radial-gradient(circle at 50% 45%, #131b40, #060a1c 72%);">
          <OrbitBumps :prayers="mock.prayers" :time="mock.time" :moon-phase="mock.moonPhase" :size="360" />
        </div>
        <p class="text-xs text-white/55 px-4 py-3 flex items-center gap-2">
          <UIcon name="lucide:check-circle-2" class="size-4 text-indigo-300" />
          Final: spring "blooming bump" orbit + pure moon. This is what every screen in
          <NuxtLink to="/prototypes" class="text-indigo-300 hover:text-indigo-200">/prototypes</NuxtLink> now uses.
        </p>
      </section>
    </main>
  </div>
</template>

<script lang="ts" setup>
import OrbitBumps from "@/components/prototypes/orbit/OrbitBumps.vue";

definePageMeta({ layout: false });

const mock = {
  time: "14:32",
  moonPhase: 0.406,
  moonPhaseName: "Waxing Gibbous",
  moonIllum: 92,
  hijri: "12 Dhū al-Ḥijjah 1447",
  next: { label: "ʿAṣr", time: "15:48", countdown: "01:16:24" },
  prayers: [
    { key: "fajr", time: "04:02", isPast: true },
    { key: "sunrise", time: "05:38", isPast: true },
    { key: "dhuhr", time: "13:20", isPast: true },
    { key: "asr", time: "15:48", isNext: true },
    { key: "maghrib", time: "20:02" },
    { key: "isha", time: "21:34" },
  ],
};

</script>
