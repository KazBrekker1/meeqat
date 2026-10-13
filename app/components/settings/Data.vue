<template>
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
        @click="onClearCache"
      >
        Clear
      </UButton>
    </div>
  </section>
</template>

<script lang="ts" setup>
const { isLoading, clearCache, clearTimings } = usePrayerRuntime();
const { confirm } = useConfirm();
const toast = useToast();

async function onClearCache() {
  if (
    await confirm({
      title: "Clear Cache",
      message: "Are you sure you want to clear the cache?",
      description: "This will remove all cached prayer times.",
      confirmColor: "error",
    })
  ) {
    await clearCache();
    clearTimings();
    toast.add({
      title: "Cache Cleared",
      description: "All cached prayer times have been removed.",
      color: "success",
      icon: "heroicons:check-circle-20-solid",
    });
  }
}
</script>
