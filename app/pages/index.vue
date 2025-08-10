<template>
  <div class="flex min-h-screen">
    <UCard class="grid grid-rows-[auto_1fr_auto] w-full rounded-none">
      <template #header>
        <PrayerHeader
          :current-time-string="currentTimeString"
          :gregorian-date-verbose="gregorianDateVerbose || undefined"
          :hijri-date-verbose="hijriDateVerbose || undefined"
        />
      </template>

      <div class="space-y-4">
        <PrayerSelectors
          :method-select-options="methodSelectOptions"
          :timezone-select-options="timezoneSelectOptions"
          v-model:selected-method-id="selectedMethodId"
          v-model:selected-extra-timezone="selectedExtraTimezone"
        />

        <PrayerLocationControls
          v-model:selected-country="selectedCountry"
          v-model:selected-city="selectedCity"
          :country-select-options="countrySelectOptions"
          :city-select-options="citySelectOptions"
          :loading="isLoading"
          @country-change="onCountryChange"
          @fetch-by-city="onFetchByCity"
        />

        <div v-if="fetchError" class="text-red-600">{{ fetchError }}</div>

        <PrayerTimingsList :timings-list="timingsList" />
      </div>

      <template #footer>
        <PrayerFooter
          :next-prayer-label="nextPrayerLabel || undefined"
          :countdown-to-next="countdownToNext || undefined"
          :is-loading="isLoading"
          :is-athan-active="isAthanActive"
          :selected-city="selectedCity"
          :selected-country="selectedCountry"
          :selected-country-name="selectedCountryName"
          :time-format="timeFormat"
          @clear-cache="onClearCache"
          @toggle-time-format="
            () => (timeFormat = timeFormat === '24h' ? '12h' : '24h')
          "
          @dismiss-athan="onDismissAthan"
        />
      </template>
    </UCard>
  </div>
</template>

<script lang="ts" setup>
import { METHOD_OPTIONS, type MethodOption } from "@/constants/methods";
import { COUNTRY_OPTIONS, type CountryOption } from "@/constants/countries";
import { COUNTRY_TO_CITIES } from "@/constants/cities";
import { emit } from "@tauri-apps/api/event";

const { confirm } = useConfirm();

const {
  isLoading,
  fetchError,
  timingsList,
  gregorianDateVerbose,
  currentTimeString,
  fetchPrayerTimingsByCity,
  selectedMethodId,
  selectedCity,
  selectedCountry,
  loadPreferences,
  selectedExtraTimezone,
  userTimezone,
  hijriDateVerbose,
  isAthanActive,
  dismissAthan,
  nextPrayerLabel,
  countdownToNext,
  clearTimings,
  clearCache,
  timeFormat,
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
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch (error) {
    console.error(error);
    zones = [
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
  }
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
}

function onDismissAthan() {
  dismissAthan();
}

async function onClearCache() {
  if (
    await confirm({
      title: "Clear Cache",
      message: `Are you sure you want to clear the cache? You have ${timingsList.value.length} cached items.`,
      description: "Are you sure you want to clear the cache?",
      confirmColor: "error",
    })
  ) {
    clearCache();
    clearTimings();
  }
}

onMounted(async () => {
  await loadPreferences();
  if (selectedCity.value && selectedCountry.value) {
    onFetchByCity();
  }
});

watch([selectedMethodId, selectedCity, selectedCountry], () => {
  clearTimings();
});

// Push updates to the tray via Tauri event bus
watch(
  [gregorianDateVerbose, hijriDateVerbose, nextPrayerLabel, countdownToNext],
  async () => {
    try {
      const dateLineParts: string[] = [];
      if (hijriDateVerbose.value)
        dateLineParts.push(`Hijri: ${hijriDateVerbose.value}`);
      if (gregorianDateVerbose.value)
        dateLineParts.push(`Gregorian: ${gregorianDateVerbose.value}`);
      const dateLine = dateLineParts.join(" | ");

      const title = `${nextPrayerLabel.value} in ${countdownToNext.value}`;

      await emit("meeqat:tray:update", {
        dateLine,
        title,
      });
    } catch {
      // ignore emit errors in non-tauri/web
    }
  },
  { immediate: true }
);
</script>

<style></style>
