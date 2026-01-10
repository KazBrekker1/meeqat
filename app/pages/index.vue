<template>
  <div class="flex flex-col h-screen w-full">
    <!-- Sticky Header -->
    <header class="sticky top-0 z-10 bg-[var(--ui-bg)] border-b border-[var(--ui-border)] pt-[env(safe-area-inset-top)]">
      <div class="p-4">
        <PrayerHeader :current-time-string="currentTimeString" />
      </div>
    </header>

    <!-- Scrollable Content -->
    <main class="flex-1 overflow-y-auto p-4">
      <section class="space-y-5">
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

        <Transition
          enter-active-class="transition duration-200 ease-out"
          enter-from-class="opacity-0 -translate-y-1"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition duration-150 ease-in"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 -translate-y-1"
        >
          <UAlert
            v-if="isOffline || isStale"
            :color="isOffline ? 'warning' : 'info'"
            variant="subtle"
            :icon="isOffline ? 'lucide:wifi-off' : 'lucide:refresh-cw'"
            :title="isOffline ? 'You are offline' : 'Refreshing data...'"
            :description="
              isOffline
                ? 'Showing cached prayer times. Data will refresh when you reconnect.'
                : 'Showing cached data while fetching latest prayer times.'
            "
          />
        </Transition>

        <PrayerTimingsList :timings-list="timingsList" />

        <Transition
          enter-active-class="transition duration-200 ease-out"
          enter-from-class="opacity-0 -translate-y-2"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition duration-150 ease-in"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 -translate-y-2"
        >
          <div v-if="showCalendar" class="space-y-3">
            <!-- Calendar controls bar -->
            <div class="flex items-center gap-2">
              <UFieldGroup size="xs">
                <UButton
                  :variant="calendarSystem === 'islamic' ? 'solid' : 'outline'"
                  @click="toggleCalendarSystem"
                  label="Hijri"
                  icon="lucide:moon"
                />
                <UButton
                  :variant="
                    calendarSystem === 'gregorian' ? 'solid' : 'outline'
                  "
                  @click="toggleCalendarSystem"
                  label="Gregorian"
                  icon="lucide:sun"
                />
              </UFieldGroup>
              <UButton
                v-if="!isToday"
                @click="selectToday"
                label="Today"
                size="xs"
                variant="soft"
                icon="lucide:calendar-check"
              />
            </div>

            <UCalendar v-model="calendarDate">
              <template #day="{ day }">
                <UTooltip :text="formatTooltip(day)" :delay-duration="0">
                  <span>{{ day.day }}</span>
                </UTooltip>
              </template>
            </UCalendar>
          </div>
        </Transition>
      </section>
    </main>

    <!-- Sticky Footer -->
    <footer class="sticky bottom-0 z-10 bg-[var(--ui-bg)] border-t border-[var(--ui-border)] pb-[env(safe-area-inset-bottom)]">
      <div class="p-4">
        <PrayerFooter
          :is-calendar-shown="showCalendar"
          @toggle-calendar="showCalendar = !showCalendar"
          :next-prayer-label="nextPrayerLabel || undefined"
          :countdown-to-next="countdownToNext || undefined"
          :previous-prayer-label="previousPrayerLabel || undefined"
          :time-since-previous="timeSincePrevious || undefined"
          :is-loading="isLoading"
          :time-format="timeFormat"
          :test-play-athan="testPlayAthan"
          :is-athan-active="isAthanActive"
          :dismiss-athan="dismissAthan"
          :on-test-notification-click="onTestNotificationClick"
          @clear-cache="onClearCache"
          @toggle-time-format="
            () => (timeFormat = timeFormat === '24h' ? '12h' : '24h')
          "
        />
      </div>
    </footer>
  </div>
</template>

<script lang="ts" setup>
import { COUNTRY_TO_CITIES } from "@/constants/cities";
import { COUNTRY_OPTIONS, type CountryOption } from "@/constants/countries";
import { METHOD_OPTIONS, type MethodOption } from "@/constants/methods";
import { computePreviousPrayerInfo, pad2 } from "@/utils/time";
import { MAIN_PRAYER_KEYS_SET } from "@/constants/prayers";
import type { DateValue, CalendarDate } from "@internationalized/date";
import {
  DateFormatter,
  getLocalTimeZone,
  GregorianCalendar,
  IslamicUmalquraCalendar,
  toCalendar,
  today,
} from "@internationalized/date";
import { emit } from "@tauri-apps/api/event";

const timeZone = getLocalTimeZone();
const islamicDate = shallowRef(
  toCalendar(today(timeZone), new IslamicUmalquraCalendar())
);
const gregorianDate = shallowRef(
  toCalendar(today(timeZone), new GregorianCalendar())
);

const calendarSystem = shallowRef<"islamic" | "gregorian">("islamic");

const calendarDate = computed<CalendarDate>({
  get() {
    return calendarSystem.value === "islamic"
      ? (islamicDate.value as CalendarDate)
      : (gregorianDate.value as CalendarDate);
  },
  set(val: CalendarDate) {
    if (calendarSystem.value === "islamic") {
      islamicDate.value = toCalendar(val, new IslamicUmalquraCalendar());
    } else {
      gregorianDate.value = toCalendar(val, new GregorianCalendar());
    }
  },
});

const gregorianFormatter = new DateFormatter("en-US", { dateStyle: "long" });
const islamicFormatter = new DateFormatter("en-US-u-ca-islamic-umalqura", {
  dateStyle: "long",
});

function formatTooltip(date: DateValue) {
  if (calendarSystem.value == "islamic") {
    const greg = toCalendar(date, new GregorianCalendar());
    return gregorianFormatter.format(greg.toDate(timeZone));
  } else {
    const islamic = toCalendar(date, new IslamicUmalquraCalendar());
    return islamicFormatter.format(islamic.toDate(timeZone));
  }
}

function selectToday() {
  if (calendarSystem.value === "islamic") {
    islamicDate.value = toCalendar(
      today(timeZone),
      new IslamicUmalquraCalendar()
    );
  } else {
    gregorianDate.value = toCalendar(today(timeZone), new GregorianCalendar());
  }
}

const showCalendar = shallowRef(true);

const isToday = computed(() => {
  const baseToday = today(timeZone);
  if (calendarSystem.value === "islamic") {
    const todayIslamic = toCalendar(baseToday, new IslamicUmalquraCalendar());
    return calendarDate.value.compare(todayIslamic) === 0;
  } else {
    const todayGregorian = toCalendar(baseToday, new GregorianCalendar());
    return calendarDate.value.compare(todayGregorian) === 0;
  }
});

function toggleCalendarSystem() {
  if (calendarSystem.value === "islamic") {
    // convert current islamic date to gregorian and switch
    gregorianDate.value = toCalendar(
      islamicDate.value,
      new GregorianCalendar()
    );
    calendarSystem.value = "gregorian";
  } else {
    islamicDate.value = toCalendar(
      gregorianDate.value,
      new IslamicUmalquraCalendar()
    );
    calendarSystem.value = "islamic";
  }
}

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
  nextPrayerLabel,
  countdownToNext,
  previousPrayerLabel,
  timeSincePrevious,
  clearTimings,
  clearCache,
  timeFormat,
  testPlayAthan,
  isAthanActive,
  dismissAthan,
  isStale,
  isOffline,
} = usePrayerTimes();

// Start notifications scheduler
const { startPrayerNotifications, stopPrayerNotifications, send } =
  useNotifications({
    timingsList,
  });

const onTestNotificationClick = () => send("Meeqat", "Prayer time is here");

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

async function onClearCache() {
  if (
    await confirm({
      title: "Clear Cache",
      message: "Are you sure you want to clear the cache?",
      description: "This will remove all cached prayer times.",
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
  startPrayerNotifications();
});

watch([selectedMethodId, selectedCity, selectedCountry], () => {
  clearTimings();
});

watch(calendarDate, (newDate) => {
  if (!selectedCity.value || !selectedCountry.value) return;
  const greg = toCalendar(newDate, new GregorianCalendar());
  const dateParam = `${pad2(greg.day)}-${pad2(greg.month)}-${greg.year}`;
  fetchPrayerTimingsByCity(selectedCity.value, selectedCountry.value, {
    methodId: selectedMethodId.value,
    date: dateParam,
  });
});

// Push updates to the tray via Tauri event bus
watch(
  [
    gregorianDateVerbose,
    hijriDateVerbose,
    nextPrayerLabel,
    countdownToNext,
    timingsList,
  ],
  async () => {
    try {
      const dateLineParts: string[] = [];
      if (hijriDateVerbose.value)
        dateLineParts.push(`Hijri: ${hijriDateVerbose.value}`);
      if (gregorianDateVerbose.value)
        dateLineParts.push(`Gregorian: ${gregorianDateVerbose.value}`);
      const dateLine = dateLineParts.join(" | ");

      const titleCountdown = (countdownToNext.value ?? "")
        .split(":")
        .slice(0, 2)
        .join(":");
      const title =
        nextPrayerLabel.value && titleCountdown
          ? `${nextPrayerLabel.value} in ${titleCountdown}`
          : null;

      // Build Next and Since lines for tray
      const list = (timingsList.value || [])
        .filter((t) => typeof t.minutes === "number" && MAIN_PRAYER_KEYS_SET.has(t.key))
        .sort((a, b) => a.minutes! - b.minutes!);

      let nextLine = "Next: --";
      if (nextPrayerLabel.value && countdownToNext.value) {
        nextLine = `${nextPrayerLabel.value} in \t\t ${countdownToNext.value}`;
      }

      let sinceLine = "Last: --";
      const prevInfo = computePreviousPrayerInfo(timingsList.value, new Date());
      if (prevInfo) {
        sinceLine = `${prevInfo.label} since \t ${prevInfo.timeSince}`;
      }

      await emit("meeqat:tray:update", {
        dateLine,
        title,
        nextLine,
        sinceLine,
      });
    } catch {
      // ignore emit errors in non-tauri/web
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  stopPrayerNotifications();
});
</script>

<style></style>
