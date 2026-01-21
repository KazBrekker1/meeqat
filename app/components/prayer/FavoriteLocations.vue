<template>
  <div v-if="favorites.length > 0" class="space-y-2">
    <div class="flex items-center justify-between">
      <p class="text-sm font-medium text-muted">Favorite Locations</p>
      <UButton
        v-if="favorites.length > 3"
        variant="ghost"
        size="xs"
        @click="showAll = !showAll"
      >
        {{ showAll ? 'Show less' : `+${favorites.length - 3} more` }}
      </UButton>
    </div>

    <div class="flex flex-wrap gap-2">
      <UButton
        v-for="fav in displayedFavorites"
        :key="fav.id"
        size="sm"
        :variant="isCurrentLocation(fav) ? 'solid' : 'soft'"
        :color="isCurrentLocation(fav) ? 'primary' : 'neutral'"
        class="group"
        @click="$emit('select', fav)"
      >
        <template #leading>
          <UIcon name="lucide:map-pin" class="w-3.5 h-3.5" />
        </template>
        {{ fav.label || fav.city }}
        <template #trailing>
          <UIcon
            name="lucide:x"
            class="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:text-error-500"
            @click.stop="$emit('remove', fav.id)"
          />
        </template>
      </UButton>
    </div>
  </div>

  <!-- Add to Favorites Button (when location is selected but not favorited) -->
  <UButton
    v-if="canAddFavorite"
    variant="ghost"
    size="xs"
    class="w-full mt-2"
    @click="$emit('add-current')"
  >
    <template #leading>
      <UIcon name="lucide:heart" class="w-3.5 h-3.5" />
    </template>
    Save {{ currentCity }} to favorites
  </UButton>
</template>

<script lang="ts" setup>
import type { FavoriteLocation } from '@/composables/useFavoriteLocations';

const props = defineProps<{
  favorites: FavoriteLocation[];
  currentCity?: string;
  currentCountryCode?: string;
  maxFavorites: number;
}>();

defineEmits<{
  (e: 'select', location: FavoriteLocation): void;
  (e: 'remove', id: string): void;
  (e: 'add-current'): void;
}>();

const showAll = ref(false);

const displayedFavorites = computed(() => {
  if (showAll || props.favorites.length <= 3) {
    return props.favorites;
  }
  return props.favorites.slice(0, 3);
});

const isCurrentLocation = (fav: FavoriteLocation): boolean => {
  return fav.city.toLowerCase() === props.currentCity?.toLowerCase() &&
         fav.countryCode === props.currentCountryCode;
};

const canAddFavorite = computed(() => {
  if (!props.currentCity || !props.currentCountryCode) return false;
  if (props.favorites.length >= props.maxFavorites) return false;

  // Check if already favorited
  const alreadyFavorited = props.favorites.some(
    f => f.city.toLowerCase() === props.currentCity?.toLowerCase() &&
         f.countryCode === props.currentCountryCode
  );

  return !alreadyFavorited;
});
</script>
