<template>
  <UModal
    v-model:open="isOpen"
    title="Settings"
    description="Customize your prayer times experience"
    :ui="{
      content: 'max-h-[85vh] sm:max-w-lg',
    }"
  >
    <template #body>
      <div class="space-y-6">
        <SettingsLocation />

        <SettingsCalculation />

        <!-- Add to calendar Section -->
        <PrayerCalendarSubscribe
          v-if="hasLocation && activeCoords?.lat != null && activeCoords?.lng != null"
          :lat="activeCoords.lat"
          :lng="activeCoords.lng"
          :method-id="selectedMethodId"
          :name="locationDisplayName"
        />

        <SettingsDisplay :moon-phase="pickerPhase" />

        <SettingsNotifications />

        <SettingsAndroidPermissions v-if="isAndroid" />

        <SettingsData />

        <SettingsAccount v-model:passkey-failed="passkeyFailed" />

        <SettingsUpdates />

        <SettingsDeveloper v-if="isDev" />
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end">
        <UButton
          variant="soft"
          color="neutral"
          @click="closeModal"
        >
          Done
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script lang="ts" setup>
import { getPlatform } from '@/utils/platform';
import { moonPhase as lunarPhase } from '@/utils/moon/lunar';

// The dialog is a shell: each section reads and changes the shared state itself
// (usePrayerRuntime and the other app-wide composables).
const isOpen = defineModel<boolean>({ required: true });

const { hasLocation, activeCoords, locationDisplayName, selectedMethodId } = usePrayerRuntime();

const isAndroid = getPlatform() === 'android';
// Developer tools (test notification, time mocking) are for development builds only.
const isDev = import.meta.dev;

function closeModal() {
  isOpen.value = false;
}

const { loadOffset, getNow } = useMockTime();
const { checkPermissions } = useAndroidPermissions();

onMounted(async () => {
  if (isAndroid) {
    await checkPermissions();
    await loadOffset();
  }
});

const { refresh: refreshAccount } = useAccount();
const { ensureSession: ensureTogetherSession } = useTogether();
const nativeAccount = getPlatform() !== 'web';
const passkeyFailed = ref(false);

watch(isOpen, (open) => {
  if (!open) return;
  if (nativeAccount) void ensureTogetherSession();
  else void refreshAccount();
});

// Moon style picker: live thumbnails of every style at the current phase.
const pickerPhase = computed(() => lunarPhase(getNow()));
</script>
