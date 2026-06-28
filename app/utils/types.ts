export interface PrayerTimingItem {
  key: string;
  label: string;
  time: string;
  minutes?: number;
  isPast?: boolean;
  isNext?: boolean;
  altTime?: string;
  description?: string;
  isAdditional?: boolean; // True for Ishraq, Duha, Tahajjud, etc.
}

export type CacheMap = Record<string, CachedDay>; // key: YYYY-MM-DD

/**
 * Payload for the `meeqat:tray:update` event (main window → tray window + tray
 * icon). Single source of truth for the IPC event contract — emitted by
 * index.vue, consumed by tray.vue (popover) and tray.client.ts (menu-bar title).
 * All fields optional: the 1s watcher sends a live subset, the 30s watcher the
 * full snapshot.
 */
export interface TrayUpdatePayload {
  title?: string | null;
  moonPhase?: number;
  now?: string; // current time as "HH:MM" (24h, mock-aware) for the orbit's now-dot
  dateLine?: string;
  nextLine?: string;
  sinceLine?: string;
  hijriDate?: string | null;
  gregorianDate?: string | null;
  nextPrayerLabel?: string | null;
  countdown?: string | null;
  sincePrayerLabel?: string;
  sinceTime?: string;
  city?: string;
  countryCode?: string;
  timingsList?: PrayerTimingItem[];
}

export type TauriStore = {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  clear: () => Promise<void>;
  save?: () => Promise<void>;
};

export type CachedDay = {
  timings: Record<string, string>;
  dateReadable: string;
  timezone: string;
  methodName: string | null;
  savedAt: number;
};
