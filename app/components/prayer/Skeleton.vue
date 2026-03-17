<template>
  <div class="rounded-xl border border-[var(--ui-border)] overflow-hidden divide-y divide-[var(--ui-border)]">
    <div v-for="i in count" :key="i" class="flex items-center gap-2.5 px-3 py-2">
      <div class="w-1 h-6 bg-[var(--ui-bg-elevated)] rounded-full animate-pulse" />
      <div class="h-3.5 w-14 bg-[var(--ui-bg-elevated)] rounded animate-pulse flex-1" />
      <div class="h-3.5 w-16 bg-[var(--ui-bg-elevated)] rounded animate-pulse" />
      <div class="h-3.5 w-3.5 bg-[var(--ui-bg-elevated)] rounded animate-pulse" />
    </div>
  </div>
</template>

<script lang="ts" setup>
withDefaults(defineProps<{
  count?: number;
}>(), {
  count: 6,
});
</script>
