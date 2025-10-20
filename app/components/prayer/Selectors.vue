<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
    <USelectMenu
      v-model="selectedMethodIdModel"
      :items="methodSelectOptions"
      placeholder="Select method"
      label-key="label"
      value-key="value"
    />
    <USelectMenu
      v-model="selectedExtraTimezoneModel"
      :items="timezoneSelectOptions"
      placeholder="Display timezone (optional)"
      label-key="label"
      value-key="value"
    />
  </div>
</template>

<script lang="ts" setup>
defineProps<{
  methodSelectOptions: { label: string; value: number }[];
  timezoneSelectOptions: { label: string; value: string }[];
}>();

const selectedMethodIdModel = defineModel<number>("selectedMethodId", {
  required: true,
});
const selectedExtraTimezoneModel = defineModel<string>(
  "selectedExtraTimezone",
  { default: "" }
);
</script>
