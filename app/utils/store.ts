import { load as loadTauriStore } from "@tauri-apps/plugin-store";
import type { TauriStore } from "@/utils/types";
import { isNative } from "@/utils/platform";

/** Kept for existing imports; prefer getPlatform()/isNative() in new code. */
export function isTauriAvailable(): boolean {
  return isNative();
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
        promise = loadTauriStore(filename, {
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

// --- Cache store key helper (used by prayer/usePrayerCache.ts) ---

export function cacheStoreKey(optionsKey: string): string {
  return `prayerCache:${optionsKey}`;
}
