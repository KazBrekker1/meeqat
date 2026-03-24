import type { CacheMap, CachedDay } from "@/utils/types";
import { getDateKey, resetToMidnight } from "@/utils/time";
import { getCacheStore, cacheStoreKey } from "@/utils/store";
import {
  buildCalendarByCoordinatesUrl,
  buildCalendarByCityUrl,
  type CoordParams,
  type CityParams,
} from "@/utils/api";
import { PrayerCalendarResponseSchema } from "@/utils/schemas";

// --- Cache configuration ---
const CACHE_STALE_MS = 24 * 60 * 60 * 1000;
const CLEANUP_DAYS = 7;

export function usePrayerCache() {
  // --- Low-level cache access ---

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
    const cache = await getCacheForOptions(optionsKey);
    cache[dateKey] = data;
    await setCacheForOptions(optionsKey, cache);
  }

  async function setCachedDays(
    optionsKey: string,
    entries: Record<string, CachedDay>,
  ): Promise<void> {
    const cache = await getCacheForOptions(optionsKey);
    Object.assign(cache, entries);
    await setCacheForOptions(optionsKey, cache);
  }

  function isCacheStale(cached: CachedDay): boolean {
    return Date.now() - cached.savedAt > CACHE_STALE_MS;
  }

  // --- Cache cleanup ---

  async function cleanupOldEntries(
    optionsKey: string,
    daysToKeep = CLEANUP_DAYS,
  ): Promise<number> {
    const cache = await getCacheForOptions(optionsKey);
    const cutoffDate = resetToMidnight(new Date());
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const keysToRemove: string[] = [];
    for (const dateKey of Object.keys(cache)) {
      const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) continue;
      const entryDate = new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
      );
      if (entryDate < cutoffDate) {
        keysToRemove.push(dateKey);
      }
    }

    if (keysToRemove.length > 0) {
      for (const key of keysToRemove) {
        delete cache[key];
      }
      await setCacheForOptions(optionsKey, cache);
    }
    return keysToRemove.length;
  }

  // --- Calendar-based prefetch (1 call per month instead of 30 individual calls) ---

  async function prefetchMonth(
    params: CoordParams | CityParams,
    optionsKey: string,
    targetDate: Date,
  ): Promise<void> {
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth() + 1;

    const url =
      "lat" in params
        ? buildCalendarByCoordinatesUrl(year, month, params as CoordParams)
        : buildCalendarByCityUrl(year, month, params as CityParams);

    try {
      const raw = await $fetch(url, { method: "GET" });
      const res = PrayerCalendarResponseSchema.parse(raw);

      const entries: Record<string, CachedDay> = {};
      for (const day of res.data) {
        // Aladhan calendar returns DD-MM-YYYY in gregorian.date
        const ddmmyyyy = day.date.gregorian.date;
        const m = ddmmyyyy.match(/^(\d{2})-(\d{2})-(\d{4})$/);
        if (!m) continue;
        const dateKey = `${m[3]}-${m[2]}-${m[1]}`;
        entries[dateKey] = {
          timings: day.timings,
          dateReadable: day.date.readable,
          timezone: day.meta.timezone,
          methodName: day.meta.method?.name ?? null,
          savedAt: Date.now(),
        };
      }

      if (Object.keys(entries).length > 0) {
        await setCachedDays(optionsKey, entries);
      }
    } catch (err) {
      console.warn(
        "[usePrayerCache] Calendar prefetch failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  async function prefetchUpcoming(
    params: CoordParams | CityParams,
    optionsKey: string,
    targetDate: Date,
  ): Promise<void> {
    // Always prefetch current month
    await prefetchMonth(params, optionsKey, targetDate);

    // If within last 5 days of month, also prefetch next month
    const daysInMonth = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth() + 1,
      0,
    ).getDate();
    if (targetDate.getDate() > daysInMonth - 5) {
      const nextMonth = new Date(targetDate);
      nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
      await prefetchMonth(params, optionsKey, nextMonth);
    }
  }

  async function clearAllCache(): Promise<void> {
    const store = await getCacheStore();
    await store.clear();
  }

  return {
    getCachedDay,
    setCachedDay,
    setCachedDays,
    isCacheStale,
    cleanupOldEntries,
    prefetchUpcoming,
    clearAllCache,
  };
}
