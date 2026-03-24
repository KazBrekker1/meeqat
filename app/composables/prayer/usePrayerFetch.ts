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
import { PrayerTimingsResponseSchema } from "@/utils/schemas";
import { getCityCoordinates } from "@/constants/cities";

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

export function buildOptionsKey(params: FetchParams): string {
  const city = normalizeKeyPart(params.city);
  const country = normalizeKeyPart(params.country);
  const method = String(params.methodId);
  const tz = params.tz;
  const sh = params.shafaq;
  const cal = params.calendarMethod;
  const coordPart =
    params.lat != null ? `|@${params.lat},${params.lng}` : "";
  return `v1|${country}|${city}|m=${method}|tz=${tz}|sh=${sh}|cal=${cal}${coordPart}`;
}

function ddmmyyyyToYyyymmdd(ddmmyyyy: string): string | null {
  const m = ddmmyyyy.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function usePrayerFetch() {
  const state = usePrayerState();
  const cache = usePrayerCache();
  const { getNow } = useMockTime();

  // --- Current fetch context (for background refresh) ---
  let currentOptionsKey: string | null = null;
  let currentTargetDateKey: string | null = null;
  let currentFetchParams: FetchParams | null = null;
  let refreshPromise: Promise<void> | null = null;

  // --- Core fetch (single day, with Zod validation) ---
  async function doFreshFetch(
    params: FetchParams,
    optionsKey: string,
    targetDateKey: string,
    silent: boolean,
  ): Promise<void> {
    try {
      const parsedTarget = parseYyyyMmDd(targetDateKey);
      const targetDate = parsedTarget
        ? new Date(
            parsedTarget.year,
            parsedTarget.month - 1,
            parsedTarget.day,
          )
        : new Date();
      const dateParam = formatDdMmYyyy(targetDate);

      const url =
        params.lat != null && params.lng != null
          ? buildTimingsByCoordinatesUrl(dateParam, params as unknown as CoordParams)
          : buildTimingsByCityUrl(dateParam, params as unknown as CityParams);

      const raw = await $fetch(url, { method: "GET" });
      const res = PrayerTimingsResponseSchema.parse(raw);

      // Save to cache
      const newEntry: CachedDay = {
        timings: res.data.timings,
        dateReadable: res.data.date.readable,
        timezone: res.data.meta.timezone,
        methodName: res.data.meta.method?.name ?? null,
        savedAt: Date.now(),
      };
      await cache.setCachedDay(optionsKey, targetDateKey, newEntry);

      // Update UI state
      state.timings.value = res.data.timings;
      state.dateReadable.value = res.data.date.readable;
      state.timezone.value = res.data.meta.timezone;
      state.methodName.value = res.data.meta.method?.name ?? null;
      state.isStale.value = false;
      state.fetchError.value = null;

      // Prefetch upcoming days in background (calendar-based)
      void cache.prefetchUpcoming(
        params.lat != null && params.lng != null
          ? (params as unknown as CoordParams)
          : (params as unknown as CityParams),
        optionsKey,
        targetDate,
      );
      // Cleanup old entries
      void cache.cleanupOldEntries(optionsKey);
    } catch (err) {
      if (!silent) {
        const message = err instanceof Error ? err.message : "Unknown error";
        state.fetchError.value = message;
      }
    }
  }

  // --- Background refresh ---
  async function refreshInBackground(): Promise<void> {
    if (!currentFetchParams || !currentOptionsKey || !currentTargetDateKey)
      return;
    if (refreshPromise) return;
    if (state.isOffline.value) return;

    refreshPromise = doFreshFetch(
      currentFetchParams,
      currentOptionsKey,
      currentTargetDateKey,
      true,
    ).finally(() => {
      refreshPromise = null;
    });
  }

  // --- SWR: check cache, serve stale, refresh in background ---
  async function fetchWithSWR(
    fetchParams: FetchParams,
    dateOption?: string,
  ): Promise<void> {
    state.isFetching.value = true;
    state.fetchError.value = null;
    state.isStale.value = false;

    try {
      const targetDateKey = dateOption
        ? (ddmmyyyyToYyyymmdd(dateOption) ?? getDateKey(getNow()))
        : getDateKey(getNow());

      const optionsKey = buildOptionsKey(fetchParams);

      // Store context for background refresh
      currentOptionsKey = optionsKey;
      currentTargetDateKey = targetDateKey;
      currentFetchParams = fetchParams;

      // Step 1: Check cache
      const cached = await cache.getCachedDay(optionsKey, targetDateKey);

      if (cached) {
        state.timings.value = cached.timings;
        state.dateReadable.value = cached.dateReadable;
        state.timezone.value = cached.timezone;
        state.methodName.value = cached.methodName;

        const stale = cache.isCacheStale(cached);
        state.isStale.value = stale;

        if (stale && !state.isOffline.value) {
          state.isFetching.value = false;
          void refreshInBackground();
          return;
        }

        // Cache is fresh
        state.isFetching.value = false;
        return;
      }

      // Step 2: No cache — must fetch
      if (state.isOffline.value) {
        state.fetchError.value =
          "You're offline and no cached data is available for this date.";
        state.timings.value = null;
        state.isFetching.value = false;
        return;
      }

      await doFreshFetch(fetchParams, optionsKey, targetDateKey, false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      state.fetchError.value = message;
      state.timings.value = null;
    } finally {
      state.isFetching.value = false;
    }
  }

  // --- Public fetch methods ---

  async function fetchPrayerTimingsByCity(
    city: string,
    country: string,
    options?: {
      methodId?: number;
      shafaq?: string;
      calendarMethod?: string;
      date?: string;
    },
  ): Promise<void> {
    const tz = getUserTimezone();
    const methodId = options?.methodId ?? state.selectedMethodId.value;
    const shafaq = options?.shafaq ?? "general";
    const calendarMethod = options?.calendarMethod ?? "UAQ";
    const coords = getCityCoordinates(country, city);
    const fetchParams: FetchParams = {
      city,
      country,
      methodId,
      tz,
      shafaq,
      calendarMethod,
      lat: coords?.lat,
      lng: coords?.lng,
    };
    await fetchWithSWR(fetchParams, options?.date);
  }

  async function fetchByCoordinates(
    lat: number,
    lng: number,
    options?: { methodId?: number; date?: string },
  ): Promise<void> {
    const tz = getUserTimezone();
    const methodId = options?.methodId ?? state.selectedMethodId.value;
    const fetchParams: FetchParams = {
      city: "gps",
      country: "gps",
      methodId,
      tz,
      shafaq: "general",
      calendarMethod: "UAQ",
      lat,
      lng,
    };
    await fetchWithSWR(fetchParams, options?.date);
  }

  return {
    fetchPrayerTimingsByCity,
    fetchByCoordinates,
    refreshInBackground,
  };
}
