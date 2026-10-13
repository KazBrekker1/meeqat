<template>
  <footer class="shrink-0 flex items-center justify-center gap-2 py-1 text-[10px] text-white/30 border-t border-white/5 pb-safe">
    <MeeqatMark class="size-2.5 opacity-60" />
    <span>Meeqat v{{ appVersion }}</span>
    <NuxtLink to="/privacy" class="hover:text-white/60">Privacy</NuxtLink>
    <button
      v-if="isUpdateAvailable"
      type="button"
      class="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-primary hover:bg-primary/25 transition-colors"
      @click="showUpdateModal = true"
    >
      <UIcon
        :name="updateStatus === 'downloading' ? 'lucide:loader-circle' : updateStatus === 'error' ? 'lucide:triangle-alert' : 'lucide:arrow-up-circle'"
        class="size-3"
        :class="updateStatus === 'downloading' && 'animate-spin'"
      />
      <span>{{ updatePillLabel }}</span>
    </button>
  </footer>

  <!-- Update Modal -->
  <AppUpdateModal v-model:open="showUpdateModal" />
</template>

<script lang="ts" setup>
// App version for the footer (from package.json via runtimeConfig).
const appVersion = useRuntimeConfig().public.version;

// In-app updater: checks quietly on launch and every few hours; surfaces a pill in the footer.
const {
  status: updateStatus,
  isUpdateAvailable,
  latestVersion,
  downloadProgress,
  progressKnown,
  startUpdateChecks,
  shouldPromptFor,
} = useAppUpdate();
const showUpdateModal = shallowRef(false);
const updatePillLabel = computed(() => {
  switch (updateStatus.value) {
    case "downloading": return progressKnown.value ? `Downloading ${downloadProgress.value}%` : "Downloading…";
    case "installing": return "Installing…";
    case "ready": return "Finish installing";
    case "error": return "Update failed";
    default: return `Update to v${latestVersion.value}`;
  }
});

onMounted(() => {
  // Quietly check for a newer release; the footer pill appears only if one exists.
  startUpdateChecks();
});

// Open the update dialog by itself once per release. The footer pill stays as the
// reminder if the user picks "Later" — re-checks never re-open it.
watch(isUpdateAvailable, (available) => {
  if (available && latestVersion.value && shouldPromptFor(latestVersion.value)) {
    showUpdateModal.value = true;
  }
});
</script>
