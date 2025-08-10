<template>
  <div class="grid grid-cols-[1fr_1fr_auto] gap-3">
    <USelectMenu
      v-model="selectedCountryModel"
      :items="countrySelectOptions"
      label-key="label"
      value-key="value"
      placeholder="Country"
    />
    <USelectMenu
      v-model="selectedCityModel"
      :items="citySelectOptions"
      label-key="label"
      value-key="value"
      :disabled="!selectedCountryModel"
      placeholder="City"
    />
    <UButton
      :loading="loading"
      @click="$emit('fetch-by-city')"
      icon="heroicons:building-office-2-20-solid"
    >
      Load
    </UButton>
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
