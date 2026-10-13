import type { CachedDay } from "@/utils/types";
import {
  getDateKey,
  getUserTimezone,
  parseYyyyMmDd,
  formatDdMmYyyy,
} from "@/utils/time";
import {
  buildTimingsByCoordinatesUrl,
  buildTimingsByCityUrl,
  type CoordParams,
  type CityParams,
} from "@/utils/api";
import { parsePrayerTimingsResponse } from "@/utils/schemas";
import { getCityCoordinates } from "@/constants/cities";
import { MAIN_PRAYER_KEYS } from "@/constants/prayers";

/** A single prayer for scheduling: key, label, and minutes-after-midnight. */
export type UpcomingPrayer = { key: string; label: string; minutes: number };
/** One calendar day of main prayers, resolved from the per-day cache. */
export type UpcomingDay = { dateKey: string; date: Date; prayers: UpcomingPrayer[] };

const MAIN_PRAYERS = MAIN_PRAYER_KEYS.map((key) => ({ key, label: key }));

export type FetchParams = {
  city: string;
  country: string;
  methodId: number;
  tz: string;
  shafaq: string;
  calendarMethod: string;
  lat?: number;
  lng?: number;
};

// --- Options key for cache keying ---
function normalizeKeyPart(s: string): string {
  return s.trim().toLowerCase();
}

// Coordinates are rounded to ~1 km in the key so every GPS fix in the same
// neighbourhood shares one cache entry (the request still uses the exact point).
function roundCoord(n: number): string {
  return n.toFixed(2);
}

export function buildOptionsKey(params: FetchParams): string {
  const city = normalizeKeyPart(params.city);
  const country = normalizeKeyPart(params.country);
  const method = String(params.methodId);
  const tz = params.tz;
  const sh = params.shafaq;
  const cal = params.calendarMethod;
  const coordPart =
    params.lat != null && params.lng != null
      ? `|@${roundCoord(params.lat)},${roundCoord(params.lng)}`
      : "";
  return `v1|${country}|${city}|m=${method}|tz=${tz}|sh=${sh}|cal=${cal}${coordPart}`;
}

/** Build a properly typed CoordParams or CityParams from FetchParams. */
function toApiParams(params: FetchParams): CoordParams | CityParams {
  const base = {
    methodId: params.methodId,
    shafaq: params.shafaq,
    tz: params.tz,
    calendarMethod: params.calendarMethod,
  };
  if (params.lat != null && params.lng != null) {
    return { ...base, lat: params.lat, lng: params.lng } satisfies CoordParams;
  }
  return { ...base, city: params.city, country: params.country } satisfies CityParams;
}

export function usePrayerFetch() {
  const state = usePrayerState();
  const cache = usePrayerCache();
  const { getNow } = useMockTime();

  // --- Current fetch context (for background refresh) ---
  let currentOptionsKey: string | null = null;
  let currentTargetDateKey: string | null = null;
  let currentFetchParams: FetchParams | null = null;
  // Every fetch for today takes the next number; a response is applied only while
  // its number is still the latest, so a slow answer for the previous city (or
  // method) can never overwrite the current one.
  let requestSeq = 0;
  // The request whose background refresh is in flight (0: none).
  let refreshingSeq = 0;
  // Cached data is being shown past its freshness window and still needs a refresh.
  let needsRefresh = false;
  // Same idea for the date picked in the calendar.
  let selectedSeq = 0;
  // Place/method + date the selected-day state currently holds.
  let selectedShownFor: string | null = null;

  function dateFromKey(dateKey: string): Date {
    const parsed = parseYyyyMmDd(dateKey);
    return parsed
      ? new Date(parsed.year, parsed.month - 1, parsed.day)
      : new Date();
  }

  // --- Core fetch (single day, validated) — network + cache only, no UI state ---
  // `stillWanted` is asked once the response is in: a superseded request (the
  // user has moved to another place) must not leave its day behind in the cache.
  async function fetchDay(
    params: FetchParams,
    optionsKey: string,
    targetDateKey: string,
    stillWanted: () => boolean,
  ): Promise<CachedDay> {
    const dateParam = formatDdMmYyyy(dateFromKey(targetDateKey));

    const apiParams = toApiParams(params);
    const url =
      "lat" in apiParams
        ? buildTimingsByCoordinatesUrl(dateParam, apiParams)
        : buildTimingsByCityUrl(dateParam, apiParams);

    const raw = await $fetch(url, { method: "GET" });
    const res = parsePrayerTimingsResponse(raw);

    // Save to cache
    const newEntry: CachedDay = {
      timings: res.data.timings,
      dateReadable: res.data.date.readable,
      timezone: res.data.meta.timezone,
      methodName: res.data.meta.method?.name ?? null,
      savedAt: Date.now(),
    };
    if (stillWanted())
      await cache.setCachedDay(optionsKey, targetDateKey, newEntry);
    return newEntry;
  }

  function showToday(day: CachedDay): void {
    state.timings.value = day.timings;
    state.dateReadable.value = day.dateReadable;
    state.timezone.value = day.timezone;
    state.methodName.value = day.methodName;
  }

  // Prefetch upcoming days in background (calendar-based). When new days land for
  // the place still on screen, drop other places' caches and tell notifications
  // and the widget to re-read the upcoming days.
  async function prefetchUpcoming(
    params: FetchParams,
    optionsKey: string,
    targetDateKey: string,
    seq: number,
  ): Promise<void> {
    const wrote = await cache.prefetchUpcoming(
      toApiParams(params),
      optionsKey,
      dateFromKey(targetDateKey),
    );
    if (!wrote || seq !== requestSeq) return;
    await cache.removeOtherLocations(optionsKey);
    state.cacheVersion.value++;
  }

  async function doFreshFetch(
    params: FetchParams,
    optionsKey: string,
    targetDateKey: string,
    silent: boolean,
    seq: number,
  ): Promise<void> {
    try {
      const day = await fetchDay(
        params,
        optionsKey,
        targetDateKey,
        () => seq === requestSeq,
      );
      if (seq !== requestSeq) return; // superseded while in flight

      // Update UI state
      showToday(day);
      state.isStale.value = false;
      state.fetchError.value = null;
      needsRefresh = false;
      state.cacheVersion.value++;

      void prefetchUpcoming(params, optionsKey, targetDateKey, seq);
    } catch (err) {
      if (seq !== requestSeq) return;
      if (silent) {
        // Keep showing the cached times, but stop saying "Refreshing…"; the next
        // reconnect or day change tries again (needsRefresh stays set).
        state.isStale.value = false;
      } else {
        const message = err instanceof Error ? err.message : "Unknown error";
        state.fetchError.value = message;
      }
    }
  }

  // --- Background refresh ---
  async function refreshInBackground(): Promise<void> {
    if (!currentFetchParams || !currentOptionsKey || !currentTargetDateKey)
      return;
    if (!needsRefresh) return;
    const seq = requestSeq;
    // Only skip when a refresh for this same request is already running; one for
    // a previous place is superseded and must not block this one.
    if (refreshingSeq === seq) return;
    if (state.isOffline.value) return;

    refreshingSeq = seq;
    state.isStale.value = true;
    await doFreshFetch(
      currentFetchParams,
      currentOptionsKey,
      currentTargetDateKey,
      true,
      seq,
    ).finally(() => {
      if (refreshingSeq === seq) refreshingSeq = 0;
    });
  }

  // --- SWR: check cache, serve stale, refresh in background ---
  async function fetchWithSWR(fetchParams: FetchParams): Promise<void> {
    const seq = ++requestSeq;
    state.isFetching.value = true;
    state.fetchError.value = null;
    state.isStale.value = false;
    needsRefresh = false;

    try {
      const targetDateKey = getDateKey(getNow());

      const optionsKey = buildOptionsKey(fetchParams);
      // Another place/method, or a new day: the upcoming days are different ones.
      const windowChanged =
        optionsKey !== currentOptionsKey ||
        targetDateKey !== currentTargetDateKey;

      // Store context for background refresh
      currentOptionsKey = optionsKey;
      currentTargetDateKey = targetDateKey;
      currentFetchParams = fetchParams;

      // Step 1: Check cache
      const cached = await cache.getCachedDay(optionsKey, targetDateKey);
      if (seq !== requestSeq) return;

      if (cached) {
        showToday(cached);
        if (windowChanged) state.cacheVersion.value++;

        if (cache.isCacheStale(cached)) {
          needsRefresh = true;
          state.isStale.value = true;
          if (!state.isOffline.value) void refreshInBackground();
          return;
        }

        // Cache is fresh — top up the upcoming days in background (a no-op when
        // the month is already cached and recent)
        void prefetchUpcoming(fetchParams, optionsKey, targetDateKey, seq);
        return;
      }

      // Step 2: No cache — must fetch
      if (state.isOffline.value) {
        state.fetchError.value =
          "You're offline and no cached data is available for this date.";
        state.timings.value = null;
        return;
      }

      await doFreshFetch(fetchParams, optionsKey, targetDateKey, false, seq);
    } catch (err) {
      if (seq !== requestSeq) return;
      const message = err instanceof Error ? err.message : "Unknown error";
      state.fetchError.value = message;
      state.timings.value = null;
    } finally {
      // A newer request owns the loading flag now.
      if (seq === requestSeq) state.isFetching.value = false;
    }
  }

  // --- Public fetch methods ---

  function cityParams(
    city: string,
    country: string,
    options?: { methodId?: number; shafaq?: string; calendarMethod?: string },
  ): FetchParams {
    const coords = getCityCoordinates(country, city);
    return {
      city,
      country,
      methodId: options?.methodId ?? state.selectedMethodId.value,
      tz: getUserTimezone(),
      shafaq: options?.shafaq ?? "general",
      calendarMethod: options?.calendarMethod ?? "UAQ",
      lat: coords?.lat,
      lng: coords?.lng,
    };
  }

  function coordParams(
    lat: number,
    lng: number,
    options?: { methodId?: number },
  ): FetchParams {
    return {
      city: "gps",
      country: "gps",
      methodId: options?.methodId ?? state.selectedMethodId.value,
      tz: getUserTimezone(),
      shafaq: "general",
      calendarMethod: "UAQ",
      lat,
      lng,
    };
  }

  /** Today's times for a city. Always today: other dates go through fetchSelectedDay. */
  async function fetchPrayerTimingsByCity(
    city: string,
    country: string,
    options?: {
      methodId?: number;
      shafaq?: string;
      calendarMethod?: string;
    },
  ): Promise<void> {
    await fetchWithSWR(cityParams(city, country, options));
  }

  /** Today's times for a point. Always today: other dates go through fetchSelectedDay. */
  async function fetchByCoordinates(
    lat: number,
    lng: number,
    options?: { methodId?: number },
  ): Promise<void> {
    await fetchWithSWR(coordParams(lat, lng, options));
  }

  /** The chosen place (GPS point or city) as fetch params; null when none is chosen. */
  function paramsForChosenPlace(): FetchParams | null {
    if (
      state.locationMode.value === "gps" &&
      state.gpsLat.value != null &&
      state.gpsLng.value != null
    ) {
      return coordParams(state.gpsLat.value, state.gpsLng.value);
    }
    if (state.selectedCity.value && state.selectedCountry.value) {
      return cityParams(state.selectedCity.value, state.selectedCountry.value);
    }
    return null;
  }

  /**
   * Times for a date picked in the calendar, for the chosen place. They go to
   * `selectedDay` and never touch today's state. Pass null (or today) to clear.
   */
  async function fetchSelectedDay(dateKey: string | null): Promise<void> {
    const seq = ++selectedSeq;
    const params = paramsForChosenPlace();
    if (!dateKey || !params || dateKey === getDateKey(getNow())) {
      state.selectedDay.value = null;
      selectedShownFor = null;
      return;
    }
    const optionsKey = buildOptionsKey(params);
    // Never show another date's (or place's) times under this date.
    if (selectedShownFor !== `${optionsKey}|${dateKey}`) {
      state.selectedDay.value = null;
      selectedShownFor = `${optionsKey}|${dateKey}`;
    }
    try {
      let day = await cache.getCachedDay(optionsKey, dateKey);
      if (!day && !state.isOffline.value)
        day = await fetchDay(
          params,
          optionsKey,
          dateKey,
          () => seq === selectedSeq,
        );
      if (seq !== selectedSeq) return;
      state.selectedDay.value = day ? { dateKey, timings: day.timings } : null;
    } catch {
      if (seq === selectedSeq) state.selectedDay.value = null;
    }
  }

  /**
   * Resolve tomorrow's first prayer (Fajr) from cached calendar data, at its
   * ACTUAL computed time — not today's Fajr + 24h, which drifts a minute or two
   * daily and is an hour off across a DST change. Returns null on a cache miss
   * (caller falls back to the +24h approximation). Uses the same options key and
   * cache as the active fetch context so it always matches the displayed city.
   */
  async function getNextDayFirstPrayer(): Promise<{
    prayerName: string;
    prayerTime: number;
    label: string;
  } | null> {
    if (!currentOptionsKey) return null;
    try {
      const now = getNow();
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);
      const cached = await cache.getCachedDay(currentOptionsKey, getDateKey(tomorrow));
      const fajrRaw = cached?.timings?.Fajr;
      if (!fajrRaw) return null;
      const m = String(fajrRaw).match(/(\d{1,2}):(\d{2})/);
      if (!m) return null;
      const minutes = Number(m[1]) * 60 + Number(m[2]);
      const t = new Date(tomorrow);
      t.setHours(0, 0, 0, 0);
      t.setMinutes(minutes);
      return { prayerName: "Fajr", prayerTime: t.getTime(), label: "Fajr" };
    } catch {
      return null;
    }
  }

  /**
   * Resolve the next `days` calendar days of prayers (starting today) from the
   * per-day cache, at their ACTUAL computed times. Prayer times drift a minute
   * or two daily, so notifications must be scheduled from real per-day data —
   * not today's times repeated. Days missing from the cache are skipped (the
   * month is prefetched, so misses are rare and self-heal on next fetch). Uses
   * the active fetch context's options key so results match the displayed
   * location. Returns [] before any fetch has established a context.
   * `wanted` picks which times to resolve (default: the five prayers).
   */
  async function getUpcomingDays(
    days: number,
    wanted: readonly { key: string; label: string }[] = MAIN_PRAYERS,
  ): Promise<UpcomingDay[]> {
    if (!currentOptionsKey) return [];
    const now = getNow();
    // One read of the cached map for the whole window.
    const cached = await cache.getCacheForOptions(currentOptionsKey);
    const result: UpcomingDay[] = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + i,
      );
      const dateKey = getDateKey(date);
      const timings = cached[dateKey]?.timings;
      if (!timings) continue;

      const prayers: UpcomingPrayer[] = [];
      for (const { key, label } of wanted) {
        const raw = timings[key];
        if (!raw) continue;
        const m = String(raw).match(/(\d{1,2}):(\d{2})/);
        if (!m) continue;
        prayers.push({
          key,
          label,
          minutes: Number(m[1]) * 60 + Number(m[2]),
        });
      }
      if (prayers.length) result.push({ dateKey, date, prayers });
    }
    return result;
  }

  return {
    fetchPrayerTimingsByCity,
    fetchByCoordinates,
    fetchSelectedDay,
    refreshInBackground,
    getNextDayFirstPrayer,
    getUpcomingDays,
  };
}
