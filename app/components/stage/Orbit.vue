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
    <!-- Same disc size as the orbit's default flat moon (0.42 × 0.92 of the orbit) -->
    <CelestialMoonSphere
      :phase="moonPhase"
      :lat="activeCoords?.lat ?? null"
      :lng="activeCoords?.lng ?? null"
      :size="Math.round(size * 0.6)"
      :disc="ORBIT_MOON_DISC"
    />
  </OrbitBumps>
  <CelestialMoonSphere
    v-else
    :phase="moonPhase"
    :lat="activeCoords?.lat ?? null"
    :lng="activeCoords?.lng ?? null"
    :size="170"
    :disc="ORBIT_MOON_DISC"
  />
</template>

<script lang="ts" setup>
import { pad2 } from "@/utils/time";

/** The orbit of today's times around the Moon; just the Moon until times are loaded. */
defineProps<{
  size: number;
  /** Seconds of the day, for the orbit's now-marker. */
  nowSeconds: number;
}>();

const { timingsList, activeCoords, nowHHMM, moonPhase } = usePrayerRuntime();

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

// The orbit's flat moon is 0.42 × 0.92 of the orbit; the sphere canvas is 0.6 of it (room for the glow).
const ORBIT_MOON_DISC = (0.42 * 0.92) / 0.6;
</script>
