<script setup lang="ts">
// mapcn-vue's <Map> (https://mapcn-vue.geoql.in), adapted: Meeqat is dark-only, so
// it always uses CARTO Dark Matter. MapLibre ≥ 6.9 shapes and orders Arabic/Hebrew
// labels natively — no setRTLTextPlugin (the source of reversed Arabic before).
import { VMap } from "@geoql/v-maplibre";
import { setWorkerUrl, type Map as MaplibreMap, type MapMouseEvent, type MapOptions } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";

// MapLibre 6 loads its tile worker from a separate file. v-maplibre points it next to
// its own module, which Vite's dependency pre-bundling moves (-> "Worker failed to
// load", black map). Register a Vite-bundled worker first; v-maplibre keeps ours.
setWorkerUrl(workerUrl);

const props = withDefaults(
  defineProps<{
    center?: [number, number]; // [lng, lat]
    zoom?: number;
    options?: Partial<MapOptions>;
  }>(),
  { center: () => [45, 25], zoom: 2 }
);

const emit = defineEmits<{
  load: [map: MaplibreMap];
  click: [e: MapMouseEvent];
}>();

// VMap renders <div :id="options.container"> and mounts MapLibre on that id,
// so every map needs its own container id.
const containerId = `meeqat-map-${useId()}`;

const mapOptions = computed(
  () =>
    ({
      container: containerId,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: props.center,
      zoom: props.zoom,
      attributionControl: { compact: true },
      ...props.options,
    }) as MapOptions
);
</script>

<template>
  <VMap
    :options="mapOptions"
    class="h-full w-full"
    @loaded="(map: MaplibreMap) => emit('load', map)"
    @click="(e: MapMouseEvent) => emit('click', e)"
  >
    <slot />
  </VMap>
</template>

<style>
/* Dark controls to match Meeqat (MapLibre's defaults are bright white). */
.maplibregl-ctrl-group {
  background: rgb(15 20 45 / 0.9);
  border: 1px solid rgb(255 255 255 / 0.1);
  box-shadow: none !important;
}
.maplibregl-ctrl-group button + button { border-top-color: rgb(255 255 255 / 0.1); }
.maplibregl-ctrl-group button .maplibregl-ctrl-icon { filter: invert(1) opacity(0.75); }
.maplibregl-ctrl-attrib.maplibregl-compact {
  background: rgb(15 20 45 / 0.85);
  color: rgb(255 255 255 / 0.6);
}
.maplibregl-ctrl-attrib a { color: rgb(255 255 255 / 0.7); }
.maplibregl-ctrl-attrib-button { filter: invert(1); }
</style>
