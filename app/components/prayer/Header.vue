<template>
  <div
    class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
  >
    <h1 class="text-xl font-semibold">Prayer Times</h1>
    <div class="flex items-center gap-2 order-2 sm:order-none">
      <UBadge
        variant="subtle"
        color="primary"
        size="lg"
        icon="heroicons:clock-20-solid"
        class="tabular-nums rounded-sm px-3 py-1.5 text-base font-semibold shadow-sm"
      >
        {{ currentTimeString }}
      </UBadge>
    </div>
  </div>
</template>

<script lang="ts" setup>
defineProps<{
  currentTimeString: string;
}>();
</script>

<style scoped></style>
