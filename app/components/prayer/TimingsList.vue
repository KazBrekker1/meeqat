<template>
  <div v-if="timingsList.length" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
    <UAlert
      v-for="t in timingsList"
      :key="t.key"
      class="flex items-center justify-between p-3 rounded"
      :variant="t.isPast ? 'outline' : 'subtle'"
      :color="t.isNext ? 'primary' : 'neutral'"
    >
      <template #description>
        <div
          class="grid items-center grid-cols-2 sm:grid-cols-3 gap-2 tabular-nums"
        >
          <span class="font-medium">{{ t.label }}</span>
          <span>{{ t.time }}</span>
          <span v-if="t.altTime" class="text-xs text-gray-500">
            {{ t.altTime }}
          </span>
        </div>
      </template>
    </UAlert>
  </div>
</template>

<script lang="ts" setup>
import type { PrayerTimingItem } from "@/utils/types";

defineProps<{
  timingsList: PrayerTimingItem[];
}>();
</script>

<style scoped></style>
