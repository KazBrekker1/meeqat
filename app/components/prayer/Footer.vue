<template>
  <div class="flex items-center justify-between">
    <!-- Previous Prayer Info -->
    <div
      v-if="previousPrayerLabel && timeSincePrevious"
      class="flex items-center gap-2 text-sm"
    >
      <span class="text-muted">Since {{ previousPrayerLabel }}:</span>
      <span class="font-medium tabular-nums">{{ timeSincePrevious }}</span>
    </div>
    <div v-else class="text-sm text-muted">--</div>

    <!-- Right Side: Athan Dismiss or Settings Icon -->
    <div class="flex items-center gap-2">
      <!-- Athan Dismiss (always visible if active) -->
      <UButton
        v-if="isAthanActive && dismissAthan"
        size="sm"
        variant="soft"
        color="error"
        @click="dismissAthan"
        icon="heroicons:x-mark-20-solid"
      >
        Dismiss
      </UButton>

      <!-- Settings Icon -->
      <UButton
        size="sm"
        variant="ghost"
        color="neutral"
        icon="heroicons:cog-6-tooth-20-solid"
        @click="$emit('open-settings')"
        aria-label="Open settings"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
defineProps<{
  previousPrayerLabel?: string;
  timeSincePrevious?: string;
  isAthanActive?: boolean;
  dismissAthan?: () => void;
}>();

defineEmits<{
  (e: "open-settings"): void;
}>();
</script>

<style scoped></style>
