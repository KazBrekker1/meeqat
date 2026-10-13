<template>
  <div class="h-screen w-full relative">
    <CelestialSkyBackground class="h-full" :stars="70" :seed="11">
      <div class="h-full flex flex-col text-white">
        <!-- App bar -->
        <header class="flex items-center justify-between px-3 sm:px-4 min-h-12 shrink-0 border-b border-white/10 bg-black/20 backdrop-blur-sm pt-safe">
          <div class="flex items-center gap-2 min-w-0">
            <MeeqatMark class="size-5 text-indigo-300 shrink-0" />
            <span class="text-sm font-semibold shrink-0">Meeqat</span>
          </div>
          <div class="flex items-center gap-2 sm:gap-3 shrink min-w-0">
            <DownloadAppMenu v-if="isWeb" />
            <UButton
              to="/rooms"
              icon="lucide:users"
              size="xs"
              variant="ghost"
              color="neutral"
              class="text-white/70 shrink-0"
              aria-label="Pray together"
            >
              <span class="hidden sm:inline">Pray together</span>
            </UButton>
            <button class="flex items-center gap-1 text-sm text-white/80 hover:text-white min-w-0 cursor-pointer" @click="showLocationModal = true">
              <UIcon :name="locationMode === 'gps' ? 'lucide:satellite' : 'lucide:map-pin'" class="size-3.5 shrink-0" />
              <span class="truncate">{{ locationMode === 'gps' ? (gpsCity ?? 'GPS Location') : (selectedCity || 'No location') }}</span>
              <UIcon name="lucide:chevron-down" class="size-3.5 text-white/45 shrink-0" />
            </button>
            <!-- Hidden on phones: the status bar shows the time, and the header needs the room. -->
            <span class="hidden sm:inline text-sm tabular-nums font-mono text-white/55 shrink-0">{{ currentTimeString }}</span>
            <UButton icon="lucide:compass" size="xs" variant="ghost" color="neutral" class="text-white/70 shrink-0" aria-label="Show Qibla direction" @click="openQiblaModal" />
            <UButton icon="heroicons:cog-6-tooth-20-solid" size="xs" variant="ghost" color="neutral" class="text-white/70 shrink-0" aria-label="Open settings" @click="openSettingsModal" />
          </div>
        </header>

        <!-- Body: single column on narrow, two-pane on wide -->
        <div class="flex-1 min-h-0 overflow-y-auto scroll-celestial pb-safe md:pb-0 md:overflow-hidden md:grid md:grid-cols-[minmax(0,1fr)_380px]">
          <!-- LEFT: the stage — orbit + moon, date, today strip -->
          <section ref="stageEl" class="flex flex-col items-center justify-center gap-2 px-4 pt-6 pb-3 md:py-6 md:gap-3.5 min-h-0">
            <OrbitBumps
              v-if="orbitPrayers.length"
              :key="orbitSize"
              :prayers="orbitPrayers"
              :time="nowHHMM"
              :now-seconds="nowSecondsLive"
              :moon-phase="moonPhase"
              :size="orbitSize"
              :lat="activeCoords?.lat ?? null"
              :lng="activeCoords?.lng ?? null"
            >
              <!-- Same disc size as the orbit's default flat moon (0.42 × 0.92 of the orbit) -->
              <CelestialMoonSphere
                :phase="moonPhase"
                :lat="activeCoords?.lat ?? null"
                :lng="activeCoords?.lng ?? null"
                :size="Math.round(orbitSize * 0.6)"
                :disc="ORBIT_MOON_DISC"
              />
            </OrbitBumps>
            <CelestialMoonSphere
              v-else
              :phase="moonPhase"
              :lat="activeCoords?.lat ?? null"
              :lng="activeCoords?.lng ?? null"
              :size="170"
              :disc="ORBIT_MOON_DISC"
            />
            <UButton
              v-if="!hasLocation"
              class="mt-4"
              size="lg"
              icon="lucide:map-pin"
              label="Choose location"
              @click="openLocation"
            />

            <!-- Date under the orbit; the countdown/since timers live as the
                 orbit's since/until banner. -->
            <p v-if="hijriDateVerbose || gregorianDateVerbose" class="text-center text-white/55 text-[11px] md:text-sm">
              {{ hijriDateVerbose }}<span v-if="hijriDateVerbose && gregorianDateVerbose"> · </span>{{ gregorianDateVerbose }}
            </p>

            <StageTodayStrip
              v-if="hasLocation"
              :compact="!isWide"
              :moon="stageMoon"
              :lat="activeCoords?.lat ?? null"
              :lng="activeCoords?.lng ?? null"
              :sunrise="sunTimes.sunrise"
              :sunset="sunTimes.sunset"
              :day-length="sunTimes.dayLength"
              :qibla="qibla"
              :place="shortPlace"
              class="md:mt-0.5"
              @qibla="openQiblaModal"
            />
          </section>

          <!-- RIGHT: schedule, reminders, calendar, Pray Together -->
          <aside class="min-h-0 md:overflow-y-auto scroll-celestial md:border-l md:border-white/10 md:bg-black/25 md:backdrop-blur-md p-3 flex flex-col gap-3">
            <p v-if="fetchError" class="text-red-300 text-sm px-1">{{ fetchError }}</p>

            <!-- Mobile: a live call is time-critical, so it sits right under the today strip -->
            <StageTogetherCard
              v-if="!isWide && liveCall"
              :call="liveCall"
              :joining="activeCalls.joining.value === liveCall.id"
              @join="activeCalls.join"
            />

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
              <!-- Only when the chosen city's UTC offset differs from this device's -->
              <p v-if="timezoneNote && timingsList.length" class="text-[10px] text-white/35 -mt-1 mb-1.5 px-1">{{ timezoneNote }}</p>
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
                <p class="text-sm mb-3">Choose where you are to see prayer times</p>
                <UButton icon="lucide:map-pin" label="Choose location" @click="openLocation" />
              </div>
            </div>

            <!-- Mini calendar (desktop only) -->
            <div v-if="isWide">
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
                    <CelestialMoonPhase
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
              <!-- Times for the picked date; today's stay in the list above -->
              <div v-if="selectedDayTimes.length" class="mt-2 rounded-xl bg-white/[0.04] border border-white/10 px-2 py-1.5">
                <p class="text-[11px] text-white/45 mb-1 px-1">Prayer times · {{ selectedDayLabel }}</p>
                <div class="grid grid-cols-3 gap-1 text-center">
                  <div v-for="t in selectedDayTimes" :key="t.key">
                    <div class="text-[10px] text-white/45">{{ t.label }}</div>
                    <div class="text-xs tabular-nums font-mono text-white/80">{{ t.time }}</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Desktop: reminder under the calendar, then Pray Together -->
            <StageReminderCard v-if="isWide" :items="reminders" heading />

            <StageTogetherCard
              v-if="isWide"
              heading
              :call="liveCall"
              :joining="!!liveCall && activeCalls.joining.value === liveCall.id"
              :start-room-id="activeCalls.startRoomId.value"
              :next-prayer="nextMainPrayer"
              @join="activeCalls.join"
            />

            <!-- Calendar button (opens the full calendar popup) -->
            <UButton
              class="mt-auto"
              block
              variant="soft"
              color="neutral"
              icon="lucide:calendar"
              label="Open calendar"
              @click="openCalendarDrawer"
            />

            <!-- Mobile: the same order — reminder after the calendar, Pray Together last
                 (a live call already sits at the top) -->
            <StageReminderCard v-if="!isWide" :items="reminders" />

            <StageTogetherCard
              v-if="!isWide && !liveCall"
              :call="null"
              :start-room-id="activeCalls.startRoomId.value"
              :next-prayer="nextMainPrayer"
            />
          </aside>
        </div>

        <!-- Footer: app version (+ update pill when a newer release is available) -->
        <footer class="shrink-0 flex items-center justify-center gap-2 py-1 text-[10px] text-white/30 border-t border-white/5 pb-safe">
          <MeeqatMark class="size-2.5 opacity-60" />
          <span>Meeqat v{{ appVersion }}</span>
          <NuxtLink to="/privacy" class="hover:text-white/60">Privacy</NuxtLink>
          <button
            v-if="isUpdateAvailable"
            type="button"
            class="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-primary hover:bg-primary/25 transition-colors"
            @click="showUpdateModal = true"
          >
            <UIcon
              :name="updateStatus === 'downloading' ? 'lucide:loader-circle' : updateStatus === 'error' ? 'lucide:triangle-alert' : 'lucide:arrow-up-circle'"
              class="size-3"
              :class="updateStatus === 'downloading' && 'animate-spin'"
            />
            <span>{{ updatePillLabel }}</span>
          </button>
        </footer>
      </div>
    </CelestialSkyBackground>

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
      :selected-day-label="selectedDayLabel"
      :selected-day-times="selectedDayTimes"
      @toggle-calendar-system="toggleCalendarSystem"
      @select-today="selectToday"
    />

    <!-- Update Modal -->
    <AppUpdateModal v-model:open="showUpdateModal" />

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
      :has-location="hasLocation"
      :calendar-lat="activeCoords?.lat"
      :calendar-lng="activeCoords?.lng"
      :calendar-name="locationDisplayName"
      @update:location-mode="onLocationModeChange"
      @update:gps-location="onGpsLocationUpdate"
      @clear-cache="onClearCache"
      @toggle-time-format="timeFormat = timeFormat === '24h' ? '12h' : '24h'"
      @toggle-additional-times="showAdditionalTimes = !showAdditionalTimes"
      @update:notification-settings="onUpdateNotificationSettings"
    />

    <!-- Location Modal (opened from the header) -->
    <UModal
      v-model:open="showLocationModal"
      :title="hasLocation ? 'Location' : 'Where do you pray?'"
      :description="hasLocation ? 'Search a city, use where you are, or pick a spot on the map' : 'Choose your city, or use where you are, to see prayer times. You can change it any time.'"
    >
      <template #body>
        <PrayerLocationSelector
          :favorites="favorites"
          :current-city="locationMode === 'gps' ? undefined : selectedCity"
          :current-country-code="locationMode === 'gps' ? undefined : selectedCountry"
          :current-lat="activeCoords?.lat ?? null"
          :current-lng="activeCoords?.lng ?? null"
          :max-favorites="MAX_FAVORITES"
          :loading="isLoading"
          @select="(c: string, cc: string) => { locationMode = 'city'; onLocationSelect(c, cc); showLocationModal = false; }"
          @select-place="onPlaceSelect"
          @add-favorite="onAddCurrentToFavorites"
          @remove-favorite="onRemoveFavorite"
        />
      </template>
    </UModal>

    <!-- Qibla Modal (opened from the header) -->
    <UModal v-model:open="showQiblaModal" title="Qibla" description="Direction to the Kaaba in Makkah">
      <template #body>
        <PrayerQiblaCompass :lat="activeCoords?.lat ?? null" :lng="activeCoords?.lng ?? null" />
      </template>
    </UModal>
  </div>
</template>

<script lang="ts" setup>
import { getCountryByCode } from "@/constants/countries";
import { METHOD_OPTIONS, type MethodOption } from "@/constants/methods";
import { pad2, getSecondsOfDay } from "@/utils/time";
import { MAIN_PRAYER_KEYS_SET, PRAYER_ORDER } from "@/constants/prayers";
import { iconFor } from "@/constants/prayerIcons";
import { CalendarDate, GregorianCalendar, IslamicUmalquraCalendar, toCalendar } from "@internationalized/date";
import { ISLAMIC_MONTHS } from "@/constants/prayers";
import { qiblaBearing } from "@/utils/qibla";
import { moonView } from "@/utils/moon/sphere";
import { getPlatform } from "@/utils/platform";
import { cue } from "@/utils/sounds";
import { nextTick } from "vue";
import type { NotificationSettings } from "@/composables/useNotifications";
import type { FavoriteLocation } from "@/composables/useFavoriteLocations";
import { formatGregorianVerbose } from "@/composables/prayer/usePrayerDisplay";

const isWeb = getPlatform() === "web";
const callAlerts = useCallAlerts();
// Pray Together on the stage: active calls in my rooms, over the connection call alerts already hold.
const activeCalls = useActiveCalls();
const showCalendarDrawer = shallowRef(false);
const showSettingsModal = shallowRef(false);
const showLocationModal = shallowRef(false);
const showQiblaModal = shallowRef(false);

const { confirm } = useConfirm();

// Today's times, notifications, tray and widget sync run at app level (see
// usePrayerRuntime); this page reads that state and drives it.
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
  selectedExtraTimezone,
  userTimezone,
  hijriDateVerbose,
  countdownToNext,
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
  fetchSelectedDay,
  selectedDay,
  todayDateKey,
  upcomingKey,
  hasLocation,
  activeCoords,
  locationDisplayName,
  nowHHMM,
  moonPhase,
  timezoneNote,
  prefsLoaded,
  send,
  notificationSettings,
} = usePrayerRuntime();

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
} = useHijriCalendar(todayDateKey);

function openLocation() {
  showLocationModal.value = true;
}

const { reverseGeocode } = useGeolocation();

const { getNow } = useMockTime();

// --- Celestial redesign ---
useHead({ htmlAttrs: { class: "dark" } });

// App version for the footer (from package.json via runtimeConfig).
const appVersion = useRuntimeConfig().public.version;

// In-app updater: checks quietly on launch and every few hours; surfaces a pill in the footer.
const {
  status: updateStatus,
  isUpdateAvailable,
  latestVersion,
  downloadProgress,
  progressKnown,
  startUpdateChecks,
  shouldPromptFor,
} = useAppUpdate();
const showUpdateModal = shallowRef(false);
const updatePillLabel = computed(() => {
  switch (updateStatus.value) {
    case "downloading": return progressKnown.value ? `Downloading ${downloadProgress.value}%` : "Downloading…";
    case "installing": return "Installing…";
    case "ready": return "Finish installing";
    case "error": return "Update failed";
    default: return `Update to v${latestVersion.value}`;
  }
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

// Two-pane layout from md up. useMediaQuery only reacts when the breakpoint is crossed.
const isWide = useMediaQuery("(min-width: 768px)");
// On wide windows the orb fills ~⅔ of the stage's height (560 px on a 900 px
// window), within its width; stepped by 20 px because the orbit remounts on a size
// change. Phones keep 300.
const stageEl = ref<HTMLElement | null>(null);
const { width: stageW, height: stageH } = useElementSize(stageEl, undefined, { box: "border-box" });
const orbitSize = computed(() => {
  if (!isWide.value) return 300;
  if (!stageH.value) return 400;
  const fit = Math.min(stageH.value * 0.67, stageW.value - 80, 600);
  return Math.max(300, Math.round(fit / 20) * 20);
});
// The orbit's flat moon is 0.42 × 0.92 of the orbit; the sphere canvas is 0.6 of it (room for the glow).
const ORBIT_MOON_DISC = (0.42 * 0.92) / 0.6;

// --- Today strip ---
// The real Moon for the chips (phase name, % lit), once a minute.
const stageMoon = computed(() => {
  void nowHHMM.value;
  const c = activeCoords.value;
  const v = moonView(getNow(), c?.lat ?? 0, c?.lng ?? 0);
  return { phase: v.phase, fraction: v.fraction };
});
const timingByKey = (key: string) => timingsList.value.find((t) => t.key === key);
const sunTimes = computed(() => {
  const rise = timingByKey("Sunrise"), set = timingByKey("Maghrib");
  let dayLength: string | undefined;
  if (typeof rise?.minutes === "number" && typeof set?.minutes === "number" && set.minutes > rise.minutes) {
    const d = set.minutes - rise.minutes;
    dayLength = `${Math.floor(d / 60)}h ${pad2(d % 60)}m`;
  }
  return { sunrise: rise?.time, sunset: set?.time, dayLength };
});
const qibla = computed(() => (activeCoords.value ? qiblaBearing(activeCoords.value.lat, activeCoords.value.lng) : null));
const shortPlace = computed(() => locationDisplayName.value?.split(",")[0]?.trim() || null);

// --- Reminders (White days → Friday al-Kahf → adhkar) ---
const hijriToday = computed(() => {
  void nowHHMM.value;
  const d = getNow();
  try {
    const h = toCalendar(new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate()), new IslamicUmalquraCalendar());
    return { day: h.day, month: ISLAMIC_MONTHS[h.month - 1] ?? null };
  } catch {
    return null;
  }
});
const reminders = computed(() => {
  if (!timingsList.value.length) return [];
  const mins = (k: string) => timingByKey(k)?.minutes;
  const [h, m] = nowHHMM.value.split(":").map(Number);
  return stageReminders({
    nowMin: h! * 60 + m!,
    weekday: getNow().getDay(),
    hijriDay: hijriToday.value?.day ?? null,
    hijriMonth: hijriToday.value?.month ?? null,
    minutes: { fajr: mins("Fajr"), dhuhr: mins("Dhuhr"), asr: mins("Asr"), maghrib: mins("Maghrib") },
    maghribLabel: timingByKey("Maghrib")?.time,
  });
});

// --- Pray Together card ---
const liveCall = computed(() => activeCalls.calls.value[0] ?? null);
// The next of the five prayers (tomorrow's Fajr after ʿIshāʾ), for "Start a call for …".
const nextMainPrayer = computed(() => {
  const main = timingsList.value.filter((t) => MAIN_PRAYER_KEYS_SET.has(t.key) && typeof t.minutes === "number");
  const nowS = nowSecondsLive.value;
  return (main.find((t) => t.minutes! * 60 > nowS) ?? main[0])?.label ?? null;
});

// Short "in MM:SS"/"in HH:MM" badge next to the next prayer in the list.
const shortCountdown = computed(() => (countdownToNext.value || "").split(":").slice(0, 2).join(":"));

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
  await onFetchByCity();
  cueLocationSet();
}

function cueLocationSet() {
  if (!fetchError.value) cue("locationSet");
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

// A place picked from search, "Use my location", or the map: coordinates mode.
function onPlaceSelect(place: { lat: number; lng: number; label?: string }) {
  showLocationModal.value = false;
  locationMode.value = "gps";
  void onGpsLocationUpdate(place)?.then(cueLocationSet);
}

// Each new point takes the next number, so a slow place-name lookup for an
// earlier point can't overwrite the label of the current one.
let placeNameSeq = 0;

/** Returns the fetch when one starts, so callers can react to it. */
function onGpsLocationUpdate(coords: { lat: number; lng: number; label?: string } | null): Promise<void> | undefined {
  let fetching: Promise<void> | undefined;
  const seq = ++placeNameSeq;
  if (coords) {
    gpsLat.value = coords.lat;
    gpsLng.value = coords.lng;
    if (locationMode.value === 'gps') {
      fetching = fetchByCoordinates(coords.lat, coords.lng);
    }
    // Resolve the place name in the background unless the source already knew it.
    gpsCity.value = coords.label ?? null;
    if (!coords.label) {
      reverseGeocode(coords.lat, coords.lng).then((name) => {
        if (seq === placeNameSeq) gpsCity.value = name;
      });
    }
  } else {
    gpsLat.value = null;
    gpsLng.value = null;
    gpsCity.value = null;
  }
  return fetching;
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
    label: `Use my timezone (${userTimezone})`,
    value: userTimezone,
  });
  return items;
});

function onFetchByCity() {
  if (!selectedCity.value || !selectedCountry.value) return;
  return fetchPrayerTimingsByCity(selectedCity.value, selectedCountry.value, {
    methodId: selectedMethodId.value,
  });
}

function openQiblaModal() {
  showQiblaModal.value = true;
}

function openSettingsModal() {
  showSettingsModal.value = true;
}

function openCalendarDrawer() {
  showCalendarDrawer.value = true;
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

// First run (or location cleared): nothing to show until a place is chosen.
watch(
  prefsLoaded,
  (loaded) => {
    if (loaded && !hasLocation.value) showLocationModal.value = true;
  },
  { immediate: true },
);

onMounted(() => {
  // Quietly check for a newer release; the footer pill appears only if one exists.
  startUpdateChecks();

  // Pray Together call alerts: starts only if already signed in (on the apps this
  // also restores the saved session) — never prompts sign-in from here.
  void callAlerts.start();
});

// A prayer's time arrives while the app is open: the next-prayer pointer moves past a
// main prayer that started within the last minute and a half. Loading, a new
// location or the date rolling over move the pointer too, but not onto a prayer
// that has only just begun.
watch(upcomingKey, (_next, prev) => {
  if (!prev || !MAIN_PRAYER_KEYS_SET.has(prev)) return;
  const minutes = timingsList.value.find((t) => t.key === prev)?.minutes;
  if (typeof minutes !== "number") return;
  const since = getSecondsOfDay(getNow()) - minutes * 60;
  if (since >= 0 && since < 90) cue("prayerTime");
});

// Open the update dialog by itself once per release. The footer pill stays as the
// reminder if the user picks "Later" — re-checks never re-open it.
watch(isUpdateAvailable, (available) => {
  if (available && latestVersion.value && shouldPromptFor(latestVersion.value)) {
    showUpdateModal.value = true;
  }
});

// --- Times for a date picked in the calendar ---
// They live in their own state and their own block: "Today's prayers", the
// countdown, orbit, tray, widget and notifications always stay on today.
const selectedDateKey = computed(() => {
  const greg = toCalendar(calendarDate.value, new GregorianCalendar());
  return `${greg.year}-${pad2(greg.month)}-${pad2(greg.day)}`;
});
watch(
  [selectedDateKey, todayDateKey, prefsLoaded, selectedMethodId, locationMode, selectedCity, selectedCountry, gpsLat, gpsLng],
  () => void fetchSelectedDay(selectedDateKey.value),
  { immediate: true },
);
const selectedDayTimes = computed(() => {
  const day = selectedDay.value;
  if (!day || day.dateKey !== selectedDateKey.value) return [];
  return PRAYER_ORDER.flatMap(([key, label]) => {
    const m = String(day.timings[key] ?? "").match(/(\d{1,2}):(\d{2})/);
    if (!m) return [];
    return [{ key, label, time: formatMinutesLocal(Number(m[1]) * 60 + Number(m[2]), timeFormat.value === "24h") }];
  });
});
const selectedDayLabel = computed(() => {
  const greg = toCalendar(calendarDate.value, new GregorianCalendar());
  return formatGregorianVerbose(new Date(greg.year, greg.month - 1, greg.day)) ?? "";
});
</script>

<style></style>
