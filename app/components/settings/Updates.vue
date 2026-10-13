<template>
  <section v-if="updatePlatform !== 'web'">
    <p class="text-[11px] uppercase tracking-wider text-muted mb-1.5">Updates</p>
    <div class="rounded-xl bg-elevated border border-default px-4 py-3 space-y-3">
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-sm font-medium">App version</p>
          <p class="text-xs text-muted">You're on v{{ appVersion }}</p>
        </div>

        <!-- iOS updates are App Store-managed; everywhere else, offer a check/install action. -->
        <span v-if="updatePlatform === 'ios'" class="text-xs text-muted text-right max-w-[55%]">
          Updates are delivered through the App Store.
        </span>
        <UButton
          v-else-if="isUpdateAvailable && updateStatus !== 'installing'"
          size="sm"
          color="primary"
          :icon="updateStatus === 'error' && updateErrorKind !== 'permission' ? 'i-lucide-rotate-cw' : 'i-lucide-download'"
          :loading="updateStatus === 'downloading'"
          :disabled="updateBusy"
          @click="downloadAndInstall"
        >
          {{ updateActionLabel }}
        </UButton>
        <UButton
          v-else-if="updateStatus !== 'installing'"
          size="sm"
          variant="soft"
          color="neutral"
          icon="i-lucide-refresh-cw"
          :loading="updateStatus === 'checking'"
          :disabled="updateBusy"
          @click="checkForUpdate()"
        >
          {{ updateStatus === 'checking' ? 'Checking…' : updateStatus === 'error' ? 'Try again' : 'Check for updates' }}
        </UButton>
      </div>

      <p
        v-if="updateStatus === 'uptodate'"
        class="flex items-center gap-1.5 text-xs text-success"
      >
        <UIcon name="i-lucide-check" class="size-3.5" />
        You're on the latest version.
      </p>
      <p
        v-else-if="updateStatus === 'available' && latestVersion"
        class="text-xs text-primary"
      >
        v{{ latestVersion }} is available.
      </p>
      <UpdateStatus size="sm" />
    </div>
  </section>
</template>

<script lang="ts" setup>
// In-app updates — shares the singleton state with the footer pill + auto-prompt modal.
const appVersion = useRuntimeConfig().public.version as string;
const {
  status: updateStatus,
  latestVersion,
  errorKind: updateErrorKind,
  updatePlatform,
  isUpdateAvailable,
  isBusy: updateBusy,
  checkForUpdate,
  downloadAndInstall,
} = useAppUpdate();

const updateActionLabel = computed(() => {
  if (updateStatus.value === 'error' && updateErrorKind.value !== 'permission') return 'Try again';
  if (updatePlatform.value === 'android') return updateStatus.value === 'available' ? 'Download & install' : 'Install';
  return 'Update & restart';
});
</script>
