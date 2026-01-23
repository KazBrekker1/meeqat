<template>
  <UModal
    v-model:open="isOpen"
    title="Settings"
    description="Customize your prayer times experience"
    :ui="{
      width: 'sm:max-w-lg',
      content: 'max-h-[85vh]',
    }"
  >
    <template #body>
      <div class="space-y-6">

        <!-- Prayer Calculation Section -->
        <section class="space-y-4">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-calculator" class="w-5 h-5 text-primary" />
            <h3 class="font-semibold">Prayer Calculation</h3>
          </div>

          <div class="space-y-3 pl-7">
            <!-- Calculation Method -->
            <div class="space-y-1.5">
              <label class="text-sm font-medium">Calculation Method</label>
              <USelectMenu
                v-model="selectedMethodIdModel"
                :items="methodSelectOptions"
                placeholder="Select method"
                label-key="label"
                value-key="value"
                class="w-full"
              />
              <p class="text-xs text-muted">Different regions use different calculation methods</p>
            </div>

            <!-- Display Timezone -->
            <div class="space-y-1.5">
              <label class="text-sm font-medium">Display Timezone</label>
              <USelectMenu
                v-model="selectedExtraTimezoneModel"
                :items="timezoneSelectOptions"
                placeholder="Use my timezone"
                label-key="label"
                value-key="value"
                class="w-full"
                searchable
                searchable-placeholder="Search timezones..."
              />
              <p class="text-xs text-muted">Show times in a different timezone</p>
            </div>
          </div>
        </section>

        <USeparator />

        <!-- Display Section -->
        <section class="space-y-4">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-palette" class="w-5 h-5 text-primary" />
            <h3 class="font-semibold">Display</h3>
          </div>

          <div class="space-y-3 pl-7">
            <!-- Theme -->
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium">Theme</p>
                <p class="text-xs text-muted">Light or dark mode</p>
              </div>
              <UColorModeButton size="md" />
            </div>

            <!-- Time Format -->
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium">Time Format</p>
                <p class="text-xs text-muted">12-hour or 24-hour</p>
              </div>
              <UButton
                size="sm"
                variant="soft"
                @click="$emit('toggle-time-format')"
              >
                {{ timeFormat === '24h' ? '24h' : '12h' }}
              </UButton>
            </div>

            <!-- Additional Prayer Times -->
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium">Additional Times</p>
                <p class="text-xs text-muted">Imsak, Midnight, night thirds</p>
              </div>
              <USwitch
                :model-value="showAdditionalTimes"
                @update:model-value="$emit('toggle-additional-times')"
              />
            </div>

            <!-- Calendar -->
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium">Calendar</p>
                <p class="text-xs text-muted">Show date picker</p>
              </div>
              <USwitch
                :model-value="isCalendarShown"
                @update:model-value="$emit('toggle-calendar')"
              />
            </div>

            <!-- Ramadan Mode -->
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium">Ramadan Mode</p>
                <p class="text-xs text-muted">Highlight Suhoor & Iftar</p>
              </div>
              <USwitch
                :model-value="ramadanModeEnabled"
                @update:model-value="$emit('toggle-ramadan-mode')"
              />
            </div>
          </div>
        </section>

        <USeparator />

        <!-- Notifications Section -->
        <section class="space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-bell" class="w-5 h-5 text-primary" />
              <h3 class="font-semibold">Notifications</h3>
            </div>
            <USwitch
              :model-value="notificationSettings?.enabled"
              @update:model-value="toggleNotifications"
            />
          </div>

          <Transition
            enter-active-class="transition duration-200 ease-out"
            enter-from-class="opacity-0 -translate-y-2"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition duration-150 ease-in"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 -translate-y-2"
          >
            <div v-if="notificationSettings?.enabled" class="space-y-3 pl-7">
              <!-- Minutes Before -->
              <div class="flex items-center justify-between gap-4">
                <p class="text-sm">Remind before prayer</p>
                <USelect
                  v-model="minutesBefore"
                  :items="timingOptions"
                  size="sm"
                  class="w-24"
                />
              </div>

              <!-- At Prayer Time -->
              <div class="flex items-center justify-between">
                <p class="text-sm">Notify at prayer time</p>
                <USwitch
                  :model-value="notificationSettings?.atPrayerTime"
                  @update:model-value="toggleAtPrayerTime"
                />
              </div>

              <!-- Minutes After -->
              <div class="flex items-center justify-between gap-4">
                <p class="text-sm">Iqama reminder after</p>
                <USelect
                  v-model="minutesAfter"
                  :items="timingOptions"
                  size="sm"
                  class="w-24"
                />
              </div>
            </div>
          </Transition>
        </section>

        <!-- Android Permissions Section -->
        <template v-if="isAndroid">
          <USeparator />

          <section class="space-y-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-shield-check" class="w-5 h-5 text-primary" />
                <h3 class="font-semibold">Permissions</h3>
              </div>
              <UButton
                variant="ghost"
                size="xs"
                icon="i-lucide-refresh-cw"
                :loading="isCheckingPermissions"
                @click="checkPermissions"
              />
            </div>

            <div class="space-y-3 pl-7">
              <!-- Notifications Permission -->
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <UIcon
                    :name="notificationPermissionGranted ? 'i-lucide-check-circle' : 'i-lucide-x-circle'"
                    :class="notificationPermissionGranted ? 'text-green-500' : 'text-red-500'"
                    class="w-4 h-4"
                  />
                  <div>
                    <p class="text-sm font-medium">Notifications</p>
                    <p class="text-xs text-muted">Show prayer alerts</p>
                  </div>
                </div>
                <UButton
                  v-if="!notificationPermissionGranted"
                  size="xs"
                  variant="soft"
                  @click="requestNotificationPermission"
                >
                  OK
                </UButton>
                <UBadge v-else color="success" variant="subtle" size="xs">OK</UBadge>
              </div>

              <!-- Battery Optimization Permission -->
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <UIcon
                    :name="batteryOptimizationDisabled ? 'i-lucide-check-circle' : 'i-lucide-x-circle'"
                    :class="batteryOptimizationDisabled ? 'text-green-500' : 'text-red-500'"
                    class="w-4 h-4"
                  />
                  <div>
                    <p class="text-sm font-medium">Battery</p>
                    <p class="text-xs text-muted">Keep running in background</p>
                  </div>
                </div>
                <UButton
                  v-if="!batteryOptimizationDisabled"
                  size="xs"
                  variant="soft"
                  @click="requestBatteryExemption"
                >
                  OK
                </UButton>
                <UBadge v-else color="success" variant="subtle" size="xs">OK</UBadge>
              </div>

              <!-- Open System Settings -->
              <button
                class="flex items-center gap-1 text-sm text-primary hover:underline"
                @click="openSettings"
              >
                <UIcon name="i-lucide-external-link" class="w-4 h-4" />
                Open system settings
              </button>
            </div>
          </section>
        </template>

        <USeparator />

        <!-- Data Section -->
        <section class="space-y-4">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-database" class="w-5 h-5 text-primary" />
            <h3 class="font-semibold">Data</h3>
          </div>

          <div class="pl-7">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium">Clear Cache</p>
                <p class="text-xs text-muted">Remove cached prayer times</p>
              </div>
              <UButton
                size="sm"
                color="error"
                variant="soft"
                :loading="isLoading"
                @click="$emit('clear-cache')"
                icon="i-lucide-trash-2"
              >
                Clear
              </UButton>
            </div>
          </div>
        </section>

        <!-- Developer Tools -->
        <template v-if="isDev">
          <USeparator />

          <section class="space-y-4">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-code" class="w-5 h-5 text-amber-500" />
              <h3 class="font-semibold text-amber-500">Developer</h3>
            </div>

            <div class="flex flex-wrap gap-2 pl-7">
              <UButton
                v-if="testPlayAthan"
                size="sm"
                variant="soft"
                color="warning"
                @click="testPlayAthan"
                icon="i-lucide-volume-2"
              >
                Test Athan
              </UButton>
              <UButton
                v-if="onTestNotificationClick"
                size="sm"
                variant="soft"
                color="warning"
                @click="onTestNotificationClick"
                icon="i-lucide-bell-ring"
              >
                Test Notification
              </UButton>
            </div>

            <!-- Time Mocking (Android only) -->
            <template v-if="isAndroid">
              <div class="space-y-2 pl-7 mt-4">
                <p class="text-sm font-medium">Mock Time Offset</p>
                <div class="flex flex-wrap gap-2">
                  <UButton
                    size="xs"
                    variant="soft"
                    color="warning"
                    @click="jumpTime(-3600000)"
                  >
                    -1h
                  </UButton>
                  <UButton
                    size="xs"
                    variant="soft"
                    color="warning"
                    @click="jumpTime(-60000)"
                  >
                    -1m
                  </UButton>
                  <UButton
                    size="xs"
                    variant="soft"
                    color="warning"
                    @click="jumpTime(60000)"
                  >
                    +1m
                  </UButton>
                  <UButton
                    size="xs"
                    variant="soft"
                    color="warning"
                    @click="jumpTime(3600000)"
                  >
                    +1h
                  </UButton>
                  <UButton
                    size="xs"
                    variant="soft"
                    color="error"
                    @click="resetTime"
                  >
                    Reset
                  </UButton>
                </div>
                <p class="text-xs text-muted">
                  Current offset: {{ formatOffset(mockTimeOffsetMs) }}
                </p>
              </div>
            </template>
          </section>
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
import { useMockTime } from '@/composables/useMockTime';

// Check if running on Android
const isAndroid = ref(false);
const notificationPermissionGranted = ref(false);
const batteryOptimizationDisabled = ref(false);
const isCheckingPermissions = ref(false);

// Mock time (for developer tools)
const { mockTimeOffsetMs, jumpTime, clearOffset, loadOffset, formatOffset } = useMockTime();

// Helper to get invoke function
async function getInvoke() {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke;
}

onMounted(async () => {
  // Detect Android platform
  if (import.meta.client) {
    try {
      const { platform } = await import('@tauri-apps/plugin-os');
      isAndroid.value = (await platform()) === 'android';
      if (isAndroid.value) {
        await checkPermissions();
        await loadOffset();
      }
    } catch {
      // Not running in Tauri
    }
  }
});

async function resetTime() {
  await clearOffset();
}

async function checkPermissions() {
  if (!isAndroid.value) return;

  isCheckingPermissions.value = true;
  try {
    const invoke = await getInvoke();

    const [notifResult, batteryResult] = await Promise.all([
      invoke<{ granted: boolean }>('plugin:prayer-service|check_notification_permission'),
      invoke<{ isIgnoring: boolean }>('plugin:prayer-service|check_battery_optimization'),
    ]);

    notificationPermissionGranted.value = notifResult.granted;
    batteryOptimizationDisabled.value = batteryResult.isIgnoring;
  } catch (e) {
    console.error('Failed to check permissions:', e);
  } finally {
    isCheckingPermissions.value = false;
  }
}

async function requestNotificationPermission() {
  try {
    const invoke = await getInvoke();
    await invoke('plugin:prayer-service|request_notification_permission');
    // Re-check after user returns from settings
    setTimeout(() => checkPermissions(), 1000);
  } catch (e) {
    console.error('Failed to request notification permission:', e);
  }
}

async function requestBatteryExemption() {
  try {
    const invoke = await getInvoke();
    await invoke('plugin:prayer-service|request_battery_optimization_exemption');
    // Re-check after user returns from settings
    setTimeout(() => checkPermissions(), 1000);
  } catch (e) {
    console.error('Failed to request battery exemption:', e);
  }
}

async function openSettings() {
  try {
    const invoke = await getInvoke();
    await invoke('plugin:prayer-service|open_app_settings');
  } catch (e) {
    console.error('Failed to open settings:', e);
  }
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
  // Prayer calculation props
  methodSelectOptions: { label: string; value: number }[];
  timezoneSelectOptions: { label: string; value: string }[];
  selectedMethodId: number;
  selectedExtraTimezone: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'update:selectedMethodId', value: number): void;
  (e: 'update:selectedExtraTimezone', value: string): void;
  (e: 'clear-cache'): void;
  (e: 'toggle-time-format'): void;
  (e: 'toggle-calendar'): void;
  (e: 'toggle-additional-times'): void;
  (e: 'toggle-ramadan-mode'): void;
  (e: 'update:notificationSettings', value: NotificationSettings): void;
}>();

// Show dev tools in development mode or on Android (for testing time mocking)
const isDev = computed(() => process.env.NODE_ENV === 'development' || isAndroid.value);

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

// Two-way binding for method and timezone
const selectedMethodIdModel = computed({
  get: () => props.selectedMethodId,
  set: (value) => emit('update:selectedMethodId', value),
});

const selectedExtraTimezoneModel = computed({
  get: () => props.selectedExtraTimezone,
  set: (value) => emit('update:selectedExtraTimezone', value),
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
