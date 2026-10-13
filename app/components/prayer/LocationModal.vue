<template>
  <UModal
    v-model:open="open"
    :title="hasLocation ? 'Location' : 'Where do you pray?'"
    :description="hasLocation ? 'Search a city, use where you are, or pick a spot on the map' : 'Choose your city, or use where you are, to see prayer times. You can change it any time.'"
  >
    <template #body>
      <PrayerLocationSelector
        :favorites="favorites"
        :current-city="locationMode === 'gps' ? undefined : selectedCity"
        :current-country-code="locationMode === 'gps' ? undefined : selectedCountry"
        :current-lat="activeCoords?.lat ?? null"
        :current-lng="activeCoords?.lng ?? null"
        :max-favorites="MAX_FAVORITES"
        :loading="isLoading"
        @select="onSelect"
        @select-place="onSelectPlace"
        @add-favorite="onAddCurrentToFavorites"
        @remove-favorite="onRemoveFavorite"
      />
    </template>
  </UModal>
</template>

<script lang="ts" setup>
import { getCountryByCode } from "@/constants/countries";

/** The location dialog (opened from the header, and by itself on first run). */
const open = defineModel<boolean>("open", { default: false });

const {
  isLoading,
  selectedMethodId,
  selectedCity,
  selectedCountry,
  locationMode,
  hasLocation,
  activeCoords,
} = usePrayerRuntime();
const { selectCity, selectPlace } = useLocationActions();

// Favorite locations
const {
  favorites,
  addFavorite,
  removeFavorite,
  MAX_FAVORITES,
} = useFavoriteLocations();

function onSelect(city: string, countryCode: string) {
  locationMode.value = 'city';
  selectCity(city, countryCode);
  open.value = false;
}

function onSelectPlace(place: { lat: number; lng: number; label?: string }) {
  open.value = false;
  selectPlace(place);
}

const selectedCountryName = computed(() => {
  return getCountryByCode(selectedCountry.value)?.name ?? "";
});

async function onAddCurrentToFavorites() {
  if (!selectedCity.value || !selectedCountry.value) return;
  await addFavorite({
    city: selectedCity.value,
    country: selectedCountryName.value,
    countryCode: selectedCountry.value,
    methodId: selectedMethodId.value,
  });
}

async function onRemoveFavorite(id: string) {
  await removeFavorite(id);
}
</script>
