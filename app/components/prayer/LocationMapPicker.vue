<template>
  <div class="space-y-3">
    <!-- Actions -->
    <div class="flex items-center gap-2">
      <UButton
        size="xs"
        variant="soft"
        icon="lucide:locate"
        :loading="isLocating"
        @click="onUseMyLocation"
      >
        Use My Location
      </UButton>
      <UButton
        v-if="lat != null && lng != null"
        size="xs"
        variant="ghost"
        color="neutral"
        icon="lucide:x"
        @click="$emit('update:location', null)"
      >
        Clear
      </UButton>
    </div>

    <!-- Error message -->
    <p v-if="geoError" class="text-xs text-[var(--ui-color-error-500)]">
      {{ geoError }}
    </p>

    <!-- Map -->
    <ClientOnly>
      <div class="rounded-lg overflow-hidden border border-[var(--ui-border)]">
        <LMap
          ref="mapRef"
          :zoom="mapZoom"
          :center="mapCenter"
          style="height: 200px; z-index: 0;"
          :use-global-leaflet="false"
          @click="onMapClick"
        >
          <LTileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap"
            layer-type="base"
          />
          <LMarker
            v-if="lat != null && lng != null"
            :lat-lng="[lat, lng]"
            draggable
            @moveend="onMarkerMove"
          />
        </LMap>
      </div>
    </ClientOnly>

    <!-- Coordinates display -->
    <p v-if="lat != null && lng != null" class="text-xs text-muted tabular-nums">
      {{ Math.abs(lat).toFixed(4) }}{{ lat >= 0 ? 'N' : 'S' }}, {{ Math.abs(lng).toFixed(4) }}{{ lng >= 0 ? 'E' : 'W' }}
    </p>
    <p v-else class="text-xs text-muted">
      Use GPS or click the map to set your location
    </p>
  </div>
</template>

<script lang="ts" setup>
import "leaflet/dist/leaflet.css";
import { LMap, LTileLayer, LMarker } from "@vue-leaflet/vue-leaflet";

const props = defineProps<{
  lat?: number | null;
  lng?: number | null;
}>();

const emit = defineEmits<{
  (e: 'update:location', value: { lat: number; lng: number } | null): void;
}>();

const { getCurrentPosition, isLocating, error: geoError } = useGeolocation();

const mapZoom = computed(() => (props.lat != null ? 13 : 2));
const mapCenter = computed<[number, number]>(() =>
  props.lat != null && props.lng != null
    ? [props.lat, props.lng]
    : [25, 45]
);

async function onUseMyLocation() {
  const pos = await getCurrentPosition();
  if (pos) {
    emit('update:location', pos);
  }
}

function onMapClick(e: { latlng: { lat: number; lng: number } }) {
  emit('update:location', { lat: e.latlng.lat, lng: e.latlng.lng });
}

function onMarkerMove(e: { target: { getLatLng: () => { lat: number; lng: number } } }) {
  const latlng = e.target.getLatLng();
  emit('update:location', { lat: latlng.lat, lng: latlng.lng });
}
</script>
