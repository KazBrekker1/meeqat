<template>
  <div class="flex min-h-screen">
    <UCard class="w-full rounded-none">
      <template #header>
        <div class="flex items-center justify-between">
          <h1 class="text-xl font-semibold">Prayer Times</h1>
          <div class="flex items-center gap-2">
            <UBadge variant="solid" color="primary" class="tabular-nums">
              {{ currentTimeString }}
            </UBadge>
          </div>
          <div class="text-sm text-gray-500 space-y-0.5">
            <p v-if="dateReadable">{{ dateReadable }}</p>
            <p v-if="hijriDateVerbose">{{ hijriDateVerbose }}</p>
          </div>
        </div>
      </template>

      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <USelectMenu
            v-model="selectedMethodId"
            :items="methodSelectOptions"
            placeholder="Select method"
            label-key="label"
            value-key="value"
          />
          <USelectMenu
            v-model="selectedExtraTimezone"
            :items="timezoneSelectOptions"
            placeholder="Display timezone (optional)"
            label-key="label"
            value-key="value"
            @update:model-value="onExtraTimezoneChange"
          />
        </div>

        <div class="grid grid-cols-[1fr_1fr_auto] gap-3">
          <USelectMenu
            v-model="selectedCountry"
            :items="countrySelectOptions"
            label-key="label"
            value-key="value"
            placeholder="Country"
            @update:model-value="onCountryChange"
          />
          <USelectMenu
            v-model="selectedCity"
            :items="citySelectOptions"
            label-key="label"
            value-key="value"
            :disabled="!selectedCountry"
            placeholder="City"
            @update:model-value="onCityChange"
          />
          <UButton
            :loading="isLoading"
            @click="onFetchByCity"
            icon="i-heroicons-building-office-2-20-solid"
            block
          >
            Fetch by City
          </UButton>
        </div>

        <div v-if="fetchError" class="text-red-600">{{ fetchError }}</div>

        <div v-if="timingsList.length" class="grid grid-cols-2 gap-3">
          <div
            v-for="t in timingsList"
            :key="t.key"
            class="flex items-center justify-between p-3 rounded border"
            :class="{
              'opacity-60 text-gray-500': t.isPast,
              'border-primary-400': t.isNext,
            }"
          >
            <span class="font-medium">{{ t.label }}</span>
            <span class="tabular-nums flex items-center gap-2">
              <span>{{ t.time }}</span>
              <span v-if="t.altTime" class="text-xs text-gray-500">
                [{{ t.altTime }} in {{ selectedExtraTimezone }}]
              </span>
            </span>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex items-center justify-between gap-3">
          <div
            class="text-sm text-gray-500 flex items-center gap-2 tabular-nums"
            v-if="nextPrayerLabel && countdownToNext"
          >
            <span>{{ nextPrayerLabel }} in {{ countdownToNext }}</span>
            <UButton
              v-if="isAthanActive"
              size="xs"
              variant="ghost"
              color="error"
              @click="onDismissAthan"
              icon="i-heroicons-x-mark-20-solid"
            >
              Dismiss
            </UButton>
          </div>
          <div
            class="text-sm text-gray-500"
            v-if="selectedCity || selectedCountry"
          >
            Location: {{ selectedCity || "—" }},
            {{ selectedCountryName || selectedCountry }}
          </div>
        </div>
      </template>
    </UCard>
  </div>
</template>

<script lang="ts" setup>
import { METHOD_OPTIONS, type MethodOption } from "@/constants/methods";
import { COUNTRY_OPTIONS, type CountryOption } from "@/constants/countries";
import { COUNTRY_TO_CITIES } from "@/constants/cities";

const {
  isLoading,
  fetchError,
  timingsList,
  dateReadable,
  currentTimeString,
  fetchPrayerTimingsByCity,
  selectedMethodId,
  selectedCity,
  selectedCountry,
  loadPreferences,
  selectedExtraTimezone,
  userTimezone,
  hijriDateVerbose,
  testPlayAthan,
  isAthanActive,
  dismissAthan,
  nextPrayerLabel,
  countdownToNext,
  clearTimings,
} = usePrayerTimes();

const methodSelectOptions = computed(() =>
  METHOD_OPTIONS.map((m: MethodOption) => ({
    label: `${m.value} - ${m.label}`,
    value: m.value,
  }))
);
const countrySelectOptions = computed(() =>
  COUNTRY_OPTIONS.map((c: CountryOption) => ({
    label: c.name,
    value: c.code,
  }))
);

const citySelectOptions = computed(() => {
  const base = COUNTRY_TO_CITIES[selectedCountry.value] ?? [];
  const set = new Set(base);
  if (selectedCity.value && !set.has(selectedCity.value)) {
    set.add(selectedCity.value);
  }
  return Array.from(set).map((name) => ({ label: name, value: name }));
});

const selectedCountryName = computed(() => {
  const found = COUNTRY_OPTIONS.find((c) => c.code === selectedCountry.value);
  return found?.name ?? "";
});

const timezoneSelectOptions = computed(() => {
  const zones: string[] = [
    "UTC",
    "Europe/London",
    "Europe/Paris",
    "Africa/Cairo",
    "Asia/Riyadh",
    "Asia/Dubai",
    "Asia/Qatar",
    "Asia/Kuwait",
    "Asia/Doha",
    "Africa/Casablanca",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
  ];
  const items = zones.map((z) => ({ label: z, value: z }));
  items.unshift({
    label: `Use my timezone (${userTimezone.value})`,
    value: userTimezone.value,
  });
  return items;
});

function onFetchByCity() {
  if (!selectedCity.value || !selectedCountry.value) return;
  fetchPrayerTimingsByCity(selectedCity.value, selectedCountry.value, {
    methodId: selectedMethodId.value,
  });
}

function onCountryChange() {
  selectedCity.value = "";
  clearTimings();
}

function onExtraTimezoneChange(val: string) {
  selectedExtraTimezone.value = val;
}

function onCityChange() {
  clearTimings();
}

function onTestAthan() {
  testPlayAthan();
}

function onDismissAthan() {
  dismissAthan();
}

onMounted(async () => {
  await loadPreferences();
  if (selectedCity.value && selectedCountry.value) {
    onFetchByCity();
  }
});
</script>

<style></style>
