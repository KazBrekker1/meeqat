<template>
  <div class="flex items-center justify-between gap-3">
    <h1 class="text-lg sm:text-xl font-semibold tracking-tight text-[var(--ui-text)]">
      Prayer Times
    </h1>
    <!-- Next Prayer Countdown -->
    <div
      v-if="nextPrayerLabel && countdownToNext"
      class="flex items-center gap-1.5 text-sm tabular-nums"
    >
      <span class="text-[var(--ui-text-muted)]">{{ nextPrayerLabel }}</span>
      <span class="font-mono font-semibold text-[var(--ui-primary)]">{{ countdownToNext }}</span>
    </div>
    <!-- Fallback: Current Time -->
    <div
      v-else
      class="flex items-center gap-1.5 text-sm tabular-nums text-[var(--ui-text-muted)]"
    >
      <UIcon name="heroicons:clock-20-solid" class="size-4" />
      <span class="font-mono">{{ currentTimeString }}</span>
    </div>
  </div>
</template>

<script lang="ts" setup>
defineProps<{
  currentTimeString: string;
  nextPrayerLabel?: string;
  countdownToNext?: string;
}>();
</script>

<style scoped></style>
