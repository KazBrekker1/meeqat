<template>
  <div class="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3">
    <USelectMenu
      v-model="selectedCountryModel"
      :items="countrySelectOptions"
      @update:model-value="$emit('country-change')"
      label-key="label"
      value-key="value"
      placeholder="Country"
    />
    <USelectMenu
      v-model="selectedCityModel"
      :items="citySelectOptions"
      @update:model-value="$emit('city-change')"
      label-key="label"
      value-key="value"
      :disabled="!selectedCountryModel"
      placeholder="City"
    />
    <UButton
      :loading
      @click="$emit('fetch-by-city')"
      icon="heroicons:building-office-2-20-solid"
      label="Load"
    />
  </div>
</template>

<script lang="ts" setup>
const props = defineProps<{
  countrySelectOptions: { label: string; value: string }[];
  citySelectOptions: { label: string; value: string }[];
  loading?: boolean;
}>();

defineEmits<{
  (e: "country-change"): void;
  (e: "city-change"): void;
  (e: "fetch-by-city"): void;
}>();

const selectedCountryModel = defineModel<string>("selectedCountry", {
  required: true,
});
const selectedCityModel = defineModel<string>("selectedCity", {
  required: true,
});

const loading = computed(() => !!props.loading);
</script>

<style scoped></style>
