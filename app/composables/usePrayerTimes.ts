import {
  computePreviousPrayerInfo,
  getDateKey,
  getMinutesOfDay,
  getTimeDiff,
  formatTimeDiff,
  resetToMidnight,
  getUserTimezone,
} from "@/utils/time";
import { PRAYER_ORDER, ADDITIONAL_PRAYER_KEYS_SET, PRAYER_DESCRIPTIONS, ISLAMIC_MONTHS } from "@/constants/prayers";
import type { CachedDay, PrayerTimingsResponse, PrayerTimingItem } from "@/utils/types";
import {
  toCalendar,
  CalendarDate,
  IslamicUmalquraCalendar,
} from "@internationalized/date";

// Cache configuration
const CACHE_STALE_MS = 24 * 60 * 60 * 1000; // Consider stale after 24 hours
const PREFETCH_DAYS = 30; // Pre-cache 30 days ahead
const CLEANUP_DAYS = 7; // Remove entries older than 7 days in the past

export function usePrayerTimes() {
  // --- Core state ---
  const fetchError = ref<string | null>(null);
  const isFetchingTimings = ref(false);
  const timings = ref<Record<string, string> | null>(null);
  const dateReadable = ref<string | null>(null);
  const timezone = ref<string | null>(null);
  const methodName = ref<string | null>(null);
  const selectedMethodId = ref<number>(4);
  const selectedCity = ref<string>("");
  const selectedCountry = ref<string>("");
  const selectedExtraTimezone = ref<string>("");
  const timeFormat = ref<"24h" | "12h">("24h");
  const showAdditionalTimes = ref(false); // Show Ishraq, Duha, Tahajjud, etc.

  // --- New: Stale/Offline indicators ---
  const isStale = ref(false);
  const isOffline = ref(false);

  const is24Hour = computed(() => timeFormat.value === "24h");

  // --- Time tracking (with mock time support) ---
  const { getNow } = useMockTime();
  const now = ref<Date>(getNow());
  let intervalId: ReturnType<typeof setInterval> | null = null;
  onMounted(() => {
    intervalId = setInterval(() => {
      now.value = getNow();
    }, 1000);

    // Track online/offline status
    isOffline.value = typeof navigator !== "undefined" && !navigator.onLine;
    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
    }
  });
  onBeforeUnmount(() => {
    if (intervalId) clearInterval(intervalId);
    if (typeof window !== "undefined") {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    }
  });

  function handleOnline() {
    isOffline.value = false;
    // Auto-refresh if data was stale
    if (isStale.value && selectedCity.value && selectedCountry.value) {
      refreshInBackground();
    }
  }

  function handleOffline() {
    isOffline.value = true;
  }

  const currentTimeString = computed(() =>
    formatTime(now.value, is24Hour, undefined, true)
  );

  // --- Athan audio ---
  const playedKeysForDate = new Set<string>();
  let lastPlayedDateKey = "";
  const isAthanActive = ref(false);
  const { startAthan, dismissAthan, testPlayAthan } =
    createAthanController(isAthanActive);

  // Extract date portion only (changes once per day, not every second)
  const todayDate = computed(() => {
    const d = now.value;
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
  });

  const hijriDateVerbose = computed<string | null>(() => {
    try {
      // Use @internationalized/date for reliable Hijri date formatting
      // Intl.DateTimeFormat with islamic-umalqura is not supported on all Android WebViews
      const { year, month, day } = todayDate.value;
      const gregorianDate = new CalendarDate(year, month, day);
      const islamicDate = toCalendar(gregorianDate, new IslamicUmalquraCalendar());

      const monthName = ISLAMIC_MONTHS[islamicDate.month - 1] || `Month ${islamicDate.month}`;
      return `${islamicDate.day} ${monthName} ${islamicDate.year} AH`;
    } catch (e) {
      console.error("[usePrayerTimes] Failed to format Hijri date:", e);
      return null;
    }
  });

  const gregorianDateVerbose = computed<string | null>(() => {
    try {
      const { year, month, day } = todayDate.value;
      return new Intl.DateTimeFormat("en-US", {
        calendar: "gregory",
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(new Date(year, month - 1, day));
    } catch {
      return null;
    }
  });

  // --- Cache key helpers ---
  function normalizeKeyPart(s: string): string {
    return s.trim().toLowerCase();
  }

  function buildOptionsKey(params: {
    city: string;
    country: string;
    methodId: number;
    tz: string;
    shafaq: string;
    calendarMethod: string;
  }): string {
    const city = normalizeKeyPart(params.city);
    const country = normalizeKeyPart(params.country);
    const method = String(params.methodId);
    const tz = params.tz;
    const sh = params.shafaq;
    const cal = params.calendarMethod;
    return `v1|${country}|${city}|m=${method}|tz=${tz}|sh=${sh}|cal=${cal}`;
  }

  function ddmmyyyyToYyyymmdd(ddmmyyyy: string): string | null {
    const m = ddmmyyyy.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (!m) return null;
    const [_, dd, mm, yyyy] = m;
    return `${yyyy}-${mm}-${dd}`;
  }

  function isCacheStale(cached: CachedDay): boolean {
    return Date.now() - cached.savedAt > CACHE_STALE_MS;
  }

  // --- Current fetch context (for background refresh) ---
  let currentOptionsKey: string | null = null;
  let currentTargetDateKey: string | null = null;
  let currentFetchParams: {
    city: string;
    country: string;
    methodId: number;
    tz: string;
    shafaq: string;
    calendarMethod: string;
  } | null = null;

  // --- Background refresh logic ---
  let refreshPromise: Promise<void> | null = null;

  async function refreshInBackground(): Promise<void> {
    if (!currentFetchParams || !currentOptionsKey || !currentTargetDateKey) return;
    if (refreshPromise) return; // Already refreshing
    if (isOffline.value) return;

    refreshPromise = doFreshFetch(
      currentFetchParams,
      currentOptionsKey,
      currentTargetDateKey,
      true // silent mode
    ).finally(() => {
      refreshPromise = null;
    });
  }

  async function doFreshFetch(
    params: {
      city: string;
      country: string;
      methodId: number;
      tz: string;
      shafaq: string;
      calendarMethod: string;
    },
    optionsKey: string,
    targetDateKey: string,
    silent: boolean
  ): Promise<void> {
    try {
      // Fetch the target day
      const parsedTarget = parseYyyyMmDd(targetDateKey);
      const targetDate = parsedTarget
        ? new Date(parsedTarget.year, parsedTarget.month - 1, parsedTarget.day)
        : new Date();
      const dateParam = formatDdMmYyyy(targetDate);

      const url = buildTimingsByCityUrl(
        dateParam,
        params.city,
        params.country,
        params.methodId,
        params.shafaq,
        params.tz,
        params.calendarMethod
      );

      const res = await $fetch<PrayerTimingsResponse>(url, { method: "GET" });

      if (!res || res.code !== 200) {
        if (!silent) {
          throw new Error(res?.status || "Failed to fetch prayer times");
        }
        return;
      }

      // Save to cache
      const newEntry: CachedDay = {
        timings: res.data.timings,
        dateReadable: res.data.date.readable,
        timezone: res.data.meta.timezone,
        methodName: res.data.meta.method?.name ?? null,
        savedAt: Date.now(),
      };
      await setCachedDay(optionsKey, targetDateKey, newEntry);

      // Update UI state
      timings.value = res.data.timings;
      dateReadable.value = res.data.date.readable;
      timezone.value = res.data.meta.timezone;
      methodName.value = res.data.meta.method?.name ?? null;
      isStale.value = false;
      fetchError.value = null;

      // Prefetch upcoming days in background (non-blocking)
      void prefetchUpcomingDays(params, optionsKey, targetDate);

      // Cleanup old entries in background (non-blocking)
      void cleanupOldCacheEntries(optionsKey, CLEANUP_DAYS);
    } catch (err) {
      if (!silent) {
        const message = err instanceof Error ? err.message : "Unknown error";
        fetchError.value = message;
      }
      // In silent mode, keep showing stale data
    }
  }

  async function prefetchUpcomingDays(
    params: {
      city: string;
      country: string;
      methodId: number;
      tz: string;
      shafaq: string;
      calendarMethod: string;
    },
    optionsKey: string,
    startDate: Date
  ): Promise<void> {
    if (isOffline.value) return;

    const cache = await getCacheForOptions(optionsKey);
    const entriesToFetch: Date[] = [];

    // Find dates that need fetching (missing or stale)
    for (let i = 1; i <= PREFETCH_DAYS; i++) {
      const date = addDays(startDate, i);
      const dateKey = getDateKey(date);
      const cached = cache[dateKey];
      if (!cached || isCacheStale(cached)) {
        entriesToFetch.push(date);
      }
    }

    if (entriesToFetch.length === 0) return;

    // Fetch in batches of 5 to avoid overwhelming the API
    const batchSize = 5;
    const newEntries: Record<string, CachedDay> = {};

    for (let i = 0; i < entriesToFetch.length; i += batchSize) {
      const batch = entriesToFetch.slice(i, i + batchSize);
      const promises = batch.map(async (date) => {
        try {
          const dateParam = formatDdMmYyyy(date);
          const url = buildTimingsByCityUrl(
            dateParam,
            params.city,
            params.country,
            params.methodId,
            params.shafaq,
            params.tz,
            params.calendarMethod
          );
          const res = await $fetch<PrayerTimingsResponse>(url, { method: "GET" });
          if (res && res.code === 200) {
            const dateKey = getDateKey(date);
            newEntries[dateKey] = {
              timings: res.data.timings,
              dateReadable: res.data.date.readable,
              timezone: res.data.meta.timezone,
              methodName: res.data.meta.method?.name ?? null,
              savedAt: Date.now(),
            };
          }
        } catch {
          // Ignore individual fetch errors during prefetch
        }
      });
      await Promise.all(promises);
    }

    // Save all new entries at once
    if (Object.keys(newEntries).length > 0) {
      await setCachedDays(optionsKey, newEntries);
    }
  }

  // --- Main fetch function (Stale-While-Revalidate) ---
  async function fetchPrayerTimingsByCity(
    city: string,
    country: string,
    options?: {
      methodId?: number;
      shafaq?: string;
      calendarMethod?: string;
      date?: string; // dd-mm-yyyy
    }
  ) {
    isFetchingTimings.value = true;
    fetchError.value = null;
    isStale.value = false;

    try {
      const tz = getUserTimezone();
      const methodId = options?.methodId ?? selectedMethodId.value;
      const shafaq = options?.shafaq ?? "general";
      const calendarMethod = options?.calendarMethod ?? "UAQ";

      // Determine target date key (YYYY-MM-DD)
      let targetDateKey: string;
      if (options?.date) {
        targetDateKey = ddmmyyyyToYyyymmdd(options.date) ?? getDateKey(new Date());
      } else {
        targetDateKey = getDateKey(new Date());
      }

      const fetchParams = { city, country, methodId, tz, shafaq, calendarMethod };
      const optionsKey = buildOptionsKey(fetchParams);

      // Store context for background refresh
      currentOptionsKey = optionsKey;
      currentTargetDateKey = targetDateKey;
      currentFetchParams = fetchParams;

      // Step 1: Check cache first
      const cached = await getCachedDay(optionsKey, targetDateKey);

      if (cached) {
        // Show cached data immediately (even if stale)
        timings.value = cached.timings;
        dateReadable.value = cached.dateReadable;
        timezone.value = cached.timezone;
        methodName.value = cached.methodName;

        const stale = isCacheStale(cached);
        isStale.value = stale;

        if (stale && !isOffline.value) {
          // Refresh in background, don't block UI
          isFetchingTimings.value = false;
          void refreshInBackground();
          return;
        }

        // Cache is fresh
        isFetchingTimings.value = false;

        // Still prefetch upcoming days in background
        const parsedTarget = parseYyyyMmDd(targetDateKey);
        const targetDate = parsedTarget
          ? new Date(parsedTarget.year, parsedTarget.month - 1, parsedTarget.day)
          : new Date();
        void prefetchUpcomingDays(fetchParams, optionsKey, targetDate);

        return;
      }

      // Step 2: No cache - must fetch
      if (isOffline.value) {
        fetchError.value = "You're offline and no cached data is available for this date.";
        timings.value = null;
        isFetchingTimings.value = false;
        return;
      }

      // Fetch fresh data (blocking)
      await doFreshFetch(fetchParams, optionsKey, targetDateKey, false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      fetchError.value = message;
      timings.value = null;
    } finally {
      isFetchingTimings.value = false;
    }
  }

  // --- Preferences ---
  async function loadPreferences() {
    try {
      const store = await getStore();
      const method = await store.get<number>("methodId");
      const city = await store.get<string>("city");
      const country = await store.get<string>("country");
      const extraTz = await store.get<string>("extraTimezone");
      const fmt = await store.get<string>("timeFormat");
      const additionalTimes = await store.get<boolean>("showAdditionalTimes");
      if (typeof method === "number") selectedMethodId.value = method;
      if (typeof city === "string") selectedCity.value = city;
      if (typeof country === "string" && country)
        selectedCountry.value = country;
      if (typeof extraTz === "string" && extraTz) {
        selectedExtraTimezone.value = extraTz;
      }
      if (fmt === "24h" || fmt === "12h") {
        timeFormat.value = fmt;
      }
      if (typeof additionalTimes === "boolean") {
        showAdditionalTimes.value = additionalTimes;
      }
    } catch (e) {
      console.warn("[usePrayerTimes] Failed to load preferences:", e);
    }
  }

  async function savePreferences() {
    try {
      const store = await getStore();
      await store.set("methodId", selectedMethodId.value);
      await store.set("city", selectedCity.value);
      await store.set("country", selectedCountry.value ?? "");
      await store.set("extraTimezone", selectedExtraTimezone.value ?? "");
      await store.set("timeFormat", timeFormat.value);
      await store.set("showAdditionalTimes", showAdditionalTimes.value);
      if (store.save) await store.save();
    } catch (e) {
      console.warn("[usePrayerTimes] Failed to save preferences:", e);
    }
  }

  async function clearCache() {
    const store = await getStore();
    await store.clear();
  }

  watch(
    [
      selectedMethodId,
      selectedCity,
      selectedCountry,
      selectedExtraTimezone,
      timeFormat,
      showAdditionalTimes,
    ],
    () => {
      void savePreferences();
    }
  );

  // --- UI helpers ---
  const isLoading = computed(() => isFetchingTimings.value);

  function clearTimings(): void {
    timings.value = null;
    dateReadable.value = null;
    timezone.value = null;
    methodName.value = null;
    fetchError.value = null;
    isStale.value = false;
  }

  function parseTimeToMinutes(raw: string | undefined): number | null {
    if (!raw) return null;
    const cleaned = raw.trim();
    // 12h with AM/PM
    const ampmMatch = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (ampmMatch) {
      let hours = Number(ampmMatch[1]);
      const minutes = Number(ampmMatch[2]);
      const isPM = ampmMatch[3]?.toUpperCase() === "PM";
      if (hours === 12) hours = 0;
      const total = (isPM ? hours + 12 : hours) * 60 + minutes;
      return total;
    }
    // 24h
    const parts = cleaned.match(/^(\d{1,2}):(\d{2})/);
    if (!parts) return null;
    const h = Number(parts[1]);
    const m = Number(parts[2]);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  }

  const { nowSecondsOfDay } = buildCurrentTimeRefs(now);

  const userTimezone = computed(() => getUserTimezone());

  function computeAltTimeForTimezone(
    timeStr: string,
    targetTz: string | null
  ): string | undefined {
    if (!targetTz) return undefined;
    if (targetTz === userTimezone.value) return undefined;
    const mins = parseTimeToMinutes(timeStr);
    if (mins == null) return undefined;
    const base = resetToMidnight(new Date());
    base.setMinutes(mins);
    return formatDateInTimezone(base, is24Hour, targetTz);
  }

  // Extended prayer order including additional times
  const EXTENDED_ORDER: [string, string][] = [
    ["Imsak", "Imsak"],
    ["Fajr", "Fajr"],
    ["Sunrise", "Sunrise"],
    ["Dhuhr", "Dhuhr"],
    ["Asr", "Asr"],
    ["Maghrib", "Maghrib"],
    ["Isha", "Isha"],
    ["Midnight", "Midnight"],
    ["Firstthird", "First Third"],
    ["Lastthird", "Last Third"],
  ];

  // Base timings list - only recomputes when timings or settings change
  const baseTimingsList = computed<Omit<PrayerTimingItem, 'isPast' | 'isNext'>[]>(() => {
    if (!timings.value) return [];

    // Choose which prayer order to use based on settings
    const orderToUse = showAdditionalTimes.value ? EXTENDED_ORDER : PRAYER_ORDER;

    const list = orderToUse
      .filter(([key]) => Boolean(timings.value?.[key]))
      .map(([key, label]) => {
        const timeStr = (timings.value?.[key] ?? "") as string;
        const minutes = parseTimeToMinutes(timeStr) ?? undefined;
        const display =
          typeof minutes === "number"
            ? formatMinutesLocal(minutes as number, is24Hour)
            : timeStr;
        const description = PRAYER_DESCRIPTIONS[key] || undefined;
        const isAdditional = ADDITIONAL_PRAYER_KEYS_SET.has(key);
        return {
          key,
          label,
          time: display,
          minutes,
          altTime: computeAltTimeForTimezone(
            timeStr,
            selectedExtraTimezone.value
          ),
          description,
          isAdditional,
        };
      })
      // Sort by minutes to ensure correct order
      .sort((a, b) => {
        if (typeof a.minutes !== "number") return 1;
        if (typeof b.minutes !== "number") return -1;
        return a.minutes - b.minutes;
      });

    return list;
  });

  // Timings list with isPast/isNext - only recomputes flags every second
  const timingsList = computed<PrayerTimingItem[]>(() => {
    const list = baseTimingsList.value;
    if (list.length === 0) return [];

    const nowS = nowSecondsOfDay.value;
    let nextIndex = list.findIndex((t) =>
      typeof t.minutes === "number" ? (t.minutes as number) * 60 > nowS : false
    );
    if (nextIndex === -1) nextIndex = 0;

    return list.map((t, idx) => ({
      ...t,
      isPast:
        typeof t.minutes === "number"
          ? (idx < nextIndex && nextIndex !== 0) ||
            (nextIndex === 0 && (t.minutes as number) * 60 < nowS)
          : false,
      isNext: idx === nextIndex,
    }));
  });

  const upcomingKey = computed(
    () => timingsList.value.find((t) => t.isNext)?.key ?? null
  );

  const nextPrayerLabel = computed<string | null>(() => {
    const next = timingsList.value.find((t) => t.isNext);
    return next?.label ?? null;
  });

  const countdownToNext = computed<string | null>(() => {
    const next = timingsList.value.find((t) => t.isNext);
    if (!next || typeof next.minutes !== "number") return null;
    const target = resetToMidnight(now.value);
    target.setMinutes(next.minutes as number, 0, 0);
    if (target.getTime() <= now.value.getTime()) {
      target.setDate(target.getDate() + 1);
    }
    return formatTimeDiff(getTimeDiff(now.value, target));
  });

  const previousPrayerInfo = computed(() =>
    computePreviousPrayerInfo(timingsList.value, now.value)
  );

  const previousPrayerLabel = computed<string | null>(() => {
    return previousPrayerInfo.value?.label ?? null;
  });

  const timeSincePrevious = computed<string | null>(() => {
    return previousPrayerInfo.value?.timeSince ?? null;
  });

  // --- Athan trigger ---
  watch([now, timingsList], () => {
    if (!timingsList.value.length) return;
    const key = getDateKey(now.value);
    if (key !== lastPlayedDateKey) {
      playedKeysForDate.clear();
      lastPlayedDateKey = key;
    }
    if (now.value.getSeconds() !== 0) return;
    const currentMins = getMinutesOfDay(now.value);
    const match = timingsList.value.find(
      (t) => typeof t.minutes === "number" && t.minutes === currentMins
    );
    if (match && !playedKeysForDate.has(match.key)) {
      playedKeysForDate.add(match.key);
      startAthan();
    }
  });

  return {
    // state
    isLoading,
    fetchError,
    timings,
    timingsList,
    timezone,
    methodName,
    currentTimeString,
    hijriDateVerbose,
    gregorianDateVerbose,
    selectedMethodId,
    selectedCity,
    selectedCountry,
    selectedExtraTimezone,
    timeFormat,
    is24Hour,
    showAdditionalTimes,

    // New: stale/offline indicators
    isStale,
    isOffline,

    // actions
    fetchPrayerTimingsByCity,
    loadPreferences,
    savePreferences,
    clearTimings,
    clearCache,

    // derived
    upcomingKey,
    userTimezone,
    nextPrayerLabel,
    countdownToNext,
    previousPrayerLabel,
    timeSincePrevious,

    // audio
    testPlayAthan,
    isAthanActive,
    startAthan,
    dismissAthan,
  };
}
