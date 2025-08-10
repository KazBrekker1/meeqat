<template>
  <div class="flex min-h-screen">
    <UCard class="grid grid-rows-[auto_1fr_auto] w-full rounded-none">
      <template #header>
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
            icon="heroicons:building-office-2-20-solid"
          >
            Load
          </UButton>
        </div>

        <div v-if="fetchError" class="text-red-600">{{ fetchError }}</div>

        <div v-if="timingsList.length" class="grid grid-cols-2 gap-3">
          <UAlert
            v-for="t in timingsList"
            :key="t.key"
            class="flex items-center justify-between p-3 rounded"
            :variant="t.isPast ? 'outline' : 'subtle'"
            :color="t.isNext ? 'primary' : 'neutral'"
          >
            <template #description>
              <div class="grid items-center grid-cols-3 gap-2 tabular-nums">
                <span class="font-medium">{{ t.label }}</span>
                <span>{{ t.time }}</span>
                <span v-if="t.altTime" class="text-xs text-gray-500">
                  {{ t.altTime }}
                </span>
              </div>
            </template>
          </UAlert>
        </div>
      </div>

      <template #footer>
        <div class="flex items-center justify-between">
          <div
            class="flex items-center gap-2 text-sm text-gray-500 tabular-nums"
            v-if="nextPrayerLabel && countdownToNext"
          >
            <UButton
              color="error"
              variant="soft"
              size="xs"
              :disabled="isLoading"
              @click="onClearCache"
              icon="heroicons:trash-20-solid"
            >
              Clear Cache
            </UButton>
            <USeparator orientation="vertical" class="h-4" />
            <ColorToggle />
            <UButton
              size="xs"
              variant="ghost"
              @click="
                () => {
                  timeFormat = timeFormat === '24h' ? '12h' : '24h';
                }
              "
            >
              {{ timeFormat === "24h" ? "12h" : "24h" }}
            </UButton>
            <USeparator orientation="vertical" class="h-4" />
            <span>{{ nextPrayerLabel }} in {{ countdownToNext }}</span>
            <UButton
              v-if="isAthanActive"
              size="xs"
              variant="ghost"
              color="error"
              @click="onDismissAthan"
              icon="heroicons:x-mark-20-solid"
            >
              Dismiss
            </UButton>
          </div>
          <div class="flex items-center gap-2">
            <span
              class="text-sm text-gray-500"
              v-if="selectedCity || selectedCountry"
            >
              Location: {{ selectedCity || "—" }},
              {{ selectedCountryName || selectedCountry }}
            </span>
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
  testPlayAthan,
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

const timeFormatOptions = [
  { label: "24-hour", value: "24h" },
  { label: "12-hour", value: "12h" },
];

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

// Push updates to the tray via Tauri event bus
watch(
  [gregorianDateVerbose, hijriDateVerbose, nextPrayerLabel, countdownToNext],
  async () => {
    try {
      const dateLineParts: string[] = [];
      if (hijriDateVerbose.value)
        dateLineParts.push(`Hijri date: ${hijriDateVerbose.value}`);
      if (gregorianDateVerbose.value)
        dateLineParts.push(`Gregorian date: ${gregorianDateVerbose.value}`);
      const dateLine = dateLineParts.length
        ? dateLineParts.join(" | ")
        : undefined;

      const hasCountdown = Boolean(
        nextPrayerLabel.value && countdownToNext.value
      );
      const countdownLine = hasCountdown
        ? `Next prayer: ${nextPrayerLabel.value} in ${countdownToNext.value}`
        : undefined;
      const title = hasCountdown
        ? `${nextPrayerLabel.value} ${countdownToNext.value}`
        : null;

      await emit("meeqat:tray:update", {
        dateLine,
        countdownLine,
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
