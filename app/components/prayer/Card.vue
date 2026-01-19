<template>
  <div
    class="prayer-card relative rounded-lg transition-all duration-150"
    :class="[
      cardStateClasses,
      { 'hover:translate-y-[-1px] hover:shadow-md cursor-default': !isPast }
    ]"
  >
    <!-- L-shaped accent border for next prayer -->
    <div
      v-if="isNext"
      class="absolute inset-0 rounded-lg pointer-events-none"
      :class="accentBorderClasses"
    />

    <div class="relative flex flex-col items-center justify-center py-3 px-4 text-center">
      <span class="text-sm font-medium mb-1" :class="labelClasses">{{ label }}</span>
      <span class="font-bold tabular-nums" :class="timeClasses">{{ time }}</span>
      <span v-if="altTime" class="text-xs text-muted tabular-nums mt-0.5">
        {{ altTime }}
      </span>
    </div>
  </div>
</template>

<script lang="ts" setup>
const props = defineProps<{
  label: string;
  time: string;
  altTime?: string;
  isPast?: boolean;
  isNext?: boolean;
}>();

const cardStateClasses = computed(() => {
  if (props.isNext) {
    return 'bg-[var(--ui-color-primary-50)] dark:bg-[var(--ui-color-primary-950)]';
  }
  if (props.isPast) {
    return 'bg-transparent border border-[var(--ui-border)] opacity-60';
  }
  return 'bg-[var(--ui-bg-elevated)] border border-[var(--ui-border)]';
});

const accentBorderClasses = computed(() => {
  if (props.isNext) {
    return 'border-t-[3px] border-l-[3px] border-t-[var(--ui-color-primary-500)] border-l-[var(--ui-color-primary-500)] border-r-0 border-b-0';
  }
  return '';
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
    return 'text-[var(--ui-color-primary-600)] dark:text-[var(--ui-color-primary-400)] text-lg';
  }
  if (props.isPast) {
    return 'text-muted';
  }
  return 'text-base';
});
</script>

<style scoped>
.prayer-card {
  contain: layout style;
}
</style>
