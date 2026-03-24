import type { CacheMap, TauriStore, CachedDay } from "@/utils/types";
import { resetToMidnight } from "@/utils/time";

interface TauriWindow extends Window {
  __TAURI__?: { core?: { invoke?: unknown } };
  __TAURI_INTERNALS__?: { invoke?: unknown };
}

export function isTauriAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as TauriWindow;
  return Boolean(w.__TAURI__?.core?.invoke || w.__TAURI_INTERNALS__?.invoke);
}

export function createWebFallbackStore(localKey = "settings.bin"): TauriStore {
  const storageKey = `localStore:${localKey}`;
  function readAll(): Record<string, unknown> {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object")
        return parsed as Record<string, unknown>;
    } catch (e) {
      console.warn("[store] Failed to read localStorage:", e);
    }
    return {};
  }
  async function writeAll(obj: Record<string, unknown>): Promise<void> {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(obj));
    } catch (e) {
      console.warn("[store] Failed to write localStorage:", e);
    }
  }
  return {
    async get<T>(key: string): Promise<T | undefined> {
      const all = readAll();
      return all[key] as T | undefined;
    },
    async set(key: string, value: unknown): Promise<void> {
      const all = readAll();
      all[key] = value;
      await writeAll(all);
    },
    async save() {
      // no-op since we persist on set
    },
    async clear() {
      window.localStorage.removeItem(storageKey);
    },
  } as TauriStore;
}

// --- Store loading helper with retry-on-failure ---

function loadStore(filename: string): () => Promise<TauriStore> {
  let promise: Promise<TauriStore> | null = null;
  return () => {
    if (!promise) {
      if (!isTauriAvailable()) {
        promise = Promise.resolve(createWebFallbackStore(filename));
      } else {
        promise = useTauriStoreLoad(filename, {
          autoSave: true,
          defaults: {},
        }).catch((err) => {
          // Nullify so next call retries Tauri, then falls back to web
          promise = null;
          console.warn(`[store] Failed to load Tauri store "${filename}", falling back to web:`, err);
          return createWebFallbackStore(filename);
        });
      }
    }
    return promise;
  };
}

// --- Two separate stores ---

export const getSettingsStore = loadStore("settings.bin");
export const getCacheStore = loadStore("cache.bin");

// --- Cache helpers (now use getCacheStore) ---

export function cacheStoreKey(optionsKey: string): string {
  return `prayerCache:${optionsKey}`;
}

export async function getCacheForOptions(
  optionsKey: string
): Promise<CacheMap> {
  const store = await getCacheStore();
  const key = cacheStoreKey(optionsKey);
  const existing = (await store.get<CacheMap>(key)) ?? {};
  return existing;
}

export async function setCacheForOptions(
  optionsKey: string,
  cache: CacheMap
): Promise<void> {
  const store = await getCacheStore();
  const key = cacheStoreKey(optionsKey);
  await store.set(key, cache);
  if (store.save) await store.save();
}

/**
 * Remove cache entries for dates older than `daysToKeep` days in the past.
 * Returns the number of entries removed.
 */
export async function cleanupOldCacheEntries(
  optionsKey: string,
  daysToKeep: number = 7
): Promise<number> {
  const cache = await getCacheForOptions(optionsKey);
  const cutoffDate = resetToMidnight(new Date());
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  const keysToRemove: string[] = [];
  for (const dateKey of Object.keys(cache)) {
    // dateKey is YYYY-MM-DD
    const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) continue;
    const [_, year, month, day] = match;
    const entryDate = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      0,
      0,
      0,
      0
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

/**
 * Get a single cached day entry.
 */
export async function getCachedDay(
  optionsKey: string,
  dateKey: string
): Promise<CachedDay | null> {
  const cache = await getCacheForOptions(optionsKey);
  return cache[dateKey] ?? null;
}

/**
 * Set a single cached day entry.
 */
export async function setCachedDay(
  optionsKey: string,
  dateKey: string,
  data: CachedDay
): Promise<void> {
  const cache = await getCacheForOptions(optionsKey);
  cache[dateKey] = data;
  await setCacheForOptions(optionsKey, cache);
}

/**
 * Set multiple cached day entries at once (more efficient than calling setCachedDay multiple times).
 */
export async function setCachedDays(
  optionsKey: string,
  entries: Record<string, CachedDay>
): Promise<void> {
  const cache = await getCacheForOptions(optionsKey);
  Object.assign(cache, entries);
  await setCacheForOptions(optionsKey, cache);
}
