<template>
  <div
    class="prayer-row flex items-center gap-2.5 px-3 py-2"
    :class="rowClasses"
  >
    <!-- Left accent bar -->
    <div
      class="w-1 self-stretch rounded-full shrink-0"
      :class="accentClasses"
    />

    <!-- Prayer name -->
    <span class="text-xs font-medium flex-1 min-w-0 truncate" :class="labelClasses">
      {{ label }}
    </span>

    <!-- Description (optional) -->
    <span v-if="description" class="text-xs text-muted hidden sm:inline">
      {{ description }}
    </span>

    <!-- Alt time -->
    <span v-if="altTime" class="text-xs tabular-nums text-muted">
      {{ altTime }}
    </span>

    <!-- Time -->
    <span class="text-xs font-semibold tabular-nums" :class="timeClasses">
      {{ time }}
    </span>

    <!-- Status icon -->
    <UIcon
      v-if="isNext"
      name="lucide:chevron-right"
      class="size-3.5 text-[var(--ui-color-primary-500)] shrink-0"
    />
    <UIcon
      v-else-if="isPast"
      name="lucide:check"
      class="size-3.5 text-muted shrink-0"
    />
    <div v-else class="size-3.5 shrink-0" />
  </div>
</template>

<script lang="ts" setup>
const props = defineProps<{
  label: string;
  time: string;
  altTime?: string;
  isPast?: boolean;
  isNext?: boolean;
  description?: string;
}>();

const rowClasses = computed(() => {
  if (props.isNext) {
    return 'bg-[var(--ui-color-primary-50)] dark:bg-[var(--ui-color-primary-950)]';
  }
  if (props.isPast) {
    return 'opacity-50';
  }
  return '';
});

const accentClasses = computed(() => {
  if (props.isNext) {
    return 'bg-[var(--ui-color-primary-500)]';
  }
  if (props.isPast) {
    return 'bg-[var(--ui-text-dimmed)]';
  }
  return 'bg-transparent';
});

const labelClasses = computed(() => {
  if (props.isNext) {
    return 'text-[var(--ui-color-primary-700)] dark:text-[var(--ui-color-primary-300)]';
  }
  if (props.isPast) {
    return 'text-muted';
  }
  return '';
});

const timeClasses = computed(() => {
  if (props.isNext) {
    return 'text-[var(--ui-color-primary-600)] dark:text-[var(--ui-color-primary-400)]';
  }
  if (props.isPast) {
    return 'text-muted';
  }
  return '';
});
</script>
