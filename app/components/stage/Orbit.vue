<template>
  <OrbitBumps
    v-if="orbitPrayers.length"
    :key="size"
    :prayers="orbitPrayers"
    :time="nowHHMM"
    :now-seconds="nowSeconds"
    :moon-phase="moonPhase"
    :size="size"
    :lat="activeCoords?.lat ?? null"
    :lng="activeCoords?.lng ?? null"
  >
    <!-- Same disc size as the orbit's default flat moon (0.42 × 0.92 of the orbit). The real sky
         behind the page is pinned to this Moon, and tapping it opens explore mode (which flies a
         copy of this Moon to its sky size and back, so this one hides meanwhile). -->
    <div ref="moonEl" class="relative" :class="moonHidden && 'invisible'">
      <CelestialMoonSphere
        :phase="moonPhase"
        :lat="activeCoords?.lat ?? null"
        :lng="activeCoords?.lng ?? null"
        :size="Math.round(size * 0.6)"
        :disc="ORBIT_MOON_DISC"
      />
      <button v-if="canExplore" type="button" :class="EXPLORE_BUTTON" :style="EXPLORE_INSET" aria-label="Explore the sky" @click="openExplore" />
    </div>
  </OrbitBumps>
  <div v-else ref="moonEl" class="relative" :class="moonHidden && 'invisible'">
    <CelestialMoonSphere
      :phase="moonPhase"
      :lat="activeCoords?.lat ?? null"
      :lng="activeCoords?.lng ?? null"
      :size="170"
      :disc="ORBIT_MOON_DISC"
    />
    <button v-if="canExplore" type="button" :class="EXPLORE_BUTTON" :style="EXPLORE_INSET" aria-label="Explore the sky" @click="openExplore" />
  </div>
</template>

<script lang="ts" setup>
import { pad2 } from "@/utils/time";

/** The orbit of today's times around the Moon; just the Moon until times are loaded. */
const props = defineProps<{
  size: number;
  /** Seconds of the day, for the orbit's now-marker. */
  nowSeconds: number;
}>();

// The orbit's flat moon is 0.42 × 0.92 of the orbit; the sphere canvas is 0.6 of it (room for the glow).
const ORBIT_MOON_DISC = (0.42 * 0.92) / 0.6;
// The explore button covers the disc, not its glow.
const EXPLORE_INSET = { inset: `${((1 - ORBIT_MOON_DISC) / 2) * 100}%` };
const EXPLORE_BUTTON =
  "absolute rounded-full cursor-pointer pointer-events-auto bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300";

const { timingsList, activeCoords, nowHHMM, moonPhase } = usePrayerRuntime();
const route = useRoute();
const { available, moonHidden } = useSkyExplore();

// Prayers plotted on the orbit (24h times, lowercase keys for the sky gradient).
const ORBIT_KEYS = ["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"];
const orbitPrayers = computed(() =>
  ORBIT_KEYS.flatMap((k) => {
    const t = timingsList.value.find((x) => x.key === k);
    if (!t || typeof t.minutes !== "number") return [];
    const min = t.minutes;
    return [{
      key: k.toLowerCase(),
      time: `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`,
      isNext: !!t.isNext,
      isPast: !!t.isPast,
    }];
  })
);

// The real sky behind the page is pinned to this Moon and scaled to its disc (radius in CSS px).
const moonEl = ref<HTMLElement | null>(null);
const moonRadius = computed(() => ((orbitPrayers.value.length ? Math.round(props.size * 0.6) : 170) * ORBIT_MOON_DISC) / 2);
watch(
  [moonEl, moonRadius],
  ([el, r], prev) => {
    if (prev?.[0] && prev[0] !== el) clearSkyAnchor(prev[0]);
    setSkyAnchor(el, r);
  },
  { immediate: true, flush: "post" },
);
onBeforeUnmount(() => clearSkyAnchor(moonEl.value));

const canExplore = computed(() => available.value && !!activeCoords.value);
function openExplore() {
  void navigateTo({ query: { ...route.query, sky: "1" } });
}
</script>
