<template>
  <div class="space-y-3">
    <!-- Search starts empty (it used to hold "Doha, Qatar", so typing appended to it). -->
    <UInput
      v-model="query"
      dir="auto"
      icon="i-lucide-search"
      placeholder="Search any city · ابحث عن مدينة"
      size="lg"
      class="w-full"
      :loading="isSearching"
      autofocus
      @keydown.enter.prevent="pickFirst"
    >
      <template v-if="query" #trailing>
        <UButton color="neutral" variant="link" size="sm" icon="i-lucide-x" aria-label="Clear search" @click="clearQuery" />
      </template>
    </UInput>

    <!-- Use my location -->
    <button
      type="button"
      class="flex w-full items-center gap-3 rounded-xl border border-default bg-elevated/60 px-3 py-2.5 text-start hover:bg-elevated cursor-pointer disabled:cursor-wait"
      :disabled="isLocating"
      @click="useMyLocation"
    >
      <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-amber-300/15 text-amber-300">
        <UIcon :name="isLocating ? 'i-lucide-loader-circle' : 'i-lucide-locate-fixed'" class="size-4" :class="isLocating && 'animate-spin'" />
      </span>
      <span class="min-w-0 flex-1">
        <span class="block text-sm font-medium">{{ isLocating ? 'Finding you…' : 'Use my location' }}</span>
        <span class="block truncate text-xs" :class="geoError ? 'text-error' : 'text-muted'">
          {{ geoError || 'Times follow you when you travel' }}
        </span>
      </span>
    </button>

    <!-- Favourites -->
    <div v-if="favorites.length && !query" class="flex flex-wrap gap-2">
      <UButton
        v-for="fav in favorites"
        :key="fav.id"
        :variant="isCurrentLocation(fav) ? 'solid' : 'soft'"
        :color="isCurrentLocation(fav) ? 'primary' : 'neutral'"
        size="sm"
        class="group"
        @click="$emit('select', fav.city, fav.countryCode)"
      >
        <template #leading><span class="text-base leading-none">{{ getFlagByCode(fav.countryCode) }}</span></template>
        <span dir="auto">{{ fav.label || fav.city }}</span>
        <template #trailing>
          <UIcon
            name="i-lucide-x"
            class="size-3 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-400"
            @click.stop="$emit('remove-favorite', fav.id)"
          />
        </template>
      </UButton>
      <UButton v-if="canAddFavorite" variant="ghost" color="neutral" size="sm" icon="i-lucide-plus" @click="$emit('add-favorite')">
        Save {{ currentCity }}
      </UButton>
    </div>

    <!-- Results -->
    <div class="max-h-72 overflow-y-auto rounded-xl border border-default divide-y divide-default">
      <PrayerPlaceRow v-for="p in local" :key="p.id" :place="p" :active="isCurrentPlace(p)" @pick="pick(p)" />

      <template v-if="query.trim().length >= 2">
        <p class="bg-elevated/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">More places</p>
        <PrayerPlaceRow v-for="p in more" :key="p.id" :place="p" @pick="pick(p)" />
        <p v-if="!isSearching && !more.length" class="px-3 py-3 text-xs text-muted">
          {{ remoteFailed ? "Couldn't search online. Check your connection, or pick the spot on the map." : 'No other places match.' }}
        </p>
      </template>

      <p v-if="!local.length && query.trim().length < 2" class="px-3 py-4 text-center text-sm text-muted">Keep typing…</p>
    </div>

    <!-- Map (mounted only when opened, so MapLibre loads on demand) -->
    <UCollapsible v-model:open="showMap">
      <UButton variant="ghost" color="neutral" size="sm" icon="i-lucide-map" :trailing-icon="showMap ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" block>
        Pick on the map
      </UButton>
      <template #content>
        <PrayerLocationMapPicker
          class="mt-2"
          :lat="currentLat"
          :lng="currentLng"
          :show-locate="false"
          @update:location="(c) => c && $emit('select-place', { ...c })"
        />
      </template>
    </UCollapsible>
  </div>
</template>

<script lang="ts" setup>
import { getFlagByCode } from "@/constants/countries";
import type { FavoriteLocation } from "@/composables/useFavoriteLocations";
import type { PlaceResult } from "@/composables/usePlaceSearch";

const props = defineProps<{
  favorites: FavoriteLocation[];
  currentCity?: string;
  currentCountryCode?: string;
  /** Coordinates of the active location (city or picked point), to centre the map. */
  currentLat?: number | null;
  currentLng?: number | null;
  maxFavorites: number;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: "select", city: string, countryCode: string): void;
  (e: "select-place", place: { lat: number; lng: number; label?: string }): void;
  (e: "add-favorite"): void;
  (e: "remove-favorite", id: string): void;
}>();

const { query, local, more, isSearching, remoteFailed } = usePlaceSearch();
const { getCurrentPosition, isLocating, error: geoError } = useGeolocation();
const showMap = ref(false);

function clearQuery() {
  query.value = "";
}

function pick(p: PlaceResult) {
  if (p.countryCode) emit("select", p.name, p.countryCode);
  else emit("select-place", { lat: p.lat, lng: p.lng, label: p.detail ? `${p.name}, ${p.detail.split(", ").pop()}` : p.name });
}

function pickFirst() {
  const first = local.value[0] ?? more.value[0];
  if (first) pick(first);
}

async function useMyLocation() {
  const pos = await getCurrentPosition();
  if (pos) emit("select-place", pos);
}

function isCurrentPlace(p: PlaceResult): boolean {
  return p.countryCode === props.currentCountryCode && p.name.toLowerCase() === props.currentCity?.toLowerCase();
}

function isCurrentLocation(fav: FavoriteLocation): boolean {
  return fav.city.toLowerCase() === props.currentCity?.toLowerCase() && fav.countryCode === props.currentCountryCode;
}

const canAddFavorite = computed(() => {
  if (!props.currentCity || !props.currentCountryCode) return false;
  if (props.favorites.length >= props.maxFavorites) return false;
  return !props.favorites.some((f) => isCurrentLocation(f));
});
</script>
