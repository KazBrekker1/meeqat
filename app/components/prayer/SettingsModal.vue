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

        <!-- Android Permissions Section (only shown on Android) -->
        <template v-if="isAndroid">
          <USeparator />

          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <p class="font-medium">Android Permissions</p>
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                :loading="isCheckingPermissions"
                @click="checkAllPermissions"
                icon="heroicons:arrow-path-20-solid"
              >
                Refresh
              </UButton>
            </div>
            <p class="text-sm text-muted">Required for background timer and notifications</p>

            <div class="space-y-3 pl-4 border-l-2 border-[var(--ui-border)]">
              <!-- Notification Permission -->
              <div class="flex items-center justify-between gap-4">
                <div class="flex items-center gap-2">
                  <UIcon
                    :name="notificationPermissionGranted ? 'heroicons:check-circle-20-solid' : 'heroicons:x-circle-20-solid'"
                    :class="notificationPermissionGranted ? 'text-green-500' : 'text-red-500'"
                  />
                  <div>
                    <p class="text-sm font-medium">Notifications</p>
                    <p class="text-xs text-muted">Show prayer alerts</p>
                  </div>
                </div>
                <UButton
                  v-if="notificationPermissionGranted === false"
                  size="xs"
                  variant="soft"
                  @click="handleRequestNotificationPermission"
                >
                  Enable
                </UButton>
                <UBadge
                  v-else-if="notificationPermissionGranted === true"
                  color="success"
                  variant="subtle"
                  size="sm"
                >
                  Granted
                </UBadge>
                <UBadge
                  v-else
                  color="neutral"
                  variant="subtle"
                  size="sm"
                >
                  Checking...
                </UBadge>
              </div>

              <!-- Battery Optimization -->
              <div class="flex items-center justify-between gap-4">
                <div class="flex items-center gap-2">
                  <UIcon
                    :name="batteryOptimizationIgnored ? 'heroicons:check-circle-20-solid' : 'heroicons:exclamation-triangle-20-solid'"
                    :class="batteryOptimizationIgnored ? 'text-green-500' : 'text-amber-500'"
                  />
                  <div>
                    <p class="text-sm font-medium">Battery Optimization</p>
                    <p class="text-xs text-muted">Keep timer running in background</p>
                  </div>
                </div>
                <UButton
                  v-if="batteryOptimizationIgnored === false"
                  size="xs"
                  variant="soft"
                  color="warning"
                  @click="handleRequestBatteryOptimization"
                >
                  Disable
                </UButton>
                <UBadge
                  v-else-if="batteryOptimizationIgnored === true"
                  color="success"
                  variant="subtle"
                  size="sm"
                >
                  Unrestricted
                </UBadge>
                <UBadge
                  v-else
                  color="neutral"
                  variant="subtle"
                  size="sm"
                >
                  Checking...
                </UBadge>
              </div>

              <!-- Open App Settings Button -->
              <div class="pt-2">
                <UButton
                  size="xs"
                  variant="outline"
                  color="neutral"
                  @click="handleOpenAppSettings"
                  icon="heroicons:cog-6-tooth-20-solid"
                >
                  Open App Settings
                </UButton>
              </div>
            </div>
          </div>
        </template>

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

interface NotificationPermissionStatus {
  granted: boolean;
  canRequest: boolean;
}

interface BatteryOptimizationStatus {
  isIgnoringBatteryOptimizations: boolean;
  canRequest: boolean;
}

interface BatteryOptimizationResult {
  requestSent?: boolean;
  alreadyExempt?: boolean;
  notRequired?: boolean;
}

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
  // Android-specific props
  isAndroid?: boolean;
  checkNotificationPermission?: () => Promise<NotificationPermissionStatus>;
  requestNotificationPermission?: () => Promise<boolean>;
  checkBatteryOptimization?: () => Promise<BatteryOptimizationStatus>;
  requestBatteryOptimizationExemption?: () => Promise<BatteryOptimizationResult>;
  openAppSettings?: () => Promise<void>;
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

// Android permissions state
const notificationPermissionGranted = ref<boolean | null>(null);
const batteryOptimizationIgnored = ref<boolean | null>(null);
const isCheckingPermissions = ref(false);

// Check permissions when modal opens on Android
watch(() => props.modelValue, async (isOpen) => {
  if (isOpen && props.isAndroid) {
    await checkAllPermissions();
  }
});

async function checkAllPermissions() {
  if (!props.isAndroid) return;

  isCheckingPermissions.value = true;
  try {
    // Check notification permission
    if (props.checkNotificationPermission) {
      const status = await props.checkNotificationPermission();
      notificationPermissionGranted.value = status.granted;
    }

    // Check battery optimization
    if (props.checkBatteryOptimization) {
      const status = await props.checkBatteryOptimization();
      batteryOptimizationIgnored.value = status.isIgnoringBatteryOptimizations;
    }
  } catch (err) {
    console.error('Error checking permissions:', err);
  } finally {
    isCheckingPermissions.value = false;
  }
}

async function handleRequestNotificationPermission() {
  if (props.requestNotificationPermission) {
    const granted = await props.requestNotificationPermission();
    notificationPermissionGranted.value = granted;
  }
}

async function handleRequestBatteryOptimization() {
  if (props.requestBatteryOptimizationExemption) {
    await props.requestBatteryOptimizationExemption();
    // Re-check after a short delay (user needs to grant permission in system settings)
    setTimeout(async () => {
      if (props.checkBatteryOptimization) {
        const status = await props.checkBatteryOptimization();
        batteryOptimizationIgnored.value = status.isIgnoringBatteryOptimizations;
      }
    }, 1000);
  }
}

async function handleOpenAppSettings() {
  if (props.openAppSettings) {
    await props.openAppSettings();
  }
}
</script>
