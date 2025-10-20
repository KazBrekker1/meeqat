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
          size="xs"
          variant="ghost"
          color="warning"
          @click="testPlayAthan"
          icon="heroicons:speaker-wave-20-solid"
        />
        <UButton
          size="xs"
          variant="ghost"
          color="warning"
          @click="onTestNotificationClick"
          icon="heroicons:bell-20-solid"
        />
      </template>
      <USeparator orientation="vertical" class="h-4" />
      <span class="whitespace-nowrap"
        >{{ nextPrayerLabel }} in {{ countdownToNext }}</span
      >
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        @click="$emit('toggle-calendar')"
      >
        {{ isCalendarShown ? "Hide Calendar" : "Show Calendar" }}
      </UButton>
      <UButton
        v-if="isAthanActive"
        size="xs"
        variant="ghost"
        color="error"
        @click="dismissAthan"
        icon="heroicons:x-mark-20-solid"
      >
        Dismiss
      </UButton>
    </div>
    <div class="flex items-center gap-2">
      <span
        class="text-sm text-gray-500"
        v-if="selectedCity || selectedCountry"
      >
        <span class="sm:hidden">Loc:</span>
        <span class="hidden sm:inline">Location:</span>
        {{ selectedCity || "—" }}, {{ selectedCountryName || selectedCountry }}
      </span>
    </div>
  </div>
</template>

<script lang="ts" setup>
defineProps<{
  nextPrayerLabel?: string;
  countdownToNext?: string;
  isLoading: boolean;
  selectedCity?: string;
  selectedCountry?: string;
  selectedCountryName?: string;
  timeFormat: "24h" | "12h";
  isCalendarShown?: boolean;
}>();

const { testPlayAthan, isAthanActive, dismissAthan } = usePrayerTimes();
const { send } = useNotifications();
const onTestNotificationClick = () => send("Meeqat", "Prayer time is here");

const isDev = process.env.NODE_ENV === "development";

defineEmits<{
  (e: "clear-cache"): void;
  (e: "toggle-time-format"): void;
  (e: "toggle-calendar"): void;
}>();
</script>

<style scoped></style>
