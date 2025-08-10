export interface PrayerTimingsResponse {
  code: number;
  status: string;
  data: {
    timings: Record<string, string>;
    date: {
      readable: string;
      timestamp: string;
      gregorian: { date: string };
      hijri: { date: string };
    };
    meta: {
      timezone: string;
      method: { id: number; name: string };
      latitude: number;
      longitude: number;
    };
  };
}

export interface PrayerTimingItem {
  key: string;
  label: string;
  time: string;
  minutes?: number;
  isPast?: boolean;
  isNext?: boolean;
  altTime?: string;
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
