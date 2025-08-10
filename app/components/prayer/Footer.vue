<template>
  <div class="flex items-center justify-between">
    <div
      class="flex items-center gap-2 text-sm text-gray-500 tabular-nums"
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
      <ColorToggle />
      <UButton size="xs" variant="ghost" @click="$emit('toggle-time-format')">
        {{ timeFormat === "24h" ? "12h" : "24h" }}
      </UButton>
      <USeparator orientation="vertical" class="h-4" />
      <span>{{ nextPrayerLabel }} in {{ countdownToNext }}</span>
      <UButton
        v-if="isAthanActive"
        size="xs"
        variant="ghost"
        color="error"
        @click="$emit('dismiss-athan')"
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
        Location: {{ selectedCity || "—" }},
        {{ selectedCountryName || selectedCountry }}
      </span>
    </div>
  </div>
</template>

<script lang="ts" setup>
defineProps<{
  nextPrayerLabel?: string;
  countdownToNext?: string;
  isLoading: boolean;
  isAthanActive: boolean;
  selectedCity?: string;
  selectedCountry?: string;
  selectedCountryName?: string;
  timeFormat: "24h" | "12h";
}>();

defineEmits<{
  (e: "clear-cache"): void;
  (e: "toggle-time-format"): void;
  (e: "dismiss-athan"): void;
}>();
</script>

<style scoped></style>
