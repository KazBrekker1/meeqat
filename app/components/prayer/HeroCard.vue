<template>
  <div
    v-if="nextPrayerLabel"
    class="relative rounded-xl border border-[var(--ui-color-primary-500)]/20 bg-gradient-to-br from-[var(--ui-color-primary-500)]/10 via-[var(--ui-color-primary-500)]/5 to-transparent overflow-hidden"
  >
    <!-- Islamic pattern overlay -->
    <div class="absolute inset-0 pattern-islamic opacity-30 pointer-events-none" />

    <div class="relative px-4 py-3 space-y-1.5">
      <!-- Top row: label + dates -->
      <div class="flex items-start justify-between gap-2">
        <p class="text-xs uppercase tracking-wider text-muted font-medium">
          Next Prayer
        </p>
        <div v-if="hijriDate || gregorianDate" class="text-right shrink-0">
          <p v-if="hijriDate" class="text-[11px] font-medium text-muted leading-tight">{{ hijriDate }}</p>
          <p v-if="gregorianDate" class="text-[10px] text-dimmed leading-tight">{{ gregorianDate }}</p>
        </div>
      </div>

      <!-- Prayer name -->
      <h2 class="text-xl font-heading font-bold text-[var(--ui-color-primary-600)] dark:text-[var(--ui-color-primary-400)]">
        {{ nextPrayerLabel }}
      </h2>

      <!-- Countdown -->
      <p
        v-if="countdownToNext"
        class="text-2xl sm:text-3xl font-mono font-bold tabular-nums text-[var(--ui-text)]"
      >
        {{ countdownToNext }}
      </p>

      <!-- Time -->
      <p v-if="nextPrayerTime" class="text-xs text-muted">
        at {{ nextPrayerTime }}
      </p>

      <!-- Progress bar -->
      <UProgress :model-value="progressPercent" :max="100" size="xs" color="primary" />

      <!-- Since previous -->
      <div
        v-if="previousPrayerLabel && timeSincePrevious"
        class="flex items-center gap-1.5 text-xs text-muted"
      >
        <UIcon name="lucide:clock" class="size-3.5" />
        <span>Since {{ previousPrayerLabel }}: {{ timeSincePrevious }}</span>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
defineProps<{
  nextPrayerLabel?: string;
  nextPrayerTime?: string;
  countdownToNext?: string;
  progressPercent: number;
  previousPrayerLabel?: string;
  timeSincePrevious?: string;
  hijriDate?: string;
  gregorianDate?: string;
}>();
</script>
