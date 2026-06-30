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

        <!-- Location Section -->
        <section>
          <p class="text-[11px] uppercase tracking-wider text-muted mb-1.5">Location</p>
          <div class="grid grid-cols-2 gap-1 p-1 rounded-xl bg-elevated border border-default">
            <button
              class="flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm cursor-pointer transition-colors"
              :class="locationMode !== 'gps' ? 'bg-primary/15 ring-1 ring-primary/40 font-medium' : 'text-muted hover:text-default'"
              @click="$emit('update:locationMode', 'city')"
            >
              <UIcon name="i-lucide-building-2" class="size-4" /> City
            </button>
            <button
              class="flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm cursor-pointer transition-colors"
              :class="locationMode === 'gps' ? 'bg-primary/15 ring-1 ring-primary/40 font-medium' : 'text-muted hover:text-default'"
              @click="$emit('update:locationMode', 'gps')"
            >
              <UIcon name="i-lucide-satellite" class="size-4" /> GPS
            </button>
          </div>

          <Transition
            enter-active-class="transition duration-200 ease-out"
            enter-from-class="opacity-0 -translate-y-2"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition duration-150 ease-in"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 -translate-y-2"
          >
            <PrayerLocationMapPicker
              v-if="locationMode === 'gps'"
              class="mt-3"
              :lat="gpsLat"
              :lng="gpsLng"
              @update:location="$emit('update:gpsLocation', $event)"
            />
          </Transition>
        </section>

        <!-- Prayer Calculation Section -->
        <section>
          <p class="text-[11px] uppercase tracking-wider text-muted mb-1.5">Calculation</p>
          <div class="rounded-xl bg-elevated border border-default p-3 space-y-3">
            <div class="space-y-1.5">
              <label class="text-sm font-medium">Calculation method</label>
              <USelectMenu
                v-model="selectedMethodIdModel"
                :items="methodSelectOptions"
                placeholder="Select method"
                label-key="label"
                value-key="value"
                class="w-full"
              />
            </div>
            <div class="space-y-1.5">
              <label class="text-sm font-medium">Display timezone</label>
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
            </div>
          </div>
        </section>

        <!-- Display Section -->
        <section>
          <p class="text-[11px] uppercase tracking-wider text-muted mb-1.5">Display</p>
          <div class="rounded-xl bg-elevated border border-default divide-y divide-default overflow-hidden">
            <div class="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p class="text-sm font-medium">Time format</p>
                <p class="text-xs text-muted">12-hour or 24-hour</p>
              </div>
              <UButton size="sm" variant="soft" @click="$emit('toggle-time-format')">
                {{ timeFormat === '24h' ? '24h' : '12h' }}
              </UButton>
            </div>
            <div class="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p class="text-sm font-medium">Additional times</p>
                <p class="text-xs text-muted">Imsak, Midnight, night thirds</p>
              </div>
              <USwitch
                :model-value="showAdditionalTimes"
                @update:model-value="$emit('toggle-additional-times')"
              />
            </div>
          </div>
        </section>

        <!-- Notifications Section -->
        <section>
          <div class="flex items-center justify-between mb-1.5">
            <p class="text-[11px] uppercase tracking-wider text-muted">Notifications</p>
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
            <div v-if="notificationSettings?.enabled" class="rounded-xl bg-elevated border border-default divide-y divide-default overflow-hidden">
              <div class="flex items-center justify-between gap-4 px-4 py-3">
                <p class="text-sm">Remind before prayer</p>
                <USelect v-model="minutesBefore" :items="timingOptions" size="sm" class="w-24" />
              </div>
              <div class="flex items-center justify-between gap-4 px-4 py-3">
                <p class="text-sm">Notify at prayer time</p>
                <USwitch :model-value="notificationSettings?.atPrayerTime" @update:model-value="toggleAtPrayerTime" />
              </div>
              <div class="flex items-center justify-between gap-4 px-4 py-3">
                <p class="text-sm">Iqama reminder after</p>
                <USelect v-model="minutesAfter" :items="timingOptions" size="sm" class="w-24" />
              </div>
              <div class="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p class="text-sm">Discreet mode</p>
                  <p class="text-[11px] text-muted">Silent — no sound or vibration</p>
                </div>
                <USwitch :model-value="notificationSettings?.silent" @update:model-value="toggleSilent" />
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

        <!-- Data Section -->
        <section>
          <p class="text-[11px] uppercase tracking-wider text-muted mb-1.5">Data</p>
          <div class="rounded-xl bg-elevated border border-default px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p class="text-sm font-medium">Clear cache</p>
              <p class="text-xs text-muted">Remove cached prayer times</p>
            </div>
            <UButton
              size="sm"
              color="error"
              variant="soft"
              :loading="isLoading"
              icon="i-lucide-trash-2"
              @click="$emit('clear-cache')"
            >
              Clear
            </UButton>
          </div>
        </section>

        <!-- Updates Section -->
        <section>
          <p class="text-[11px] uppercase tracking-wider text-muted mb-1.5">Updates</p>
          <div class="rounded-xl bg-elevated border border-default px-4 py-3 space-y-3">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-sm font-medium">App version</p>
                <p class="text-xs text-muted">You're on v{{ appVersion }}</p>
              </div>

              <!-- iOS updates are App Store-managed; everywhere else, offer a check/install action. -->
              <span v-if="isIos" class="text-xs text-muted text-right max-w-[55%]">
                Updates are delivered through the App Store.
              </span>
              <UButton
                v-else-if="canInstall"
                size="sm"
                color="primary"
                icon="i-lucide-download"
                :loading="updateStatus === 'downloading' || updateStatus === 'installing'"
                :disabled="updateBusy"
                @click="downloadAndInstall"
              >
                {{ updateActionLabel }}
              </UButton>
              <UButton
                v-else
                size="sm"
                variant="soft"
                color="neutral"
                icon="i-lucide-refresh-cw"
                :loading="updateStatus === 'checking'"
                :disabled="updateBusy"
                @click="checkForUpdate"
              >
                {{ updateStatus === 'checking' ? 'Checking…' : 'Check for updates' }}
              </UButton>
            </div>

            <!-- Status line -->
            <p
              v-if="updateStatus === 'uptodate'"
              class="flex items-center gap-1.5 text-xs text-success"
            >
              <UIcon name="i-lucide-check" class="size-3.5" />
              You're on the latest version.
            </p>
            <p
              v-else-if="isUpdateAvailable && latestVersion"
              class="text-xs text-primary"
            >
              v{{ latestVersion }} is available.
            </p>

            <!-- Download progress -->
            <div v-if="updateStatus === 'downloading'" class="space-y-1">
              <div class="flex items-center justify-between text-xs text-muted">
                <span>Downloading…</span>
                <span>{{ downloadProgress }}%</span>
              </div>
              <UProgress :model-value="downloadProgress" :max="100" size="sm" />
            </div>

            <!-- Installing -->
            <p
              v-else-if="updateStatus === 'installing'"
              class="flex items-center gap-1.5 text-xs text-muted"
            >
              <UIcon name="i-lucide-loader-circle" class="size-3.5 animate-spin" />
              <span v-if="isAndroid">Opening the installer…</span>
              <span v-else>Installing — the app will restart shortly.</span>
            </p>

            <!-- Error -->
            <p
              v-else-if="updateStatus === 'error'"
              class="flex items-start gap-1.5 text-xs text-error"
            >
              <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-3.5 shrink-0" />
              <span>{{ updateError || 'Update check failed. Please try again.' }}</span>
            </p>
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

// In-app updates — shares the singleton state with the footer pill + auto-prompt modal.
const isIos = ref(false);
const appVersion = useRuntimeConfig().public.version as string;
const {
  status: updateStatus,
  latestVersion,
  downloadProgress,
  errorMessage: updateError,
  isUpdateAvailable,
  checkForUpdate,
  downloadAndInstall,
} = useAppUpdate();

// "available" / "downloading" / "installing" all mean: show the install action.
const canInstall = computed(() =>
  ['available', 'downloading', 'installing'].includes(updateStatus.value)
);
const updateBusy = computed(() =>
  ['checking', 'downloading', 'installing'].includes(updateStatus.value)
);
const updateActionLabel = computed(() =>
  isAndroid.value ? 'Download & install' : 'Update & restart'
);

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
      const os = await platform();
      isAndroid.value = os === 'android';
      isIos.value = os === 'ios';
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
  isLoading: boolean;
  showAdditionalTimes?: boolean;
  notificationSettings?: NotificationSettings;
  onTestNotificationClick?: () => void;
  // Prayer calculation props
  methodSelectOptions: { label: string; value: number }[];
  timezoneSelectOptions: { label: string; value: string }[];
  selectedMethodId: number;
  selectedExtraTimezone: string;
  // GPS location props
  locationMode: 'city' | 'gps';
  gpsLat?: number | null;
  gpsLng?: number | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'update:locationMode', value: 'city' | 'gps'): void;
  (e: 'update:gpsLocation', value: { lat: number; lng: number } | null): void;
  (e: 'update:selectedMethodId', value: number): void;
  (e: 'update:selectedExtraTimezone', value: string): void;
  (e: 'clear-cache'): void;
  (e: 'toggle-time-format'): void;
  (e: 'toggle-additional-times'): void;
  (e: 'update:notificationSettings', value: NotificationSettings): void;
}>();

// Show dev tools in development mode or on Android (for testing time mocking)
const isDev = computed(() => import.meta.dev || isAndroid.value);

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

function toggleSilent() {
  if (props.notificationSettings) {
    emit('update:notificationSettings', {
      ...props.notificationSettings,
      silent: !props.notificationSettings.silent,
    });
  }
}
</script>
