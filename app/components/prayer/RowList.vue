<template>
  <!-- Skeleton Loading State -->
  <PrayerSkeleton v-if="loading" :count="6" />

  <!-- Prayer Rows -->
  <div
    v-else-if="timingsList.length"
    class="rounded-xl border border-[var(--ui-border)] bg-[var(--ui-bg-elevated)] overflow-hidden divide-y divide-[var(--ui-border)]"
  >
    <PrayerRow
      v-for="t in timingsList"
      :key="t.key"
      :label="t.label"
      :time="t.time"
      :alt-time="t.altTime"
      :is-past="t.isPast"
      :is-next="t.isNext"
      :description="t.description"
    />
  </div>

  <!-- Empty State -->
  <div v-else class="text-center py-8 text-muted">
    <UIcon name="lucide:map-pin" class="size-8 mx-auto mb-2 text-dimmed" />
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
