<template>
  <div class="space-y-2">
    <UButton
      v-if="showLocate"
      block
      size="md"
      color="primary"
      icon="lucide:locate-fixed"
      :loading="isLocating"
      :label="isLocating ? 'Finding you…' : 'Use my location'"
      @click="onUseMyLocation"
    />
    <div class="relative h-56 overflow-hidden rounded-xl border border-default bg-[#0e0e10]">
      <ClientOnly>
        <MapView :center="center" :zoom="zoom" @click="onMapClick" @load="onLoad">
          <MapMarker v-if="lat != null && lng != null" :coordinates="[lng, lat]" />
          <MapControls position="bottom-right" />
        </MapView>
        <template #fallback>
          <div class="grid h-full place-items-center text-xs text-muted">Loading map…</div>
        </template>
      </ClientOnly>
      <p
        v-if="lat == null || lng == null"
        class="pointer-events-none absolute inset-x-0 top-2 mx-auto w-fit rounded-full bg-black/60 px-3 py-1 text-xs text-white/80"
      >
        {{ showLocate ? 'Or tap the map to pick a spot' : 'Tap the map to set your location' }}
      </p>
    </div>

    <p v-if="geoError" class="text-xs text-error">{{ geoError }}</p>
    <p v-else-if="lat != null && lng != null" class="text-xs text-muted tabular-nums">
      {{ Math.abs(lat).toFixed(4) }}°{{ lat >= 0 ? 'N' : 'S' }}, {{ Math.abs(lng).toFixed(4) }}°{{ lng >= 0 ? 'E' : 'W' }}
    </p>
  </div>
</template>

<script lang="ts" setup>
import type { Map as MaplibreMap, MapMouseEvent } from "maplibre-gl";

const props = withDefaults(
  defineProps<{
    lat?: number | null;
    lng?: number | null;
    /** Overlay a "Use my location" button (off when the host already has one). */
    showLocate?: boolean;
  }>(),
  { showLocate: true }
);

const emit = defineEmits<{
  (e: "update:location", value: { lat: number; lng: number } | null): void;
}>();

let map: MaplibreMap | null = null;
const { getCurrentPosition, isLocating, error: geoError } = useGeolocation();

async function onUseMyLocation() {
  const pos = await getCurrentPosition();
  if (pos) emit("update:location", { lat: pos.lat, lng: pos.lng });
}

// MapLibre takes [lng, lat]. Start on the chosen point, else over the Middle East.
const center = computed<[number, number]>(() =>
  props.lat != null && props.lng != null ? [props.lng, props.lat] : [45, 25]
);
const zoom = computed(() => (props.lat != null ? 9 : 2));

function onLoad(m: MaplibreMap) {
  map = m;
}

// Follow outside changes (search result, "Use my location") without re-creating the map.
watch(
  () => [props.lat, props.lng] as const,
  ([lat, lng]) => {
    if (map && lat != null && lng != null) map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 9) });
  }
);

function onMapClick(e: MapMouseEvent) {
  emit("update:location", { lat: e.lngLat.lat, lng: e.lngLat.lng });
}
</script>
