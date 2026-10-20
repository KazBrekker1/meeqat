<template>
  <div class="celestial-sky relative overflow-hidden text-white" :class="rounded">
    <!-- Night gradient -->
    <div class="absolute inset-0" :style="{ background: gradient }" />
    <div class="absolute inset-0 opacity-60" style="background: radial-gradient(70% 45% at 70% 18%, rgba(120,130,220,0.22), transparent 70%);" />

    <!-- Placeholder stars: no place yet, the real sky still loading, or its catalogue unavailable.
         Masked toward the top so they sit behind hero content, not text -->
    <div
      v-if="stars > 0 && showStarField"
      class="absolute inset-0 opacity-80"
      :style="maskStyle"
    >
      <CelestialStarField :count="stars" :seed="seed" />
    </div>

    <!-- The real sky around the Moon; fades in once drawn, and becomes explore mode's sky -->
    <CelestialRealSky
      v-if="hasPlace"
      :lat="lat!"
      :lng="lng!"
      :interactive="exploring"
      class="transition-opacity duration-500"
      :class="skyStatus === 'ready' ? 'opacity-100' : 'opacity-0'"
      @status="skyStatus = $event"
    />

    <!-- Aurora horizon (only with the placeholder stars) -->
    <div
      v-if="aurora && skyStatus !== 'ready'"
      class="absolute inset-x-0 bottom-0 h-48"
      style="background: radial-gradient(120% 100% at 30% 120%, rgba(56,189,248,0.28), transparent 65%), radial-gradient(120% 100% at 80% 120%, rgba(168,85,247,0.30), transparent 65%);"
    />

    <!-- Scrim to guarantee text contrast -->
    <div v-if="scrim === 'top'" class="sky-ui absolute inset-x-0 top-[40%] bottom-0" :class="exploring && 'exploring'" style="background: linear-gradient(180deg, transparent 0%, #0a0e22 26%, #0a0e22 72%, transparent 100%);" />
    <div v-else-if="scrim === 'full'" class="sky-ui absolute inset-0" :class="exploring && 'exploring'" style="background: linear-gradient(180deg, rgba(8,11,28,0.86), rgba(8,11,28,0.96));" />

    <!-- Content (faded out and hidden while exploring the sky) -->
    <div class="sky-ui relative h-full" :class="exploring && 'exploring'">
      <slot />
    </div>
  </div>
</template>

<script lang="ts" setup>
import type { SkyStatus } from "@/composables/useSkyExplore";

const props = withDefaults(
  defineProps<{
    stars?: number;
    seed?: number;
    aurora?: boolean;
    scrim?: "top" | "full" | "none";
    rounded?: string;
    gradient?: string;
    /** The place, for the real sky; null → placeholder stars. */
    lat?: number | null;
    lng?: number | null;
  }>(),
  {
    stars: 60,
    seed: 11,
    aurora: true,
    scrim: "top",
    rounded: "",
    gradient: "linear-gradient(180deg,#060919 0%,#0d1330 42%,#181a44 100%)",
    lat: null,
    lng: null,
  }
);

const explore = useSkyExplore();
const hasPlace = computed(() => props.lat != null && props.lng != null);
const skyStatus = ref<SkyStatus>("loading");
watch(hasPlace, (has) => {
  if (!has) skyStatus.value = "loading";
});
// The placeholder stand in until the real sky is drawn, and stays if its catalogue can't load
// (without WebGL neither can draw: the gradient alone shows).
const showStarField = computed(() => !hasPlace.value || skyStatus.value === "loading" || skyStatus.value === "catalog-failed");
const exploring = computed(() => hasPlace.value && explore.isOpen.value);

const maskStyle =
  "-webkit-mask-image: linear-gradient(to bottom, black 0%, black 30%, transparent 48%); mask-image: linear-gradient(to bottom, black 0%, black 30%, transparent 48%);";
</script>

<style scoped>
/* Explore mode fades the page away, then hides it so nothing above the sky keeps compositing. */
.sky-ui {
  transition: opacity 0.25s ease, visibility 0s linear 0s;
}
.sky-ui.exploring {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 0.25s ease, visibility 0s linear 0.25s;
}
</style>
