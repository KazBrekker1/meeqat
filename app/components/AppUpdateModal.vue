<script setup lang="ts">
import { platform } from "@tauri-apps/plugin-os";
import { isTauriAvailable } from "@/utils/store";

const open = defineModel<boolean>("open", { default: false });

const {
  status,
  latestVersion,
  releaseNotes,
  downloadProgress,
  errorMessage,
  downloadAndInstall,
} = useAppUpdate();

const isAndroid = computed(() => {
  if (!isTauriAvailable()) return false;
  try {
    return platform() === "android";
  } catch {
    return false;
  }
});

const busy = computed(
  () => status.value === "downloading" || status.value === "installing"
);

// On desktop the app restarts itself; on Android the OS installer takes over.
const installLabel = computed(() =>
  isAndroid.value ? "Download & install" : "Update & restart"
);

function later() {
  if (busy.value) return;
  open.value = false;
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Update available"
    :description="latestVersion ? `Meeqat v${latestVersion} is ready to install` : undefined"
    :dismissible="!busy"
  >
    <template #body>
      <div class="space-y-4">
        <!-- Release notes -->
        <div
          v-if="releaseNotes"
          class="max-h-40 overflow-y-auto rounded-lg bg-white/5 p-3 text-sm text-white/70 whitespace-pre-line"
        >
          {{ releaseNotes }}
        </div>

        <!-- Download progress (desktop) -->
        <div v-if="status === 'downloading'" class="space-y-2">
          <div class="flex items-center justify-between text-sm text-white/70">
            <span>Downloading…</span>
            <span>{{ downloadProgress }}%</span>
          </div>
          <UProgress :model-value="downloadProgress" :max="100" />
        </div>

        <!-- Installing -->
        <div
          v-else-if="status === 'installing'"
          class="flex items-center gap-2 text-sm text-white/70"
        >
          <UIcon name="lucide:loader-circle" class="size-4 animate-spin" />
          <span v-if="isAndroid">Opening the installer…</span>
          <span v-else>Installing — the app will restart shortly.</span>
        </div>

        <!-- Error -->
        <div
          v-else-if="status === 'error'"
          class="flex items-start gap-2 rounded-lg bg-error/10 p-3 text-sm text-error"
        >
          <UIcon name="lucide:triangle-alert" class="mt-0.5 size-4 shrink-0" />
          <span>{{ errorMessage || "Something went wrong. Please try again." }}</span>
        </div>

        <p v-if="isAndroid && status === 'available'" class="text-xs text-white/40">
          You’ll be asked to confirm the install in a system dialog.
        </p>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          :label="busy ? 'Please wait…' : 'Later'"
          :disabled="busy"
          @click="later"
        />
        <UButton
          color="primary"
          icon="lucide:download"
          :label="installLabel"
          :loading="busy"
          :disabled="busy || status === 'error'"
          @click="downloadAndInstall"
        />
      </div>
    </template>
  </UModal>
</template>
