<script setup lang="ts">
// mapcn-vue's <MapMarker>, on @geoql/v-maplibre v3's VMarker (options-based API).
import { VMarker } from "@geoql/v-maplibre";
import type { LngLatLike } from "maplibre-gl";

const props = withDefaults(defineProps<{ coordinates: LngLatLike; color?: string }>(), {
  color: "#fcd34d", // the orbit's next-prayer amber
});
</script>

<template>
  <VMarker :coordinates="props.coordinates" :options="{ color: props.color, anchor: 'bottom' }" />
</template>
