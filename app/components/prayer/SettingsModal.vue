<template>
  <UModal
    v-model:open="isOpen"
    title="Settings"
    description="Customize your prayer times experience"
  >
    <template #body>
      <div class="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
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

        <!-- Additional Prayer Times -->
        <div class="flex items-center justify-between">
          <div>
            <p class="font-medium">Additional Times</p>
            <p class="text-sm text-muted">Show Imsak, Midnight, and night thirds</p>
          </div>
          <UButton
            size="sm"
            :variant="showAdditionalTimes ? 'solid' : 'soft'"
            :color="showAdditionalTimes ? 'primary' : 'neutral'"
            @click="$emit('toggle-additional-times')"
          >
            {{ showAdditionalTimes ? 'Shown' : 'Hidden' }}
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

        <!-- Ramadan Mode Toggle -->
        <div class="flex items-center justify-between">
          <div>
            <p class="font-medium">Ramadan Mode</p>
            <p class="text-sm text-muted">Show Suhoor/Iftar times during Ramadan</p>
          </div>
          <UButton
            size="sm"
            :variant="ramadanModeEnabled ? 'solid' : 'soft'"
            :color="ramadanModeEnabled ? 'primary' : 'neutral'"
            @click="$emit('toggle-ramadan-mode')"
          >
            {{ ramadanModeEnabled ? 'Enabled' : 'Disabled' }}
          </UButton>
        </div>

        <USeparator />

        <!-- Notification Settings -->
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <div>
              <p class="font-medium">Notifications</p>
              <p class="text-sm text-muted">Prayer time reminders</p>
            </div>
            <UButton
              size="sm"
              :variant="notificationSettings?.enabled ? 'solid' : 'soft'"
              :color="notificationSettings?.enabled ? 'primary' : 'neutral'"
              @click="toggleNotifications"
            >
              {{ notificationSettings?.enabled ? 'Enabled' : 'Disabled' }}
            </UButton>
          </div>

          <Transition
            enter-active-class="transition duration-200 ease-out"
            enter-from-class="opacity-0 -translate-y-2"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition duration-150 ease-in"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 -translate-y-2"
          >
            <div v-if="notificationSettings?.enabled" class="space-y-3 pl-4 border-l-2 border-[var(--ui-border)]">
              <!-- Minutes Before -->
              <div class="flex items-center justify-between gap-4">
                <p class="text-sm">Remind before prayer</p>
                <USelect
                  v-model="minutesBefore"
                  :items="timingOptions"
                  size="sm"
                  class="w-28"
                />
              </div>

              <!-- At Prayer Time -->
              <div class="flex items-center justify-between">
                <p class="text-sm">Notify at prayer time</p>
                <UButton
                  size="xs"
                  :variant="notificationSettings?.atPrayerTime ? 'solid' : 'soft'"
                  :color="notificationSettings?.atPrayerTime ? 'primary' : 'neutral'"
                  @click="toggleAtPrayerTime"
                >
                  {{ notificationSettings?.atPrayerTime ? 'Yes' : 'No' }}
                </UButton>
              </div>

              <!-- Minutes After -->
              <div class="flex items-center justify-between gap-4">
                <p class="text-sm">Iqama reminder after</p>
                <USelect
                  v-model="minutesAfter"
                  :items="timingOptions"
                  size="sm"
                  class="w-28"
                />
              </div>
            </div>
          </Transition>
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
import { NOTIFICATION_TIMING_OPTIONS, type NotificationSettings } from '@/composables/useNotifications';

const props = defineProps<{
  modelValue: boolean;
  timeFormat: '24h' | '12h';
  isCalendarShown?: boolean;
  isLoading: boolean;
  showAdditionalTimes?: boolean;
  ramadanModeEnabled?: boolean;
  notificationSettings?: NotificationSettings;
  testPlayAthan?: () => void;
  onTestNotificationClick?: () => void;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'clear-cache'): void;
  (e: 'toggle-time-format'): void;
  (e: 'toggle-calendar'): void;
  (e: 'toggle-additional-times'): void;
  (e: 'toggle-ramadan-mode'): void;
  (e: 'update:notificationSettings', value: NotificationSettings): void;
}>();

const isDev = process.env.NODE_ENV === 'development';

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

// Notification timing options for select
const timingOptions = NOTIFICATION_TIMING_OPTIONS.map(min => ({
  label: min === 0 ? 'Off' : `${min} min`,
  value: min,
}));

// Two-way binding helpers for notification settings
const minutesBefore = computed({
  get: () => props.notificationSettings?.minutesBefore ?? 5,
  set: (value) => {
    if (props.notificationSettings) {
      emit('update:notificationSettings', {
        ...props.notificationSettings,
        minutesBefore: value,
      });
    }
  },
});

const minutesAfter = computed({
  get: () => props.notificationSettings?.minutesAfter ?? 5,
  set: (value) => {
    if (props.notificationSettings) {
      emit('update:notificationSettings', {
        ...props.notificationSettings,
        minutesAfter: value,
      });
    }
  },
});

function toggleNotifications() {
  if (props.notificationSettings) {
    emit('update:notificationSettings', {
      ...props.notificationSettings,
      enabled: !props.notificationSettings.enabled,
    });
  }
}

function toggleAtPrayerTime() {
  if (props.notificationSettings) {
    emit('update:notificationSettings', {
      ...props.notificationSettings,
      atPrayerTime: !props.notificationSettings.atPrayerTime,
    });
  }
}
</script>
