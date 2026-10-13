<template>
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

<script lang="ts" setup>
const {
  notificationPermissionGranted,
  batteryOptimizationDisabled,
  isCheckingPermissions,
  checkPermissions,
  requestNotificationPermission,
  requestBatteryExemption,
  openSettings,
} = useAndroidPermissions();
</script>
