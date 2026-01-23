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
                size="xs"
                variant="ghost"
                color="neutral"
                :loading="isCheckingPermissions"
                @click="checkAllPermissions"
                icon="i-lucide-refresh-cw"
              />
            </div>

            <div class="space-y-3 pl-7">
              <!-- Notification Permission -->
              <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-2 min-w-0">
                  <UIcon
                    :name="notificationPermissionGranted ? 'i-lucide-check-circle' : 'i-lucide-x-circle'"
                    :class="notificationPermissionGranted ? 'text-green-500' : 'text-red-500'"
                    class="shrink-0"
                  />
                  <div class="min-w-0">
                    <p class="text-sm font-medium truncate">Notifications</p>
                    <p class="text-xs text-muted truncate">Show prayer alerts</p>
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
                  size="xs"
                >
                  OK
                </UBadge>
              </div>

              <!-- Battery Optimization -->
              <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-2 min-w-0">
                  <UIcon
                    :name="batteryOptimizationIgnored ? 'i-lucide-check-circle' : 'i-lucide-alert-triangle'"
                    :class="batteryOptimizationIgnored ? 'text-green-500' : 'text-amber-500'"
                    class="shrink-0"
                  />
                  <div class="min-w-0">
                    <p class="text-sm font-medium truncate">Battery</p>
                    <p class="text-xs text-muted truncate">Keep running in background</p>
                  </div>
                </div>
                <UButton
                  v-if="batteryOptimizationIgnored === false"
                  size="xs"
                  variant="soft"
                  color="warning"
                  @click="handleRequestBatteryOptimization"
                >
                  Fix
                </UButton>
                <UBadge
                  v-else-if="batteryOptimizationIgnored === true"
                  color="success"
                  variant="subtle"
                  size="xs"
                >
                  OK
                </UBadge>
              </div>

              <!-- Open App Settings -->
              <UButton
                size="xs"
                variant="link"
                color="neutral"
                @click="handleOpenAppSettings"
                icon="i-lucide-external-link"
                class="pl-0"
              >
                Open system settings
              </UButton>
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
  // Prayer calculation props
  methodSelectOptions: { label: string; value: number }[];
  timezoneSelectOptions: { label: string; value: string }[];
  selectedMethodId: number;
  selectedExtraTimezone: string;
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
  (e: 'update:selectedMethodId', value: number): void;
  (e: 'update:selectedExtraTimezone', value: string): void;
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
    if (props.checkNotificationPermission) {
      const status = await props.checkNotificationPermission();
      notificationPermissionGranted.value = status.granted;
    }

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
