<script setup lang="ts">
import type { PlaceResult } from "@/composables/usePlaceSearch";

defineProps<{ place: PlaceResult; active?: boolean }>();
defineEmits<{ pick: [] }>();
</script>

<template>
  <button
    type="button"
    class="flex w-full items-center gap-3 px-3 py-2 text-start hover:bg-elevated cursor-pointer"
    :class="active && 'bg-amber-300/10'"
    @click="$emit('pick')"
  >
    <span class="text-lg leading-none shrink-0">{{ place.flag }}</span>
    <span class="min-w-0 flex-1">
      <!-- dir="auto": Arabic names (from OSM) lay out right-to-left on their own line. -->
      <span dir="auto" class="block truncate text-sm font-medium" :class="active && 'text-amber-300'">{{ place.name }}</span>
      <span dir="auto" class="block truncate text-xs text-muted">{{ place.detail }}</span>
    </span>
    <UIcon v-if="active" name="i-lucide-check" class="size-4 shrink-0 text-amber-300" />
  </button>
</template>
