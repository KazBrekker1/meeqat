<template>
  <div class="celestial-sky relative overflow-hidden text-white" :class="rounded">
    <!-- Night gradient -->
    <div class="absolute inset-0" :style="{ background: gradient }" />
    <div class="absolute inset-0 opacity-60" style="background: radial-gradient(70% 45% at 70% 18%, rgba(120,130,220,0.22), transparent 70%);" />

    <!-- Stars, masked toward the top so they sit behind hero content, not text -->
    <div
      v-if="stars > 0"
      class="absolute inset-0 opacity-80"
      :style="maskStyle"
    >
      <PrototypesCelestialStarField :count="stars" :seed="seed" :shooting-star="shooting" />
    </div>

    <!-- Aurora horizon -->
    <div
      v-if="aurora"
      class="absolute inset-x-0 bottom-0 h-48"
      style="background: radial-gradient(120% 100% at 30% 120%, rgba(56,189,248,0.28), transparent 65%), radial-gradient(120% 100% at 80% 120%, rgba(168,85,247,0.30), transparent 65%);"
    />

    <!-- Scrim to guarantee text contrast -->
    <div v-if="scrim === 'top'" class="absolute inset-x-0 top-[40%] bottom-0" style="background: linear-gradient(180deg, transparent 0%, #0a0e22 26%, #0a0e22 72%, transparent 100%);" />
    <div v-else-if="scrim === 'full'" class="absolute inset-0" style="background: linear-gradient(180deg, rgba(8,11,28,0.86), rgba(8,11,28,0.96));" />

    <!-- Content -->
    <div class="relative h-full">
      <slot />
    </div>
  </div>
</template>

<script lang="ts" setup>
withDefaults(
  defineProps<{
    stars?: number;
    seed?: number;
    shooting?: boolean;
    aurora?: boolean;
    scrim?: "top" | "full" | "none";
    rounded?: string;
    gradient?: string;
  }>(),
  {
    stars: 60,
    seed: 11,
    shooting: true,
    aurora: true,
    scrim: "top",
    rounded: "",
    gradient: "linear-gradient(180deg,#060919 0%,#0d1330 42%,#181a44 100%)",
  }
);

const maskStyle =
  "-webkit-mask-image: linear-gradient(to bottom, black 0%, black 30%, transparent 48%); mask-image: linear-gradient(to bottom, black 0%, black 30%, transparent 48%);";
</script>
