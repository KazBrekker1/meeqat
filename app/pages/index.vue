<template>
  <div class="h-screen w-full relative">
    <CelestialSkyBackground class="h-full" :stars="70" :seed="11" :lat="activeCoords?.lat ?? null" :lng="activeCoords?.lng ?? null">
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
            <StageOrbit :size="orbitSize" :now-seconds="nowSecondsLive" />
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

            <StageSchedule @choose-location="openLocation" />

            <!-- Mini calendar (desktop only) -->
            <StageMiniCalendar
              v-if="isWide"
              v-model:calendar-date="calendarDate"
              v-model:calendar-placeholder="calendarPlaceholder"
              :calendar-system="calendarSystem"
              :calendar-heading="calendarHeading"
              :selected-day-label="selectedDayLabel"
              :selected-day-times="selectedDayTimes"
              @toggle-calendar-system="toggleCalendarSystem"
              @select-today="selectToday"
            />

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
        <StageFooter />
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

    <!-- Settings Modal -->
    <PrayerSettingsModal v-model="showSettingsModal" />

    <!-- Location Modal (opened from the header) -->
    <PrayerLocationModal v-model:open="showLocationModal" />

    <!-- Qibla Modal (opened from the header) -->
    <UModal v-model:open="showQiblaModal" title="Qibla" description="Direction to the Kaaba in Makkah">
      <template #body>
        <PrayerQiblaCompass :lat="activeCoords?.lat ?? null" :lng="activeCoords?.lng ?? null" />
      </template>
    </UModal>

    <!-- Explore the sky (opened by tapping the Moon; ?sky=1) -->
    <SkyExplore v-if="activeCoords" :lat="activeCoords.lat" :lng="activeCoords.lng" :stops="exploreStops" />
  </div>
</template>

<script lang="ts" setup>
import { getSecondsOfDay } from "@/utils/time";
import { MAIN_PRAYER_KEYS_SET } from "@/constants/prayers";
import { getPlatform } from "@/utils/platform";
import { cue } from "@/utils/sounds";

const isWeb = getPlatform() === "web";
const callAlerts = useCallAlerts();
// Pray Together on the stage: active calls in my rooms, over the connection call alerts already hold.
const activeCalls = useActiveCalls();
const showCalendarDrawer = shallowRef(false);
const showSettingsModal = shallowRef(false);
const showLocationModal = shallowRef(false);
const showQiblaModal = shallowRef(false);

// Today's times, notifications, tray and widget sync run at app level (see
// usePrayerRuntime); this page reads that state and lays it out.
const {
  fetchError,
  timingsList,
  gregorianDateVerbose,
  currentTimeString,
  selectedCity,
  hijriDateVerbose,
  isStale,
  isOffline,
  locationMode,
  gpsCity,
  upcomingKey,
  hasLocation,
  activeCoords,
  prefsLoaded,
} = usePrayerRuntime();

// The calendar (mini calendar + drawer) and the times of the date picked in it.
const {
  calendarSystem,
  calendarDate,
  calendarPlaceholder,
  calendarHeading,
  formatTooltip,
  toggleCalendarSystem,
  selectToday,
  selectedDayTimes,
  selectedDayLabel,
} = useCalendarSelection();

// Moon/sun/Qibla chips, reminders and the next prayer for the Pray Together card.
const { nowSecondsLive, stageMoon, sunTimes, qibla, shortPlace, reminders, nextMainPrayer } = useStageToday();

// The time slider's stops in explore mode: today's five prayers.
const exploreStops = computed(() =>
  timingsList.value
    .filter((t) => MAIN_PRAYER_KEYS_SET.has(t.key) && typeof t.minutes === "number")
    .map((t) => ({ key: t.key, label: t.label, minutes: t.minutes! })),
);

function openLocation() {
  showLocationModal.value = true;
}

const { getNow } = useMockTime();

// --- Celestial redesign ---
useHead({ htmlAttrs: { class: "dark" } });

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

// --- Pray Together card ---
const liveCall = computed(() => activeCalls.calls.value[0] ?? null);

function openQiblaModal() {
  showQiblaModal.value = true;
}

function openSettingsModal() {
  showSettingsModal.value = true;
}

function openCalendarDrawer() {
  showCalendarDrawer.value = true;
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
</script>

<style></style>
