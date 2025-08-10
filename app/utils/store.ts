import type { CacheMap, TauriStore } from "@/utils/types";

export function isTauriAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as any;
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
    } catch {}
    return {};
  }
  async function writeAll(obj: Record<string, unknown>): Promise<void> {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(obj));
    } catch {}
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

let storePromise: Promise<TauriStore> | null = null;
export function getStore(): Promise<TauriStore> {
  if (!storePromise) {
    if (!isTauriAvailable()) {
      storePromise = Promise.resolve(createWebFallbackStore("settings.bin"));
    } else {
      storePromise = useTauriStoreLoad("settings.bin", { autoSave: true });
    }
  }
  return storePromise;
}

export function cacheStoreKey(optionsKey: string): string {
  return `prayerCache:${optionsKey}`;
}

export async function getCacheForOptions(
  optionsKey: string
): Promise<CacheMap> {
  const store = await getStore();
  const key = cacheStoreKey(optionsKey);
  const existing = (await store.get<CacheMap>(key)) ?? {};
  return existing;
}

export async function setCacheForOptions(
  optionsKey: string,
  cache: CacheMap
): Promise<void> {
  const store = await getStore();
  const key = cacheStoreKey(optionsKey);
  await store.set(key, cache);
  if (store.save) await store.save();
}
