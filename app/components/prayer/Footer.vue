<template>
  <div
    class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
  >
    <div
      class="flex flex-wrap items-center gap-2 text-sm text-gray-500 tabular-nums"
      v-if="nextPrayerLabel && countdownToNext"
    >
      <UButton
        color="error"
        variant="soft"
        size="xs"
        :disabled="isLoading"
        @click="$emit('clear-cache')"
        icon="heroicons:trash-20-solid"
      >
        Clear Cache
      </UButton>
      <USeparator orientation="vertical" class="h-4" />
      <UColorModeButton size="xs" />
      <UButton size="xs" variant="ghost" @click="$emit('toggle-time-format')">
        {{ timeFormat === "24h" ? "12h" : "24h" }}
      </UButton>
      <template v-if="isDev">
        <UButton
          v-if="testPlayAthan"
          size="xs"
          variant="ghost"
          color="warning"
          @click="testPlayAthan"
          icon="heroicons:speaker-wave-20-solid"
        />
        <UButton
          v-if="onTestNotificationClick"
          size="xs"
          variant="ghost"
          color="warning"
          @click="onTestNotificationClick"
          icon="heroicons:bell-20-solid"
        />
      </template>
      <USeparator orientation="vertical" class="h-4" />
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        @click="$emit('toggle-calendar')"
      >
        {{ isCalendarShown ? "Hide Calendar" : "Show Calendar" }}
      </UButton>
      <UButton
        v-if="isAthanActive && dismissAthan"
        size="xs"
        variant="ghost"
        color="error"
        @click="dismissAthan"
        icon="heroicons:x-mark-20-solid"
      >
        Dismiss
      </UButton>
    </div>
    <div
      class="flex flex-wrap items-center gap-2 text-sm text-gray-500 tabular-nums"
    >
      <span class="whitespace-nowrap">
        {{ nextPrayerLabel }} in {{ countdownToNext }}
      </span>
      /
      <span
        v-if="previousPrayerLabel && timeSincePrevious"
        class="whitespace-nowrap"
      >
        {{ previousPrayerLabel }} since {{ timeSincePrevious }}
      </span>
    </div>
  </div>
</template>

<script lang="ts" setup>
defineProps<{
  nextPrayerLabel?: string;
  countdownToNext?: string;
  previousPrayerLabel?: string;
  timeSincePrevious?: string;
  isLoading: boolean;
  timeFormat: "24h" | "12h";
  isCalendarShown?: boolean;
  testPlayAthan?: () => void;
  isAthanActive?: boolean;
  dismissAthan?: () => void;
  onTestNotificationClick?: () => void;
}>();

const isDev = process.env.NODE_ENV === "development";

defineEmits<{
  (e: "clear-cache"): void;
  (e: "toggle-time-format"): void;
  (e: "toggle-calendar"): void;
}>();
</script>

<style scoped></style>
