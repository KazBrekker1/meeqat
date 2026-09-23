<script setup lang="ts">
import { formatMegabytes } from "@/utils/format";

// The in-flight part of the update flow (download, install, hand-off, failure),
// shared by the update dialog and the Settings → Updates section.
defineProps<{ size?: "sm" | "md" }>();

const {
  status,
  downloadProgress,
  progressKnown,
  downloadedBytes,
  totalBytes,
  errorMessage,
  errorKind,
  updatePlatform,
} = useAppUpdate();
</script>

<template>
  <div v-if="status === 'downloading'" class="space-y-1.5" role="status" aria-live="polite">
    <div class="flex items-center justify-between text-muted" :class="size === 'sm' ? 'text-xs' : 'text-sm'">
      <span>Downloading…</span>
      <span class="tabular-nums">
        <template v-if="progressKnown">{{ formatMegabytes(downloadedBytes) }} of {{ formatMegabytes(totalBytes!) }} · {{ downloadProgress }}%</template>
        <template v-else-if="downloadedBytes">{{ formatMegabytes(downloadedBytes) }}</template>
      </span>
    </div>
    <!-- Indeterminate when the size is unknown, so it never sits frozen at 0%. -->
    <UProgress :model-value="progressKnown ? downloadProgress : null" :max="100" :size="size === 'sm' ? 'sm' : 'md'" />
  </div>

  <p
    v-else-if="status === 'installing'"
    class="flex items-center gap-2 text-muted"
    :class="size === 'sm' ? 'text-xs' : 'text-sm'"
    role="status"
  >
    <UIcon name="lucide:loader-circle" class="size-4 shrink-0 animate-spin" />
    Installing. Meeqat will restart in a moment.
  </p>

  <div
    v-else-if="status === 'ready'"
    class="flex items-start gap-2 rounded-lg bg-success/10 p-3 text-success"
    :class="size === 'sm' ? 'text-xs' : 'text-sm'"
    role="status"
  >
    <UIcon name="lucide:circle-check" class="mt-0.5 size-4 shrink-0" />
    <span>Downloaded. Confirm the install in the system dialog. If you closed it, tap Install to open it again.</span>
  </div>

  <div
    v-else-if="status === 'error'"
    class="flex items-start gap-2 rounded-lg p-3"
    :class="[
      errorKind === 'permission' ? 'bg-warning/10 text-warning' : 'bg-error/10 text-error',
      size === 'sm' ? 'text-xs' : 'text-sm',
    ]"
    role="alert"
  >
    <UIcon :name="errorKind === 'permission' ? 'lucide:shield-alert' : 'lucide:triangle-alert'" class="mt-0.5 size-4 shrink-0" />
    <span>{{ errorMessage }}</span>
  </div>

  <p v-else-if="status === 'available' && updatePlatform === 'android'" class="text-xs text-muted">
    Android will ask you to confirm the install.
  </p>
</template>
