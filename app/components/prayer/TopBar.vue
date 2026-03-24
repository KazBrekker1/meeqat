<template>
  <header
    class="sticky top-0 z-10 bg-[var(--ui-bg)]/80 backdrop-blur-md border-b border-[var(--ui-border)] pt-[max(env(safe-area-inset-top),8px)] pattern-islamic-subtle"
  >
    <div class="max-w-2xl mx-auto px-3 pb-2 pt-1 flex items-center justify-between">
      <!-- Left: Location -->
      <div class="flex items-center gap-1.5 min-w-0">
        <UIcon name="lucide:map-pin" class="size-4 text-muted shrink-0" />
        <span v-if="currentCity" class="text-sm font-medium truncate">
          {{ currentCity }}
        </span>
        <span v-if="currentCountryName" class="text-xs text-muted truncate">
          {{ currentCountryName }}
        </span>
        <span v-if="!currentCity" class="text-sm text-muted">No location</span>
      </div>

      <!-- Right: Time + Actions -->
      <div class="flex items-center gap-2 shrink-0">
        <span class="text-sm font-mono tabular-nums text-muted">
          {{ currentTimeString }}
        </span>

        <!-- Settings -->
        <UButton
          size="xs"
          variant="ghost"
          color="neutral"
          icon="heroicons:cog-6-tooth-20-solid"
          @click="$emit('open-settings')"
          aria-label="Open settings"
        />
      </div>
    </div>
  </header>
</template>

<script lang="ts" setup>
defineProps<{
  currentCity?: string;
  currentCountryName?: string;
  currentTimeString: string;
}>();

defineEmits<{
  (e: "open-settings"): void;
}>();
</script>
