<template>
  <div class="space-y-3">
    <!-- Quick Access Favorites -->
    <div v-if="favorites.length > 0" class="flex flex-wrap gap-2">
      <TransitionGroup
        enter-active-class="transition-all duration-200 ease-out"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition-all duration-150 ease-in"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-95"
      >
        <UButton
          v-for="fav in displayedFavorites"
          :key="fav.id"
          :variant="isCurrentLocation(fav) ? 'solid' : 'soft'"
          :color="isCurrentLocation(fav) ? 'primary' : 'neutral'"
          size="sm"
          class="group transition-all duration-200"
          @click="selectFavorite(fav)"
        >
          <template #leading>
            <span class="text-base leading-none">{{ getFlagByCode(fav.countryCode) }}</span>
          </template>
          {{ fav.label || fav.city }}
          <template #trailing>
            <UIcon
              name="i-lucide-x"
              class="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:text-red-500"
              @click.stop="$emit('remove-favorite', fav.id)"
            />
          </template>
        </UButton>
      </TransitionGroup>

      <UButton
        v-if="favorites.length > 3"
        variant="ghost"
        size="xs"
        @click="showAllFavorites = !showAllFavorites"
      >
        {{ showAllFavorites ? 'Less' : `+${favorites.length - 3}` }}
      </UButton>
    </div>

    <!-- Unified Location Search -->
    <UInputMenu
      v-model="selectedLocationItem"
      v-model:query="searchQuery"
      :items="groupedLocationItems"
      by="id"
      placeholder="Search any city..."
      icon="i-lucide-search"
      :loading="loading"
      class="w-full"
      :ui="{
        content: 'max-h-72',
        group: 'p-1',
        label: 'px-2 py-1.5 text-xs font-semibold text-[var(--ui-text-muted)] uppercase tracking-wider',
        itemLeadingIcon: 'text-base',
      }"
      @update:model-value="onLocationSelected"
    >
      <template #leading>
        <span v-if="selectedFlag" class="text-lg leading-none">{{ selectedFlag }}</span>
        <UIcon v-else name="i-lucide-map-pin" class="text-[var(--ui-text-muted)]" />
      </template>

      <template #item="{ item }">
        <div class="flex items-center gap-3 w-full py-0.5">
          <span class="text-lg leading-none shrink-0">{{ item.flag }}</span>
          <div class="flex-1 min-w-0">
            <div class="font-medium truncate">{{ item.city }}</div>
            <div class="text-xs text-[var(--ui-text-muted)] truncate">{{ item.country }}</div>
          </div>
          <UBadge
            variant="subtle"
            color="neutral"
            size="xs"
            class="shrink-0 font-mono"
          >
            {{ item.tzShort }}
          </UBadge>
        </div>
      </template>

      <template #empty>
        <div class="px-3 py-6 text-center text-[var(--ui-text-muted)]">
          <UIcon name="i-lucide-map-pin-off" class="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p class="text-sm">No cities found</p>
          <p class="text-xs mt-1">Try a different search term</p>
        </div>
      </template>
    </UInputMenu>

    <!-- Add to Favorites (when current location not saved) -->
    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <UButton
        v-if="canAddFavorite"
        variant="ghost"
        size="xs"
        class="w-full"
        @click="$emit('add-favorite')"
      >
        <template #leading>
          <UIcon name="i-lucide-heart" class="w-3.5 h-3.5" />
        </template>
        Save {{ currentCity }} to favorites
      </UButton>
    </Transition>
  </div>
</template>

<script lang="ts" setup>
import { COUNTRY_OPTIONS, getFlagByCode, REGION_LABELS, type CountryOption } from '@/constants/countries';
import { COUNTRY_TO_CITIES_DATA, getCityTimezone } from '@/constants/cities';
import type { FavoriteLocation } from '@/composables/useFavoriteLocations';

interface LocationItem {
  id: string;
  city: string;
  country: string;
  countryCode: string;
  flag: string;
  timezone: string;
  tzShort: string;
  region: CountryOption['region'];
  label: string; // For InputMenu display
}

const props = defineProps<{
  favorites: FavoriteLocation[];
  currentCity?: string;
  currentCountryCode?: string;
  maxFavorites: number;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'select', city: string, countryCode: string): void;
  (e: 'add-favorite'): void;
  (e: 'remove-favorite', id: string): void;
}>();

const searchQuery = ref('');
const showAllFavorites = ref(false);
const selectedLocationItem = ref<LocationItem | null>(null);

// Format timezone to short display (e.g., "GMT+3")
function formatTimezoneShort(timezone: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    });
    const parts = formatter.formatToParts(now);
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    return tzPart?.value ?? timezone.split('/').pop() ?? '';
  } catch {
    return timezone.split('/').pop() ?? '';
  }
}

// Build flat list of all locations
const allLocations = computed<LocationItem[]>(() => {
  const items: LocationItem[] = [];

  for (const country of COUNTRY_OPTIONS) {
    const cities = COUNTRY_TO_CITIES_DATA[country.code] ?? [];
    for (const cityData of cities) {
      const tz = cityData.timezone || country.timezone;
      items.push({
        id: `${country.code}-${cityData.name}`,
        city: cityData.name,
        country: country.name,
        countryCode: country.code,
        flag: country.flag,
        timezone: tz,
        tzShort: formatTimezoneShort(tz),
        region: country.region,
        label: `${cityData.name}, ${country.name}`,
      });
    }
  }

  return items;
});

// Group locations by region for the dropdown with label headers
const groupedLocationItems = computed(() => {
  // If searching, show flat filtered results
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase();
    const filtered = allLocations.value.filter(loc =>
      loc.city.toLowerCase().includes(query) ||
      loc.country.toLowerCase().includes(query) ||
      loc.countryCode.toLowerCase().includes(query)
    );
    return filtered;
  }

  // Build flat list with region labels
  const regionOrder: CountryOption['region'][] = ['gulf', 'levant', 'maghreb', 'europe', 'americas', 'asia'];
  const items: (LocationItem | { type: 'label' | 'separator'; label?: string })[] = [];

  for (const region of regionOrder) {
    const regionLocations = allLocations.value.filter(loc => loc.region === region);
    if (regionLocations.length > 0) {
      // Add separator before each group (except first)
      if (items.length > 0) {
        items.push({ type: 'separator' });
      }
      // Add region label
      items.push({ type: 'label', label: REGION_LABELS[region] });
      // Add all locations for this region
      items.push(...regionLocations);
    }
  }

  return items;
});

// Current selected flag
const selectedFlag = computed(() => {
  if (props.currentCountryCode) {
    return getFlagByCode(props.currentCountryCode);
  }
  return null;
});

// Displayed favorites (limited to 3 unless expanded)
const displayedFavorites = computed(() => {
  if (showAllFavorites.value || props.favorites.length <= 3) {
    return props.favorites;
  }
  return props.favorites.slice(0, 3);
});

// Check if location is current
function isCurrentLocation(fav: FavoriteLocation): boolean {
  return (
    fav.city.toLowerCase() === props.currentCity?.toLowerCase() &&
    fav.countryCode === props.currentCountryCode
  );
}

// Can add current location to favorites
const canAddFavorite = computed(() => {
  if (!props.currentCity || !props.currentCountryCode) return false;
  if (props.favorites.length >= props.maxFavorites) return false;

  return !props.favorites.some(
    f => f.city.toLowerCase() === props.currentCity?.toLowerCase() &&
         f.countryCode === props.currentCountryCode
  );
});

// Handle location selection from InputMenu
function onLocationSelected(item: LocationItem | null) {
  if (item) {
    emit('select', item.city, item.countryCode);
    // Clear search after selection
    searchQuery.value = '';
  }
}

// Handle favorite selection
function selectFavorite(fav: FavoriteLocation) {
  emit('select', fav.city, fav.countryCode);
}

// Sync selected item when current city/country changes
watch(
  [() => props.currentCity, () => props.currentCountryCode],
  ([city, countryCode]) => {
    if (city && countryCode) {
      const found = allLocations.value.find(
        loc => loc.city.toLowerCase() === city.toLowerCase() &&
               loc.countryCode === countryCode
      );
      selectedLocationItem.value = found ?? null;
    } else {
      selectedLocationItem.value = null;
    }
  },
  { immediate: true }
);

</script>
