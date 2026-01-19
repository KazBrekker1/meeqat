<template>
  <!-- Skeleton Loading State -->
  <PrayerSkeleton v-if="loading" :count="6" />

  <!-- Prayer Cards Grid -->
  <div v-else-if="timingsList.length" class="grid grid-cols-2 sm:grid-cols-3 gap-3">
    <TransitionGroup
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-1"
    >
      <PrayerCard
        v-for="(t, index) in timingsList"
        :key="t.key"
        :label="t.label"
        :time="t.time"
        :alt-time="t.altTime"
        :is-past="t.isPast"
        :is-next="t.isNext"
        :style="{ transitionDelay: `${index * 30}ms` }"
      />
    </TransitionGroup>
  </div>

  <!-- Empty State -->
  <div v-else class="text-center py-8 text-muted">
    <p class="text-sm">Select a city to view prayer times</p>
  </div>
</template>

<script lang="ts" setup>
import type { PrayerTimingItem } from "@/utils/types";

defineProps<{
  timingsList: PrayerTimingItem[];
  loading?: boolean;
}>();
</script>

<style scoped></style>
