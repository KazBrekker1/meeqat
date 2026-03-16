<template>
  <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
    <div
      v-for="i in count"
      :key="i"
      class="rounded-lg border border-[var(--ui-border)] py-3 px-4 flex flex-col items-center"
    >
      <div class="h-4 w-14 bg-[var(--ui-bg-elevated)] rounded animate-pulse mb-1" />
      <div class="h-6 w-16 bg-[var(--ui-bg-elevated)] rounded animate-pulse" />
    </div>
  </div>
</template>

<script lang="ts" setup>
defineProps<{
  count?: number;
}>();
</script>
