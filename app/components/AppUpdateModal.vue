<script setup lang="ts">
const open = defineModel<boolean>("open", { default: false });

const {
  status,
  latestVersion,
  releaseNotes,
  errorKind,
  updatePlatform,
  isBusy,
  downloadAndInstall,
} = useAppUpdate();

const title = computed(() => {
  switch (status.value) {
    case "downloading": return "Downloading update";
    case "installing": return "Installing update";
    case "ready": return "Ready to install";
    case "error": return errorKind.value === "permission" ? "Allow installs" : "Update failed";
    default: return "Update available";
  }
});

const actionLabel = computed(() => {
  if (status.value === "error" && errorKind.value !== "permission") return "Try again";
  if (updatePlatform.value === "android") return status.value === "available" ? "Download & install" : "Install";
  return "Update & restart";
});

// Nothing left to do on desktop once installing; Android keeps Install for the system dialog.
const showAction = computed(() => status.value !== "installing");

// Hiding mid-download is fine: it carries on and the footer pill shows its progress.
const dismissLabel = computed(() =>
  isBusy.value ? "Hide" : status.value === "ready" ? "Close" : "Later"
);

function close() {
  open.value = false;
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="title"
    :description="latestVersion ? `Meeqat v${latestVersion}` : undefined"
  >
    <template #body>
      <div class="space-y-4">
        <div
          v-if="releaseNotes && status !== 'error'"
          class="max-h-40 overflow-y-auto rounded-lg bg-white/5 p-3 text-sm text-white/70 whitespace-pre-line"
        >
          {{ releaseNotes }}
        </div>
        <UpdateStatus />
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          :label="dismissLabel"
          @click="close"
        />
        <UButton
          v-if="showAction"
          color="primary"
          :icon="status === 'error' && errorKind !== 'permission' ? 'lucide:rotate-cw' : 'lucide:download'"
          :label="actionLabel"
          :loading="status === 'downloading'"
          :disabled="isBusy"
          @click="downloadAndInstall"
        />
      </div>
    </template>
  </UModal>
</template>
