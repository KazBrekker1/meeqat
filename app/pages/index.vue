<template>
  <div class="flex flex-col h-screen w-full">
    <!-- Sticky Header -->
    <header class="sticky top-0 z-10 bg-[var(--ui-bg)]/80 backdrop-blur-md border-b border-[var(--ui-border)] pt-[max(env(safe-area-inset-top),8px)] pattern-islamic-subtle">
      <div class="max-w-2xl mx-auto px-3 pb-2 pt-1">
        <PrayerHeader
          :current-time-string="currentTimeString"
          :next-prayer-label="nextPrayerLabel || undefined"
          :countdown-to-next="countdownToNext || undefined"
        />
      </div>
    </header>

    <!-- Scrollable Content -->
    <main class="flex-1 overflow-y-auto p-3">
      <section class="max-w-2xl mx-auto space-y-3">
        <!-- Unified Location Selector -->
        <div class="animate-slide-up opacity-0">
          <PrayerLocationSelector
            :favorites="favorites"
            :current-city="selectedCity"
            :current-country-code="selectedCountry"
            :max-favorites="MAX_FAVORITES"
            :loading="isLoading"
            @select="onLocationSelect"
            @add-favorite="onAddCurrentToFavorites"
            @remove-favorite="onRemoveFavorite"
          />
        </div>

        <div v-if="fetchError" class="text-[var(--ui-color-error-500)] text-sm">{{ fetchError }}</div>

        <!-- Ramadan Mode Banner -->
        <div class="animate-slide-up opacity-0 delay-100">
          <PrayerRamadanBanner
            :show-ramadan-mode="showRamadanMode"
            :ramadan-info="ramadanInfo"
            :suhoor-iftar-times="suhoorIftarTimes"
          />
        </div>

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

        <div class="animate-slide-up opacity-0 delay-150">
          <PrayerTimingsList :timings-list="timingsList" :loading="isLoading && !timingsList.length" />
        </div>

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

            <UCalendar
              v-model="calendarDate"
              :placeholder="calendarPlaceholder"
              @update:placeholder="calendarPlaceholder = $event as CalendarDate"
            >
              <template #heading>
                <span class="text-sm font-semibold">{{ calendarHeading }}</span>
              </template>
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
    <footer class="sticky bottom-0 z-10 bg-[var(--ui-bg)] border-t border-[var(--ui-border)] pb-[env(safe-area-inset-bottom)] pattern-islamic-subtle">
      <div class="max-w-2xl mx-auto p-3">
        <PrayerFooter
          :previous-prayer-label="previousPrayerLabel || undefined"
          :time-since-previous="timeSincePrevious || undefined"
          :is-athan-active="isAthanActive"
          :dismiss-athan="dismissAthan"
          @open-settings="showSettingsModal = true"
        />
      </div>
    </footer>

    <!-- Settings Modal -->
    <PrayerSettingsModal
      v-model="showSettingsModal"
      :time-format="timeFormat"
      :is-calendar-shown="showCalendar"
      :is-loading="isLoading"
      :show-additional-times="showAdditionalTimes"
      :ramadan-mode-enabled="ramadanModeEnabled"
      :notification-settings="notificationSettings"
      :test-play-athan="testPlayAthan"
      :on-test-notification-click="onTestNotificationClick"
      :method-select-options="methodSelectOptions"
      :timezone-select-options="timezoneSelectOptions"
      v-model:selected-method-id="selectedMethodId"
      v-model:selected-extra-timezone="selectedExtraTimezone"
      @clear-cache="onClearCache"
      @toggle-time-format="timeFormat = timeFormat === '24h' ? '12h' : '24h'"
      @toggle-calendar="showCalendar = !showCalendar"
      @toggle-additional-times="showAdditionalTimes = !showAdditionalTimes"
      @toggle-ramadan-mode="setRamadanModeEnabled(!ramadanModeEnabled)"
      @update:notification-settings="onUpdateNotificationSettings"
    />
  </div>
</template>

<script lang="ts" setup>
import { getCountryByCode } from "@/constants/countries";
import { METHOD_OPTIONS, type MethodOption } from "@/constants/methods";
import { pad2 } from "@/utils/time";
import { MAIN_PRAYER_KEYS_SET, ISLAMIC_MONTHS } from "@/constants/prayers";
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
import { watchThrottled } from "@vueuse/core";
import { nextTick } from "vue";
import type { NotificationSettings } from "@/composables/useNotifications";
import type { FavoriteLocation } from "@/composables/useFavoriteLocations";

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

const calendarPlaceholder = shallowRef<CalendarDate>(calendarDate.value);

const gregorianFormatter = new DateFormatter("en-US", { dateStyle: "long" });
const monthYearFormatter = new DateFormatter("en-US", { month: "long", year: "numeric" });

/**
 * Format Islamic date using hardcoded month names.
 * This avoids Intl.DateTimeFormat issues on Android WebViews which
 * don't properly support Islamic calendar locales.
 */
function formatIslamicDate(date: DateValue): string {
  const islamic = date.calendar instanceof IslamicUmalquraCalendar
    ? date
    : toCalendar(date, new IslamicUmalquraCalendar());
  const monthName = ISLAMIC_MONTHS[islamic.month - 1] || `Month ${islamic.month}`;
  return `${islamic.day} ${monthName} ${islamic.year} AH`;
}

const calendarHeading = computed(() => {
  const date = calendarPlaceholder.value;
  if (calendarSystem.value === "islamic") {
    const islamic = date.calendar instanceof IslamicUmalquraCalendar
      ? date
      : toCalendar(date, new IslamicUmalquraCalendar());
    const monthName = ISLAMIC_MONTHS[islamic.month - 1] || `Month ${islamic.month}`;
    return `${monthName} ${islamic.year}`;
  }
  const greg = date.calendar instanceof GregorianCalendar
    ? date
    : toCalendar(date, new GregorianCalendar());
  return monthYearFormatter.format(greg.toDate(timeZone));
});

function formatTooltip(date: DateValue) {
  if (calendarSystem.value == "islamic") {
    // When viewing Islamic calendar, tooltip shows Gregorian date
    const greg = toCalendar(date, new GregorianCalendar());
    return gregorianFormatter.format(greg.toDate(timeZone));
  } else {
    // When viewing Gregorian calendar, tooltip shows Islamic date with hardcoded months
    return formatIslamicDate(date);
  }
}

function selectToday() {
  if (calendarSystem.value === "islamic") {
    const todayIslamic = toCalendar(
      today(timeZone),
      new IslamicUmalquraCalendar()
    );
    islamicDate.value = todayIslamic;
    calendarPlaceholder.value = todayIslamic as CalendarDate;
  } else {
    const todayGreg = toCalendar(today(timeZone), new GregorianCalendar());
    gregorianDate.value = todayGreg;
    calendarPlaceholder.value = todayGreg as CalendarDate;
  }
}

const showCalendar = shallowRef(true);
const showSettingsModal = shallowRef(false);

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
    calendarPlaceholder.value = toCalendar(
      calendarPlaceholder.value,
      new GregorianCalendar()
    ) as CalendarDate;
  } else {
    islamicDate.value = toCalendar(
      gregorianDate.value,
      new IslamicUmalquraCalendar()
    );
    calendarSystem.value = "islamic";
    calendarPlaceholder.value = toCalendar(
      calendarPlaceholder.value,
      new IslamicUmalquraCalendar()
    ) as CalendarDate;
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
  showAdditionalTimes,
  testPlayAthan,
  isAthanActive,
  dismissAthan,
  isStale,
  isOffline,
} = usePrayerTimes();

// Start notifications scheduler with custom settings
const { startPrayerNotifications, stopPrayerNotifications, send, settings: notificationSettings } =
  useNotifications({
    timingsList,
  });

// Update Android home screen widgets
const { isAndroid } = usePrayerService({
  timingsList,
  hijriDate: hijriDateVerbose,
  gregorianDate: gregorianDateVerbose,
  city: selectedCity,
  countryCode: selectedCountry,
});

// Islamic calendar and Ramadan mode
const {
  currentIslamicDate,
  ramadanInfo,
  suhoorIftarTimes,
  showRamadanMode,
  ramadanModeEnabled,
  setRamadanModeEnabled,
} = useIslamicCalendar(timingsList);

// Favorite locations
const {
  favorites,
  addFavorite,
  removeFavorite,
  MAX_FAVORITES,
} = useFavoriteLocations();

const onTestNotificationClick = () => send("Meeqat", "Prayer time is here");

// Location selection handler (from unified LocationSelector)
async function onLocationSelect(city: string, countryCode: string) {
  selectedCity.value = city;
  selectedCountry.value = countryCode;
  await nextTick();
  onFetchByCity();
}

async function onAddCurrentToFavorites() {
  if (!selectedCity.value || !selectedCountry.value) return;
  await addFavorite({
    city: selectedCity.value,
    country: selectedCountryName.value,
    countryCode: selectedCountry.value,
    methodId: selectedMethodId.value,
  });
}

async function onRemoveFavorite(id: string) {
  await removeFavorite(id);
}

// Notification settings handler
function onUpdateNotificationSettings(newSettings: NotificationSettings) {
  notificationSettings.value = newSettings;
}

const methodSelectOptions = computed(() =>
  METHOD_OPTIONS.map((m: MethodOption) => ({
    label: `${m.value} - ${m.label}`,
    value: m.value,
  }))
);
const selectedCountryName = computed(() => {
  return getCountryByCode(selectedCountry.value)?.name ?? "";
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

const toast = useToast();

async function onClearCache() {
  if (
    await confirm({
      title: "Clear Cache",
      message: "Are you sure you want to clear the cache?",
      description: "This will remove all cached prayer times.",
      confirmColor: "error",
    })
  ) {
    await clearCache();
    clearTimings();
    toast.add({
      title: "Cache Cleared",
      description: "All cached prayer times have been removed.",
      color: "success",
      icon: "heroicons:check-circle-20-solid",
    });
  }
}

onMounted(async () => {
  await loadPreferences();
  if (selectedCity.value && selectedCountry.value) {
    onFetchByCity();
  }
  startPrayerNotifications();
  // Prayer service will auto-start when timingsList becomes available (via watcher in composable)
});

watch(selectedMethodId, () => {
  clearTimings();
  onFetchByCity();
});

watch(calendarPlaceholder, (newPlaceholder) => {
  if (!selectedCity.value || !selectedCountry.value) return;
  const greg = toCalendar(newPlaceholder, new GregorianCalendar());
  const dateParam = `${pad2(greg.day)}-${pad2(greg.month)}-${greg.year}`;
  fetchPrayerTimingsByCity(selectedCity.value, selectedCountry.value, {
    methodId: selectedMethodId.value,
    date: dateParam,
  });
});

// Push updates to the tray via Tauri event bus (throttled to at most once per second)
watchThrottled(
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
      if (previousPrayerLabel.value && timeSincePrevious.value) {
        sinceLine = `${previousPrayerLabel.value} since \t ${timeSincePrevious.value}`;
      }

      await emit("meeqat:tray:update", {
        dateLine,
        title,
        nextLine,
        sinceLine,
        // Additional fields for the tray popover
        hijriDate: hijriDateVerbose.value,
        gregorianDate: gregorianDateVerbose.value,
        nextPrayerLabel: nextPrayerLabel.value,
        countdown: countdownToNext.value,
        sincePrayerLabel: previousPrayerLabel.value ?? "",
        sinceTime: timeSincePrevious.value ?? "",
        timingsList: list,
        city: selectedCity.value,
        countryCode: selectedCountry.value,
      });
    } catch {
      // ignore emit errors in non-tauri/web
    }
  },
  { throttle: 1000 },
);

onBeforeUnmount(() => {
  stopPrayerNotifications();
  // Note: We intentionally do NOT stop the prayer service here
  // The foreground service should continue running even when the app is closed
});
</script>

<style></style>
