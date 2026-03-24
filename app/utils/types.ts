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
