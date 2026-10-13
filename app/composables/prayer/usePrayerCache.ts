import type { CacheMap, CachedDay } from "@/utils/types";
import {
  resetToMidnight,
  parseYyyyMmDd,
  ddmmyyyyToYyyymmdd,
  getDateKey,
} from "@/utils/time";
import { getCacheStore, cacheStoreKey, CACHE_KEY_PREFIX } from "@/utils/store";
import {
  buildCalendarByCoordinatesUrl,
  buildCalendarByCityUrl,
  type CoordParams,
  type CityParams,
} from "@/utils/api";
import { parsePrayerCalendarResponse } from "@/utils/schemas";

// --- Cache configuration ---
const CACHE_STALE_MS = 24 * 60 * 60 * 1000;
const CLEANUP_DAYS = 7;

// Every write is a read-modify-write of one store key, so writes run one at a
// time (module-level: the composable is instantiated more than once).
let writeQueue: Promise<unknown> = Promise.resolve();
function serialise<T>(task: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(task, task);
  writeQueue = run.catch(() => {});
  return run;
}

export function usePrayerCache() {
  // --- Low-level cache access ---

  /** The whole per-day map for one location/method — read once, look up many days. */
  async function getCacheForOptions(optionsKey: string): Promise<CacheMap> {
    const store = await getCacheStore();
    const key = cacheStoreKey(optionsKey);
    return (await store.get<CacheMap>(key)) ?? {};
  }

  async function setCacheForOptions(
    optionsKey: string,
    cache: CacheMap,
  ): Promise<void> {
    const store = await getCacheStore();
    const key = cacheStoreKey(optionsKey);
    await store.set(key, cache);
    if (store.save) await store.save();
  }

  async function getCachedDay(
    optionsKey: string,
    dateKey: string,
  ): Promise<CachedDay | null> {
    const cache = await getCacheForOptions(optionsKey);
    return cache[dateKey] ?? null;
  }

  async function setCachedDay(
    optionsKey: string,
    dateKey: string,
    data: CachedDay,
  ): Promise<void> {
    await setCachedDays(optionsKey, { [dateKey]: data });
  }

  /** Merge days into the map, dropping days more than a week old in the same write. */
  async function setCachedDays(
    optionsKey: string,
    entries: Record<string, CachedDay>,
  ): Promise<void> {
    await serialise(async () => {
      const cache = await getCacheForOptions(optionsKey);
      Object.assign(cache, entries);
      removeOldEntries(cache);
      await setCacheForOptions(optionsKey, cache);
    });
  }

  function isCacheStale(cached: CachedDay): boolean {
    return Date.now() - cached.savedAt > CACHE_STALE_MS;
  }

  // --- Cache cleanup ---

  function removeOldEntries(cache: CacheMap, daysToKeep = CLEANUP_DAYS): void {
    const cutoffDate = resetToMidnight(new Date());
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    for (const dateKey of Object.keys(cache)) {
      const parsed = parseYyyyMmDd(dateKey);
      if (!parsed) continue;
      const entryDate = new Date(parsed.year, parsed.month - 1, parsed.day);
      if (entryDate < cutoffDate) delete cache[dateKey];
    }
  }

  /**
   * Remove the cached days of every other location/method. Without this the
   * store grows by one map per place ever picked (and per GPS fix).
   */
  async function removeOtherLocations(optionsKey: string): Promise<void> {
    await serialise(async () => {
      const store = await getCacheStore();
      if (!store.keys || !store.delete) return;
      const keep = cacheStoreKey(optionsKey);
      let removed = false;
      for (const key of await store.keys()) {
        if (!key.startsWith(CACHE_KEY_PREFIX) || key === keep) continue;
        await store.delete(key);
        removed = true;
      }
      if (removed && store.save) await store.save();
    });
  }

  // --- Calendar-based prefetch (1 call per month instead of 30 individual calls) ---

  /** True when every day from `fromDay` to the end of that month is cached and recent. */
  function isMonthCached(cache: CacheMap, from: Date): boolean {
    const year = from.getFullYear();
    const month = from.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let day = from.getDate(); day <= daysInMonth; day++) {
      const entry = cache[getDateKey(new Date(year, month, day))];
      if (!entry || isCacheStale(entry)) return false;
    }
    return true;
  }

  async function fetchMonth(
    params: CoordParams | CityParams,
    targetDate: Date,
  ): Promise<Record<string, CachedDay>> {
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth() + 1;

    const url =
      "lat" in params
        ? buildCalendarByCoordinatesUrl(year, month, params as CoordParams)
        : buildCalendarByCityUrl(year, month, params as CityParams);

    const entries: Record<string, CachedDay> = {};
    try {
      const raw = await $fetch(url, { method: "GET" });
      const res = parsePrayerCalendarResponse(raw);

      for (const day of res.data) {
        const dateKey = ddmmyyyyToYyyymmdd(day.date.gregorian.date);
        if (!dateKey) continue;
        entries[dateKey] = {
          timings: day.timings,
          dateReadable: day.date.readable,
          timezone: day.meta.timezone,
          methodName: day.meta.method?.name ?? null,
          savedAt: Date.now(),
        };
      }
    } catch (err) {
      console.warn(
        "[usePrayerCache] Calendar prefetch failed:",
        err instanceof Error ? err.message : err,
      );
    }
    return entries;
  }

  /**
   * Cache the rest of the target date's month (and the next month in its last
   * week, so the 7-day notification/widget window never runs short). Months already cached and recent are not fetched again. Resolves to
   * whether any new days were written.
   */
  async function prefetchUpcoming(
    params: CoordParams | CityParams,
    optionsKey: string,
    targetDate: Date,
  ): Promise<boolean> {
    const months: Date[] = [targetDate];

    // If within last 7 days of month, also prefetch next month in parallel
    const daysInMonth = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth() + 1,
      0,
    ).getDate();
    if (targetDate.getDate() > daysInMonth - 7) {
      const nextMonth = new Date(targetDate);
      nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
      months.push(nextMonth);
    }

    const cache = await getCacheForOptions(optionsKey);
    const missing = months.filter((from) => !isMonthCached(cache, from));
    if (!missing.length) return false;

    const fetched = await Promise.all(
      missing.map((from) => fetchMonth(params, from)),
    );
    const entries = Object.assign({}, ...fetched) as Record<string, CachedDay>;
    if (Object.keys(entries).length === 0) return false;

    await setCachedDays(optionsKey, entries);
    return true;
  }

  async function clearAllCache(): Promise<void> {
    const store = await getCacheStore();
    await store.clear();
  }

  return {
    getCacheForOptions,
    getCachedDay,
    setCachedDay,
    setCachedDays,
    isCacheStale,
    removeOtherLocations,
    prefetchUpcoming,
    clearAllCache,
  };
}
