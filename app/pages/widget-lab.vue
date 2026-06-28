<!-- PROTOTYPE / widget-lab — the chosen home-screen widget design at real sizes:
     Live orbit hero + slim always-visible daily times strip (next highlighted).
     The orbit is the real OrbitBumps component; on native Android it becomes a
     Kotlin Canvas bitmap (RemoteViews can't render it live, and there's no hover/
     tap-to-peek on a home screen — so every prayer time stays always-visible).
     Reference only — delete once the native port is confirmed on-device. -->
<script setup lang="ts">
import OrbitHeroHybridWidget from "@/components/prototypes/widget/OrbitHeroHybridWidget.vue";
import { SAMPLE } from "@/components/prototypes/widget/data";

definePageMeta({ layout: false });
useHead({ title: "Widget Lab", htmlAttrs: { class: "dark" } });
</script>

<template>
  <div
    class="min-h-screen w-full overflow-y-auto px-6 py-10 text-white"
    style="background: linear-gradient(160deg, #1b2230 0%, #2a2440 50%, #14202e 100%)"
  >
    <div class="mx-auto max-w-5xl">
      <header class="mb-8">
        <h1 class="text-lg font-semibold">Widget Lab <span class="text-white/40">— orbit hero + times</span></h1>
        <p class="mt-1 max-w-2xl text-sm text-white/55">
          Live orbit hero (gradient ring · prayer dots · now-marker · moon) with an always-visible
          daily times strip — every prayer stays glanceable without hover/tap, which a home-screen
          widget can't do. Reference only; the real widgets render from device data.
        </p>
      </header>

      <OrbitHeroHybridWidget :d="SAMPLE" />
    </div>
  </div>
</template>
