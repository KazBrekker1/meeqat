<template>
  <div class="h-screen w-full relative">
    <PrototypesCelestialSkyBackground class="h-full" :stars="70" :seed="11">
      <div class="h-full flex flex-col text-white">
        <!-- App bar -->
        <header class="flex items-center justify-between px-3 sm:px-4 min-h-12 shrink-0 border-b border-white/10 bg-black/20 backdrop-blur-sm pt-safe">
          <div class="flex items-center gap-2 min-w-0">
            <MeeqatMark class="size-5 text-indigo-300 shrink-0" />
            <span class="text-sm font-semibold shrink-0">Meeqat</span>
          </div>
          <div class="flex items-center gap-2 sm:gap-3 shrink min-w-0">
            <button class="flex items-center gap-1 text-sm text-white/80 hover:text-white min-w-0 cursor-pointer" @click="showLocationModal = true">
              <UIcon :name="locationMode === 'gps' ? 'lucide:satellite' : 'lucide:map-pin'" class="size-3.5 shrink-0" />
              <span class="truncate">{{ locationMode === 'gps' ? (gpsCity ?? 'GPS Location') : (selectedCity || 'No location') }}</span>
              <UIcon name="lucide:chevron-down" class="size-3.5 text-white/45 shrink-0" />
            </button>
            <span class="text-sm tabular-nums font-mono text-white/55 shrink-0">{{ currentTimeString }}</span>
            <UButton icon="heroicons:cog-6-tooth-20-solid" size="xs" variant="ghost" color="neutral" class="text-white/70 shrink-0" aria-label="Open settings" @click="showSettingsModal = true" />
          </div>
        </header>

        <!-- Body: single column on narrow, two-pane on wide -->
        <div class="flex-1 min-h-0 overflow-y-auto scroll-celestial pb-safe md:pb-0 md:overflow-hidden md:grid md:grid-cols-[minmax(0,1fr)_380px]">
          <!-- LEFT: orbit + countdown -->
          <section class="flex flex-col items-center justify-center gap-2 px-4 py-6">
            <PrototypesOrbitBumps
              v-if="orbitPrayers.length"
              :key="orbitSize"
              :prayers="orbitPrayers"
              :time="nowHHMM"
              :now-seconds="nowSecondsLive"
              :moon-phase="moonPhase"
              :size="orbitSize"
            />
            <PrototypesCelestialMoonPhase v-else :phase="moonPhase" :size="120" halo halo-color="#cdd6ff" />

            <div v-if="nextPrayerLabel" class="text-center mt-1">
              <p class="uppercase tracking-[0.2em] text-white/55 text-[11px] md:text-xs">Until {{ nextPrayerLabel }}</p>
              <p class="font-mono font-bold tabular-nums mt-1 text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)] text-[2.4rem] leading-none md:text-6xl">
                {{ countdownToNext }}
              </p>
              <p v-if="hijriDateVerbose || gregorianDateVerbose" class="text-white/55 mt-2 text-[11px] md:text-sm">
                {{ hijriDateVerbose }}<span v-if="hijriDateVerbose && gregorianDateVerbose"> · </span>{{ gregorianDateVerbose }}
              </p>
              <p v-if="previousPrayerLabel && timeSincePrevious" class="text-white/60 mt-1 text-xs md:text-sm">
                <UIcon name="lucide:moon" class="size-3 inline -mt-0.5" /> {{ timeSincePrevious }} since {{ previousPrayerLabel }}
              </p>
            </div>
          </section>

          <!-- RIGHT: location + schedule + calendar -->
          <aside class="min-h-0 md:overflow-y-auto scroll-celestial md:border-l md:border-white/10 md:bg-black/25 md:backdrop-blur-md p-3 flex flex-col gap-3">
            <p v-if="fetchError" class="text-red-300 text-sm px-1">{{ fetchError }}</p>

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

            <!-- Schedule -->
            <div>
              <h2 class="text-[11px] uppercase tracking-wider text-white/45 mb-1.5 px-1">Today's prayers</h2>
              <PrayerSkeleton v-if="isLoading && !timingsList.length" :count="6" />
              <ul v-else-if="timingsList.length" class="rounded-xl bg-white/[0.06] border border-white/10 divide-y divide-white/[0.07] overflow-hidden">
                <li
                  v-for="t in timingsList"
                  :key="t.key"
                  class="flex items-center gap-2.5 px-3 py-2"
                  :class="[t.isPast ? 'opacity-45' : '', t.isNext ? 'bg-white/[0.08]' : '']"
                >
                  <UIcon :name="t.isNext ? 'lucide:star' : iconFor(t.key.toLowerCase())" class="size-4 shrink-0" :class="t.isNext ? 'text-amber-300 fill-amber-300' : 'text-white/45'" />
                  <span class="text-sm flex-1 truncate" :class="t.isNext ? 'font-semibold' : ''">{{ t.label }}</span>
                  <span v-if="t.isNext && shortCountdown" class="text-[10px] text-amber-300/80 tabular-nums shrink-0">in {{ shortCountdown }}</span>
                  <span v-else-if="t.altTime" class="text-xs tabular-nums text-white/40">{{ t.altTime }}</span>
                  <span class="text-sm tabular-nums font-mono" :class="t.isNext ? 'text-indigo-100' : 'text-white/65'">{{ t.time }}</span>
                </li>
              </ul>
              <div v-else class="text-center py-8 text-white/55">
                <UIcon name="lucide:map-pin" class="size-8 mx-auto mb-2 text-white/30" />
                <p class="text-sm">Select a city to view prayer times</p>
              </div>
            </div>

            <!-- Mini calendar (desktop only) -->
            <div class="hidden md:block">
              <div class="flex items-center justify-between mb-1.5">
                <div class="flex p-0.5 rounded-lg bg-white/[0.06] border border-white/10 text-xs">
                  <button
                    class="px-2.5 py-0.5 rounded-md transition-colors cursor-pointer"
                    :class="calendarSystem === 'islamic' ? 'bg-indigo-400/25 ring-1 ring-indigo-300/40 font-medium' : 'text-white/60 hover:text-white'"
                    @click="calendarSystem !== 'islamic' && toggleCalendarSystem()"
                  >Hijri</button>
                  <button
                    class="px-2.5 py-0.5 rounded-md transition-colors cursor-pointer"
                    :class="calendarSystem === 'gregorian' ? 'bg-indigo-400/25 ring-1 ring-indigo-300/40 font-medium' : 'text-white/60 hover:text-white'"
                    @click="calendarSystem !== 'gregorian' && toggleCalendarSystem()"
                  >Gregorian</button>
                </div>
                <UButton icon="lucide:calendar-check" size="xs" variant="ghost" color="neutral" class="text-white/60" aria-label="Jump to today" @click="selectToday" />
              </div>
              <UCalendar
                v-model="calendarDate"
                v-model:placeholder="calendarPlaceholder"
                size="sm"
                class="rounded-xl bg-white/[0.04] border border-white/10 p-2"
              >
                <template #heading>
                  <span class="text-sm font-semibold">{{ calendarHeading }}</span>
                </template>
                <template #day="{ day }">
                  <span class="relative grid place-items-center w-full h-full">
                    {{ day.day }}
                    <PrototypesCelestialMoonPhase
                      :phase="lunarPhaseOf(day)"
                      :size="10"
                      :glow="false"
                      :craters="false"
                      dark-color="#0a1024"
                      class="absolute bottom-0 right-0"
                    />
                  </span>
                </template>
              </UCalendar>
            </div>

            <!-- Calendar button (opens the full calendar popup) -->
            <UButton
              class="mt-auto"
              block
              variant="soft"
              color="neutral"
              icon="lucide:calendar"
              label="Open calendar"
              @click="showCalendarDrawer = true"
            />
          </aside>
        </div>
      </div>
    </PrototypesCelestialSkyBackground>

    <!-- Calendar Drawer -->
    <PrayerCalendarDrawer
      v-model:open="showCalendarDrawer"
      v-model:calendar-date="calendarDate"
      v-model:calendar-placeholder="calendarPlaceholder"
      :calendar-system="calendarSystem"
      :calendar-heading="calendarHeading"
      :hijri-date-verbose="hijriDateVerbose || undefined"
      :gregorian-date-verbose="gregorianDateVerbose || undefined"
      :format-tooltip="formatTooltip"
      @toggle-calendar-system="toggleCalendarSystem"
      @select-today="selectToday"
    />

    <!-- Settings Modal -->
    <PrayerSettingsModal
      v-model="showSettingsModal"
      :time-format="timeFormat"
      :is-loading="isLoading"
      :show-additional-times="showAdditionalTimes"
      :notification-settings="notificationSettings"
      :on-test-notification-click="onTestNotificationClick"
      :method-select-options="methodSelectOptions"
      :timezone-select-options="timezoneSelectOptions"
      v-model:selected-method-id="selectedMethodId"
      v-model:selected-extra-timezone="selectedExtraTimezone"
      :location-mode="locationMode"
      :gps-lat="gpsLat"
      :gps-lng="gpsLng"
      @update:location-mode="onLocationModeChange"
      @update:gps-location="onGpsLocationUpdate"
      @clear-cache="onClearCache"
      @toggle-time-format="timeFormat = timeFormat === '24h' ? '12h' : '24h'"
      @toggle-additional-times="showAdditionalTimes = !showAdditionalTimes"
      @update:notification-settings="onUpdateNotificationSettings"
    />

    <!-- Location Modal (opened from the header) -->
    <UModal v-model:open="showLocationModal" title="Location" description="Choose your city or use GPS">
      <template #body>
        <div class="space-y-3">
          <div v-if="locationMode === 'gps'" class="flex items-center gap-2 text-sm text-muted">
            <UIcon name="lucide:satellite" class="size-4 shrink-0" />
            <span v-if="gpsCity">{{ gpsCity }}</span>
            <span v-else-if="gpsLat != null && gpsLng != null" class="tabular-nums">{{ gpsLat.toFixed(4) }}, {{ gpsLng.toFixed(4) }}</span>
            <span v-else class="text-dimmed">GPS mode — set coordinates in Settings</span>
          </div>
          <PrayerLocationSelector
            v-else
            :favorites="favorites"
            :current-city="selectedCity"
            :current-country-code="selectedCountry"
            :max-favorites="MAX_FAVORITES"
            :loading="isLoading"
            @select="(c: string, cc: string) => { onLocationSelect(c, cc); showLocationModal = false; }"
            @add-favorite="onAddCurrentToFavorites"
            @remove-favorite="onRemoveFavorite"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>

<script lang="ts" setup>
import { getCountryByCode } from "@/constants/countries";
import { METHOD_OPTIONS, type MethodOption } from "@/constants/methods";
import { pad2, getSecondsOfDay } from "@/utils/time";
import { MAIN_PRAYER_KEYS_SET } from "@/constants/prayers";
import { iconFor } from "@/components/prototypes/celestial/prayerIcons";
import { moonPhase as lunarPhase } from "@/components/prototypes/celestial/lunar";
import { GregorianCalendar, toCalendar } from "@internationalized/date";
import { emit } from "@tauri-apps/api/event";
import { watchThrottled } from "@vueuse/core";
import { nextTick } from "vue";
import type { NotificationSettings } from "@/composables/useNotifications";
import type { FavoriteLocation } from "@/composables/useFavoriteLocations";
import type { TrayUpdatePayload } from "@/utils/types";

// Dual Hijri/Gregorian calendar state + formatting (shared composable).
const {
  calendarSystem,
  calendarDate,
  calendarPlaceholder,
  calendarHeading,
  formatTooltip,
  toggleCalendarSystem,
  selectToday,
  lunarPhaseOf,
} = useHijriCalendar();

const showCalendarDrawer = shallowRef(false);
const showSettingsModal = shallowRef(false);
const showLocationModal = shallowRef(false);

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
  isStale,
  isOffline,
  locationMode,
  gpsLat,
  gpsLng,
  gpsCity,
  fetchByCoordinates,
  getNextDayFirstPrayer,
} = usePrayerTimes();

const { reverseGeocode } = useGeolocation();

const { getNow } = useMockTime();

// --- Celestial redesign ---
useHead({ htmlAttrs: { class: "dark" } });

// Real moon phase for the current moment (mock-time aware).
const moonPhase = computed(() => {
  void countdownToNext.value;
  return lunarPhase(getNow());
});

// Current time as 24h HH:MM for the orbit's "now" position (ticks each second).
const nowHHMM = computed(() => {
  void countdownToNext.value;
  const m = Math.floor(getSecondsOfDay(getNow()) / 60);
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
});

// Sub-minute now for the orbit comet, so it advances smoothly each tick in sync
// with the countdown instead of stepping once a minute. (countdownToNext ticks 1s.)
const nowSecondsLive = computed(() => {
  void countdownToNext.value;
  return getSecondsOfDay(getNow());
});

// Prayers plotted on the orbit (24h times, lowercase keys for the sky gradient).
const ORBIT_KEYS = ["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"];
const orbitPrayers = computed(() =>
  ORBIT_KEYS.flatMap((k) => {
    const t = timingsList.value.find((x) => x.key === k);
    if (!t || typeof t.minutes !== "number") return [];
    const min = t.minutes;
    return [{
      key: k.toLowerCase(),
      time: `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`,
      isNext: !!t.isNext,
      isPast: !!t.isPast,
    }];
  })
);

// Orbit grows on wide (desktop two-pane) windows. useMediaQuery only reacts
// when the breakpoint is crossed (cheaper than per-pixel useWindowSize).
const isWide = useMediaQuery("(min-width: 768px)");
const orbitSize = computed(() => (isWide.value ? 300 : 230));

// Short "in MM:SS"/"in HH:MM" badge next to the next prayer in the list.
const shortCountdown = computed(() => (countdownToNext.value || "").split(":").slice(0, 2).join(":"));

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

// GPS location handlers
function onLocationModeChange(mode: 'city' | 'gps') {
  locationMode.value = mode;
  if (mode === 'gps' && gpsLat.value != null && gpsLng.value != null) {
    fetchByCoordinates(gpsLat.value, gpsLng.value);
  } else if (mode === 'city' && selectedCity.value && selectedCountry.value) {
    onFetchByCity();
  }
}

function onGpsLocationUpdate(coords: { lat: number; lng: number } | null) {
  if (coords) {
    gpsLat.value = coords.lat;
    gpsLng.value = coords.lng;
    if (locationMode.value === 'gps') {
      fetchByCoordinates(coords.lat, coords.lng);
    }
    // Resolve city name in background (non-blocking)
    reverseGeocode(coords.lat, coords.lng).then((name) => {
      gpsCity.value = name;
    });
  } else {
    gpsLat.value = null;
    gpsLng.value = null;
    gpsCity.value = null;
  }
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
  if (locationMode.value === 'gps' && gpsLat.value != null && gpsLng.value != null) {
    fetchByCoordinates(gpsLat.value, gpsLng.value);
  } else if (selectedCity.value && selectedCountry.value) {
    onFetchByCity();
  }
  startPrayerNotifications();
});

watch(selectedMethodId, () => {
  clearTimings();
  if (locationMode.value === 'gps' && gpsLat.value != null && gpsLng.value != null) {
    fetchByCoordinates(gpsLat.value, gpsLng.value);
  } else {
    onFetchByCity();
  }
});

watch(calendarPlaceholder, (newPlaceholder) => {
  const greg = toCalendar(newPlaceholder, new GregorianCalendar());
  const dateParam = `${pad2(greg.day)}-${pad2(greg.month)}-${greg.year}`;
  if (locationMode.value === 'gps' && gpsLat.value != null && gpsLng.value != null) {
    fetchByCoordinates(gpsLat.value, gpsLng.value, { date: dateParam });
  } else if (selectedCity.value && selectedCountry.value) {
    fetchPrayerTimingsByCity(selectedCity.value, selectedCountry.value, {
      methodId: selectedMethodId.value,
      date: dateParam,
    });
  }
});

// Tray title + countdown update — throttle 1s (countdown changes every second)
watchThrottled(
  [nextPrayerLabel, countdownToNext, previousPrayerLabel, timeSincePrevious],
  async () => {
    try {
      const titleCountdown = (countdownToNext.value ?? "")
        .split(":")
        .slice(0, 2)
        .join(":");
      const title =
        nextPrayerLabel.value && titleCountdown
          ? `${nextPrayerLabel.value} in ${titleCountdown}`
          : null;

      await emit("meeqat:tray:update", {
        title,
        moonPhase: moonPhase.value,
        now: nowHHMM.value,
        nextPrayerLabel: nextPrayerLabel.value,
        countdown: countdownToNext.value,
        sincePrayerLabel: previousPrayerLabel.value ?? "",
        sinceTime: timeSincePrevious.value ?? "",
      } satisfies TrayUpdatePayload);
    } catch {
      // ignore emit errors in non-tauri/web
    }
  },
  { throttle: 1000 },
);

// Tray full data update — throttle 30s (data changes at most a few times per day)
watchThrottled(
  [
    gregorianDateVerbose,
    hijriDateVerbose,
    timingsList,
    () => locationMode.value === "gps" ? (gpsCity.value ?? "GPS") : selectedCity.value,
    () => locationMode.value === "gps" ? "" : selectedCountry.value,
  ],
  async () => {
    try {
      const dateLineParts: string[] = [];
      if (hijriDateVerbose.value)
        dateLineParts.push(`Hijri: ${hijriDateVerbose.value}`);
      if (gregorianDateVerbose.value)
        dateLineParts.push(`Gregorian: ${gregorianDateVerbose.value}`);
      const dateLine = dateLineParts.join(" | ");

      const list = (timingsList.value || [])
        .filter(
          (t) =>
            typeof t.minutes === "number" && MAIN_PRAYER_KEYS_SET.has(t.key),
        )
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
        nextLine,
        sinceLine,
        hijriDate: hijriDateVerbose.value,
        gregorianDate: gregorianDateVerbose.value,
        nextPrayerLabel: nextPrayerLabel.value,
        countdown: countdownToNext.value,
        sincePrayerLabel: previousPrayerLabel.value ?? "",
        sinceTime: timeSincePrevious.value ?? "",
        timingsList: list,
        city:
          locationMode.value === "gps"
            ? (gpsCity.value ?? "GPS")
            : selectedCity.value,
        countryCode:
          locationMode.value === "gps" ? "" : selectedCountry.value,
      } satisfies TrayUpdatePayload);
    } catch {
      // ignore emit errors in non-tauri/web
    }
  },
  { throttle: 30000 },
);

onBeforeUnmount(() => {
  stopPrayerNotifications();
  // Note: We intentionally do NOT stop the prayer service here
  // The foreground service should continue running even when the app is closed
});
</script>

<style></style>
