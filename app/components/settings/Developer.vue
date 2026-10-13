<template>
  <USeparator />

  <section class="space-y-4">
    <div class="flex items-center gap-2">
      <UIcon name="i-lucide-code" class="w-5 h-5 text-amber-500" />
      <h3 class="font-semibold text-amber-500">Developer</h3>
    </div>

    <div class="flex flex-wrap gap-2 pl-7">
      <UButton
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

<script lang="ts" setup>
import { getPlatform } from '@/utils/platform';

const isAndroid = getPlatform() === 'android';
const { send } = usePrayerRuntime();

const onTestNotificationClick = () => send("Meeqat", "Prayer time is here");

// Mock time (for developer tools)
const { mockTimeOffsetMs, jumpTime, clearOffset, formatOffset } = useMockTime();

async function resetTime() {
  await clearOffset();
}
</script>
