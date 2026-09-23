<script setup lang="ts">
// mapcn-vue's <MapControls>: zoom buttons only (location comes from the picker's own
// "Use my location", which works on desktop where the geolocate control can't).
import { VControlNavigation } from "@geoql/v-maplibre";

defineProps<{ position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" }>();
</script>

<template>
  <VControlNavigation :position="position ?? 'bottom-right'" :options="{ showCompass: false }" />
</template>
