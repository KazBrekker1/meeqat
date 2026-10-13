<template>
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
</template>

<script lang="ts" setup>
import { NOTIFICATION_TIMING_OPTIONS } from '@/composables/useNotifications';
import { cue } from '@/utils/sounds';

const { notificationSettings } = usePrayerRuntime();

// Notification timing options for select
const timingOptions = NOTIFICATION_TIMING_OPTIONS.map(min => ({
  label: min === 0 ? 'Off' : `${min} min`,
  value: min,
}));

// Two-way binding helpers for notification settings
const minutesBefore = computed({
  get: () => notificationSettings.value?.minutesBefore ?? 5,
  set: (value) => {
    if (notificationSettings.value) {
      notificationSettings.value = {
        ...notificationSettings.value,
        minutesBefore: value,
      };
    }
  },
});

const minutesAfter = computed({
  get: () => notificationSettings.value?.minutesAfter ?? 5,
  set: (value) => {
    if (notificationSettings.value) {
      notificationSettings.value = {
        ...notificationSettings.value,
        minutesAfter: value,
      };
    }
  },
});

function toggleNotifications() {
  if (notificationSettings.value) {
    cue('toggled');
    notificationSettings.value = {
      ...notificationSettings.value,
      enabled: !notificationSettings.value.enabled,
    };
  }
}

function toggleAtPrayerTime() {
  if (notificationSettings.value) {
    cue('toggled');
    notificationSettings.value = {
      ...notificationSettings.value,
      atPrayerTime: !notificationSettings.value.atPrayerTime,
    };
  }
}

function toggleSilent() {
  if (notificationSettings.value) {
    cue('toggled');
    notificationSettings.value = {
      ...notificationSettings.value,
      silent: !notificationSettings.value.silent,
    };
  }
}
</script>
