<template>
  <div class="flex flex-col items-center gap-5 py-2">
    <!-- No location yet -->
    <div v-if="bearing === null" class="text-center py-10 text-muted">
      <UIcon name="lucide:compass" class="size-10 mx-auto mb-3 text-dimmed" />
      <p class="text-sm">Set your location to find the Qibla direction.</p>
    </div>

    <template v-else>
      <!-- Compass dial -->
      <div class="relative size-64 select-none">
        <!-- Fixed device pointer at the top -->
        <div
          class="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1 z-20 transition-colors"
          :class="aligned ? 'text-green-500' : 'text-primary'"
        >
          <div
            class="size-0 border-x-8 border-x-transparent border-t-[14px]"
            :style="{ borderTopColor: 'currentColor' }"
          />
        </div>

        <!-- Rotating dial: ticks + cardinal letters + Qibla marker -->
        <div
          class="absolute inset-0 rounded-full border border-default bg-elevated/60 shadow-inner"
          :style="{
            transform: `rotate(${dialRotation}deg)`,
            transition: 'transform 120ms linear',
          }"
        >
          <!-- cardinal letters, kept upright via counter-rotation -->
          <div
            v-for="c in cardinals"
            :key="c.label"
            class="absolute left-1/2 top-1/2 text-xs font-semibold"
            :class="c.label === 'N' ? 'text-red-500' : 'text-toned'"
            :style="cardinalStyle(c.angle)"
          >
            {{ c.label }}
          </div>

          <!-- Qibla (Kaaba) marker at the bearing, out on the rim -->
          <div
            class="absolute left-1/2 top-1/2 text-2xl leading-none drop-shadow"
            :style="markerStyle"
          >🕋</div>
        </div>

        <!-- Fixed center hub -->
        <div
          class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
        >
          <span class="text-3xl font-bold tabular-nums text-highlighted">
            {{ Math.round(bearing) }}°
          </span>
          <span class="text-xs uppercase tracking-wider text-muted">
            {{ cardinal }}
          </span>
        </div>
      </div>

      <!-- Status line -->
      <p
        v-if="aligned"
        class="flex items-center gap-1.5 text-sm font-medium text-green-500"
      >
        <UIcon name="lucide:check-circle-2" class="size-4" /> Facing the Qibla
      </p>
      <p v-else-if="live" class="text-sm text-muted">
        Turn until the 🕋 marker reaches the top pointer.
      </p>
      <p v-else-if="isSupported" class="text-sm text-muted text-center">
        Enable the compass, then hold your device flat and level.
      </p>
      <p v-else class="text-sm text-muted text-center">
        Compass unavailable here — face <b class="text-toned">{{ Math.round(bearing) }}° ({{ cardinal }})</b> from true north.
      </p>

      <!-- Distance -->
      <p class="text-xs text-dimmed">
        {{ distanceLabel }} to Makkah
      </p>

      <!-- Enable compass (needed for live mode / iOS permission) -->
      <UButton
        v-if="isSupported && !live"
        size="sm"
        color="primary"
        icon="lucide:compass"
        :loading="starting"
        @click="enableCompass"
      >
        Enable compass
      </UButton>
      <p v-if="headingError" class="text-xs text-error">{{ headingError }}</p>
    </template>
  </div>
</template>

<script lang="ts" setup>
import {
  qiblaBearing,
  distanceToKaabaKm,
  compassPoint,
  angularDistance,
} from "@/utils/qibla";

const props = defineProps<{
  lat: number | null;
  lng: number | null;
}>();

const {
  heading,
  active,
  error: headingError,
  isSupported,
  start,
} = useDeviceHeading();

const starting = ref(false);

const bearing = computed<number | null>(() =>
  props.lat != null && props.lng != null
    ? qiblaBearing(props.lat, props.lng)
    : null,
);

const cardinal = computed(() =>
  bearing.value === null ? "" : compassPoint(bearing.value),
);

const distanceLabel = computed(() => {
  if (props.lat == null || props.lng == null) return "";
  const km = distanceToKaabaKm(props.lat, props.lng);
  return km < 10
    ? `${km.toFixed(1)} km`
    : `${Math.round(km).toLocaleString()} km`;
});

// Live mode = we have a real compass reading. The dial then rotates so its North
// points to true north; in static mode the dial stays north-up.
const live = computed(() => active.value && heading.value != null);
const dialRotation = computed(() => (live.value ? -(heading.value ?? 0) : 0));

const aligned = computed(
  () =>
    live.value &&
    bearing.value !== null &&
    angularDistance(heading.value ?? 0, bearing.value) <= 5,
);

const cardinals = [
  { label: "N", angle: 0 },
  { label: "E", angle: 90 },
  { label: "S", angle: 180 },
  { label: "W", angle: 270 },
];

const radius = 104; // px from center to the cardinal letters

// Place a cardinal letter at `angle` on the dial and counter-rotate it (against
// both its own placement and the dial's rotation) so it always reads upright.
function cardinalStyle(angle: number) {
  return {
    transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-${radius}px) rotate(${-angle - dialRotation.value}deg)`,
  };
}

const markerRadius = 114; // px from center — out near the rim, just past the letters

// Place the Kaaba glyph at the Qibla bearing on the rim, kept upright via
// counter-rotation (against its own placement AND the dial's rotation), mirroring
// cardinalStyle so it tracks live compass rotation.
const markerStyle = computed(() => {
  const b = bearing.value ?? 0;
  return {
    transform: `translate(-50%, -50%) rotate(${b}deg) translateY(-${markerRadius}px) rotate(${-b - dialRotation.value}deg)`,
  };
});

async function enableCompass() {
  starting.value = true;
  try {
    await start();
  } finally {
    starting.value = false;
  }
}
</script>
