<template>
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-semibold">Prayer Times</h1>
    <div class="flex items-center gap-2">
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
    <div class="text-sm text-gray-500 space-y-0.5">
      <p v-if="gregorianDateVerbose">{{ gregorianDateVerbose }}</p>
      <p v-if="hijriDateVerbose">{{ hijriDateVerbose }}</p>
    </div>
  </div>
</template>

<script lang="ts" setup>
defineProps<{
  currentTimeString: string;
  gregorianDateVerbose?: string;
  hijriDateVerbose?: string;
}>();
</script>

<style scoped></style>
