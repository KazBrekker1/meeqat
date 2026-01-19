<template>
  <UModal
    v-model:open="isOpen"
    title="Settings"
    description="Customize your prayer times experience"
  >
    <template #body>
      <div class="space-y-4">
        <!-- Theme Toggle -->
        <div class="flex items-center justify-between">
          <div>
            <p class="font-medium">Theme</p>
            <p class="text-sm text-muted">Switch between light and dark mode</p>
          </div>
          <UColorModeButton size="md" />
        </div>

        <USeparator />

        <!-- Time Format Toggle -->
        <div class="flex items-center justify-between">
          <div>
            <p class="font-medium">Time Format</p>
            <p class="text-sm text-muted">Display times in 12-hour or 24-hour format</p>
          </div>
          <UButton
            size="sm"
            variant="soft"
            @click="$emit('toggle-time-format')"
          >
            {{ timeFormat === '24h' ? '24-hour' : '12-hour' }}
          </UButton>
        </div>

        <USeparator />

        <!-- Calendar Toggle -->
        <div class="flex items-center justify-between">
          <div>
            <p class="font-medium">Calendar</p>
            <p class="text-sm text-muted">Show or hide the date picker</p>
          </div>
          <UButton
            size="sm"
            :variant="isCalendarShown ? 'solid' : 'soft'"
            :color="isCalendarShown ? 'primary' : 'neutral'"
            @click="$emit('toggle-calendar')"
          >
            {{ isCalendarShown ? 'Visible' : 'Hidden' }}
          </UButton>
        </div>

        <USeparator />

        <!-- Clear Cache -->
        <div class="flex items-center justify-between">
          <div>
            <p class="font-medium">Clear Cache</p>
            <p class="text-sm text-muted">Remove all cached prayer times data</p>
          </div>
          <UButton
            size="sm"
            color="error"
            variant="soft"
            :loading="isLoading"
            @click="$emit('clear-cache')"
            icon="heroicons:trash-20-solid"
          >
            Clear
          </UButton>
        </div>

        <!-- Dev Tools (only in development) -->
        <template v-if="isDev">
          <USeparator />
          <div class="space-y-3">
            <p class="text-xs font-medium text-muted uppercase tracking-wider">Developer Tools</p>
            <div class="flex gap-2">
              <UButton
                v-if="testPlayAthan"
                size="sm"
                variant="soft"
                color="warning"
                @click="testPlayAthan"
                icon="heroicons:speaker-wave-20-solid"
              >
                Test Athan
              </UButton>
              <UButton
                v-if="onTestNotificationClick"
                size="sm"
                variant="soft"
                color="warning"
                @click="onTestNotificationClick"
                icon="heroicons:bell-20-solid"
              >
                Test Notification
              </UButton>
            </div>
          </div>
        </template>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end">
        <UButton
          variant="soft"
          color="neutral"
          @click="isOpen = false"
        >
          Done
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script lang="ts" setup>
const props = defineProps<{
  modelValue: boolean;
  timeFormat: '24h' | '12h';
  isCalendarShown?: boolean;
  isLoading: boolean;
  testPlayAthan?: () => void;
  onTestNotificationClick?: () => void;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'clear-cache'): void;
  (e: 'toggle-time-format'): void;
  (e: 'toggle-calendar'): void;
}>();

const isDev = process.env.NODE_ENV === 'development';

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});
</script>
