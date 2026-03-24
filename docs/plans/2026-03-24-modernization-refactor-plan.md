# Meeqat Modernization Refactor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor the Meeqat prayer times app for better code organization, performance, robustness, and modern patterns.

**Architecture:** Split the 775-line `usePrayerTimes.ts` into focused composables under `prayer/`, migrate shared state to Nuxt `useState`, add Zod validation for API responses, switch to calendar-based bulk fetching, and fix anti-patterns throughout.

**Tech Stack:** Nuxt 4, Vue 3, Tauri 2, TypeScript, Zod (new), Aladhan API v1

**Verification:** This project has no test suite. Use `bun run generate` (Nuxt SSG build) to catch TypeScript and import errors. Manual smoke testing for runtime behavior.

---

## Phase 1: Foundation

### Task 1: Install Zod and Create Schemas

**Files:**
- Modify: `package.json`
- Create: `app/utils/schemas.ts`
- Modify: `app/utils/types.ts` (remove `PrayerTimingsResponse`)

**Step 1: Install zod**

```bash
bun add zod
```

**Step 2: Create schemas file**

Create `app/utils/schemas.ts`:

```ts
import { z } from "zod";

// --- Shared sub-schemas ---

const TimingsSchema = z.record(z.string(), z.string());

const DateInfoSchema = z.object({
  readable: z.string(),
  timestamp: z.string(),
  gregorian: z.object({ date: z.string() }),
  hijri: z.object({ date: z.string() }),
});

const MetaSchema = z.object({
  timezone: z.string(),
  method: z.object({ id: z.number(), name: z.string() }),
  latitude: z.number(),
  longitude: z.number(),
});

const DayDataSchema = z.object({
  timings: TimingsSchema,
  date: DateInfoSchema,
  meta: MetaSchema,
});

// --- Single-day response (for on-demand date picks) ---
export const PrayerTimingsResponseSchema = z.object({
  code: z.literal(200),
  data: DayDataSchema,
});

// --- Calendar/month response (replaces 30 individual prefetch calls) ---
export const PrayerCalendarResponseSchema = z.object({
  code: z.literal(200),
  data: z.array(DayDataSchema),
});

export type PrayerTimingsResponse = z.infer<typeof PrayerTimingsResponseSchema>;
export type PrayerCalendarResponse = z.infer<typeof PrayerCalendarResponseSchema>;
export type DayData = z.infer<typeof DayDataSchema>;
```

**Step 3: Remove `PrayerTimingsResponse` from types.ts**

In `app/utils/types.ts`, delete the `PrayerTimingsResponse` interface (lines 1-19). Keep `PrayerTimingItem`, `CacheMap`, `TauriStore`, `CachedDay`.

The file becomes:

```ts
export interface PrayerTimingItem {
  key: string;
  label: string;
  time: string;
  minutes?: number;
  isPast?: boolean;
  isNext?: boolean;
  altTime?: string;
  description?: string;
  isAdditional?: boolean;
}

export type CacheMap = Record<string, CachedDay>;

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
```

**Step 4: Update the import in `usePrayerTimes.ts`**

Change:
```ts
import type { CachedDay, PrayerTimingsResponse, PrayerTimingItem } from "@/utils/types";
```
To:
```ts
import type { CachedDay, PrayerTimingItem } from "@/utils/types";
import type { PrayerTimingsResponse } from "@/utils/schemas";
```

**Step 5: Verify build**

```bash
bun run generate
```

**Step 6: Commit**

```bash
git add -A && git commit -m "feat: add zod schemas for API response validation"
```

---

### Task 2: Rewrite API URL Construction + Add Calendar Endpoints

**Files:**
- Rewrite: `app/utils/api.ts`

**Step 1: Rewrite `app/utils/api.ts`**

```ts
const ALADHAN_BASE = "https://api.aladhan.com/v1";

export const API_MIRRORS = [
  "https://api.aladhan.com/v1",
  "https://aladhan.api.islamic.network/v1",
] as const;

// --- Shared param types ---

export interface PrayerApiParams {
  methodId: number;
  shafaq: string;
  tz: string;
  calendarMethod: string;
}

export interface CityParams extends PrayerApiParams {
  city: string;
  country: string;
}

export interface CoordParams extends PrayerApiParams {
  lat: number;
  lng: number;
}

// --- URL builder ---

function buildUrl(
  base: string,
  endpoint: string,
  params: Record<string, string | number>,
): string {
  const url = new URL(`${base}/${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function sharedParams(p: PrayerApiParams): Record<string, string | number> {
  return {
    method: p.methodId,
    shafaq: p.shafaq,
    timezonestring: p.tz,
    calendarMethod: p.calendarMethod,
  };
}

// --- Single-day endpoints ---

export function buildTimingsByCoordinatesUrl(
  dateParam: string,
  params: CoordParams,
  base = ALADHAN_BASE,
): string {
  return buildUrl(base, `timings/${dateParam}`, {
    latitude: params.lat,
    longitude: params.lng,
    ...sharedParams(params),
  });
}

export function buildTimingsByCityUrl(
  dateParam: string,
  params: CityParams,
  base = ALADHAN_BASE,
): string {
  return buildUrl(base, `timingsByCity/${dateParam}`, {
    city: params.city,
    country: params.country,
    ...sharedParams(params),
  });
}

// --- Calendar endpoints (month at a time — replaces 30 individual calls) ---

export function buildCalendarByCoordinatesUrl(
  year: number,
  month: number,
  params: CoordParams,
  base = ALADHAN_BASE,
): string {
  return buildUrl(base, `calendar/${year}/${month}`, {
    latitude: params.lat,
    longitude: params.lng,
    ...sharedParams(params),
  });
}

export function buildCalendarByCityUrl(
  year: number,
  month: number,
  params: CityParams,
  base = ALADHAN_BASE,
): string {
  return buildUrl(base, `calendarByCity/${year}/${month}`, {
    city: params.city,
    country: params.country,
    ...sharedParams(params),
  });
}
```

**Step 2: Update imports in `usePrayerTimes.ts`**

The old `api.ts` exported two functions with inline params. The new one uses typed param objects. Update the call sites in `usePrayerTimes.ts`:

Find all calls to `buildTimingsByCoordinatesUrl` and `buildTimingsByCityUrl`. They currently pass individual args:
```ts
buildTimingsByCoordinatesUrl(dateParam, params.lat, params.lng, params.methodId, params.shafaq, params.tz, params.calendarMethod)
buildTimingsByCityUrl(dateParam, params.city, params.country, params.methodId, params.shafaq, params.tz, params.calendarMethod)
```

Change to:
```ts
buildTimingsByCoordinatesUrl(dateParam, params)
buildTimingsByCityUrl(dateParam, params)
```

This requires the `params` objects to have the right shape. Check that `fetchParams` in `doFreshFetch` and `prefetchUpcomingDays` match `CoordParams` or `CityParams` (they should — same fields, the types just need `lat`/`lng` for coords or `city`/`country` for city).

Also update the import at the top of `usePrayerTimes.ts` — it currently imports from `@/utils/api`. No path change needed, but the function signatures changed.

**Step 3: Verify build**

```bash
bun run generate
```

**Step 4: Commit**

```bash
git add -A && git commit -m "refactor: rewrite API URL construction with URL/URLSearchParams and add calendar endpoints"
```

---

## Phase 2: Low-Risk Fixes

### Task 3: Remove Dead Athan Code

**Files:**
- Delete: `app/utils/audio.ts`
- Modify: `app/composables/usePrayerTimes.ts` (remove athan refs + commented watcher)
- Modify: `app/pages/index.vue` (remove athan props)
- Modify: `app/components/prayer/TopBar.vue` (remove athan dismiss button + props)
- Modify: `app/components/prayer/SettingsModal.vue` (remove test athan button + prop)

**Step 1: Delete `app/utils/audio.ts`**

```bash
rm app/utils/audio.ts
```

**Step 2: Clean up `usePrayerTimes.ts`**

Remove these lines/blocks:
- Lines 102-105: athan audio section (`isAthanActive`, `createAthanController` import + call)
- Lines 705-722: commented-out athan watcher block
- Lines 769-773: athan exports (`testPlayAthan`, `isAthanActive`, `startAthan`, `dismissAthan`)

Also remove the import of `createAthanController` from `@/utils/audio` (it's auto-imported, so find where it's resolved).

**Step 3: Clean up `index.vue`**

Remove from template:
- Line 8-9: `:is-athan-active` and `:dismiss-athan` props on `PrayerTopBar`
- Line 121: `:test-play-athan` prop on `PrayerSettingsModal`

Remove from script:
- Lines 307-309: `testPlayAthan`, `isAthanActive`, `dismissAthan` destructuring from `usePrayerTimes()`

**Step 4: Clean up `TopBar.vue`**

Remove from template:
- Lines 24-34: The athan dismiss `<UButton>` block (the `v-if="isAthanActive && dismissAthan"` button)

Remove from props:
- Lines 55-56: `isAthanActive` and `dismissAthan` props

**Step 5: Clean up `SettingsModal.vue`**

Remove from template:
- Lines 319-329: The "Test Athan" `<UButton>` block

Remove from props:
- Line 509: `testPlayAthan` prop

**Step 6: Verify build**

```bash
bun run generate
```

**Step 7: Commit**

```bash
git add -A && git commit -m "chore: remove dead athan audio code"
```

---

### Task 4: Fix `store.ts` — Typed Window + Remove Deprecated Alias

**Files:**
- Modify: `app/utils/store.ts`

**Step 1: Add typed `TauriWindow` interface and remove `getStore` alias**

At the top of `store.ts`, replace `isTauriAvailable`:

```ts
interface TauriWindow extends Window {
  __TAURI__?: { core?: { invoke?: unknown } };
  __TAURI_INTERNALS__?: { invoke?: unknown };
}

export function isTauriAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as TauriWindow;
  return Boolean(w.__TAURI__?.core?.invoke || w.__TAURI_INTERNALS__?.invoke);
}
```

Delete line 81-82:
```ts
/** @deprecated Use getSettingsStore() — kept for backward compatibility */
export const getStore = getSettingsStore;
```

**Step 2: Verify no remaining references to `getStore`**

Search for `getStore` imports — there should be none (it was deprecated and unused).

**Step 3: Verify build**

```bash
bun run generate
```

**Step 4: Commit**

```bash
git add -A && git commit -m "fix: type-safe Tauri window detection, remove deprecated getStore alias"
```

---

### Task 5: Cache `Intl.DateTimeFormat` Instances in `format.ts`

**Files:**
- Modify: `app/utils/format.ts`

**Step 1: Add formatter cache and update `formatTime`**

Rewrite `app/utils/format.ts`:

```ts
import { resetToMidnight } from "@/utils/time";

// Cache Intl.DateTimeFormat instances — construction is ~10x slower than .format()
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getCachedFormatter(
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  let fmt = formatterCache.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(undefined, options);
    formatterCache.set(key, fmt);
  }
  return fmt;
}

export function formatTime(
  date: Date,
  is24Hour: ComputedRef<boolean> | boolean,
  tz?: string,
  includeSeconds = false,
): string {
  const twentyFour = typeof is24Hour === "boolean" ? is24Hour : is24Hour.value;
  const options: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    hour12: !twentyFour,
  };
  if (includeSeconds) options.second = "2-digit";
  if (tz) options.timeZone = tz;
  try {
    return getCachedFormatter(options).format(date).replace(/^24:/, "00:");
  } catch {
    return date
      .toLocaleTimeString(undefined, options as any)
      .replace(/^24:/, "00:");
  }
}

export function formatDateInTimezone(
  date: Date,
  is24Hour: ComputedRef<boolean> | boolean,
  tz: string,
): string {
  return formatTime(date, is24Hour, tz, false);
}

export function formatMinutesLocal(
  minutes: number,
  is24Hour: ComputedRef<boolean> | boolean,
): string {
  const base = resetToMidnight(new Date());
  base.setMinutes(minutes);
  return formatTime(base, is24Hour);
}
```

**Step 2: Verify build**

```bash
bun run generate
```

**Step 3: Commit**

```bash
git add -A && git commit -m "perf: cache Intl.DateTimeFormat instances in formatTime"
```

---

### Task 6: Fix Notification IDs — Deterministic Scheme

**Files:**
- Modify: `app/composables/useNotifications.ts`

**Step 1: Add deterministic ID function and update scheduling**

Add at the top of the file (after imports):

```ts
// Deterministic notification IDs to prevent collisions on reschedule.
// Each prayer gets a base ID; offset selects before/at/after.
const PRAYER_NOTIFICATION_BASE: Record<string, number> = {
  Fajr: 1000,
  Dhuhr: 2000,
  Asr: 3000,
  Maghrib: 4000,
  Isha: 5000,
};

function notificationId(
  prayerKey: string,
  type: "before" | "at" | "after",
): number {
  const base = PRAYER_NOTIFICATION_BASE[prayerKey] ?? 9000;
  const offset = type === "before" ? 1 : type === "at" ? 2 : 3;
  return base + offset;
}
```

In `schedulePrayerNotifications`, replace the sequential `notificationId++` counter with deterministic IDs. Replace the loop body (the `for (const prayer of list)` block):

```ts
      for (const prayer of list) {
        const prayerMinutes = prayer.minutes as number;
        const todayBase = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
        );

        // Schedule "before" notification
        if (minutesBefore > 0) {
          const beforeTime = new Date(
            todayBase.getTime() + (prayerMinutes - minutesBefore) * 60 * 1000,
          );
          if (beforeTime > now) {
            try {
              sendNotification({
                id: notificationId(prayer.key, "before"),
                channelId: PRAYER_CHANNEL_ID,
                title: "Meeqat - Prayer Reminder",
                body: `Athan for ${prayer.label} in ${minutesBefore} minutes`,
                schedule: Schedule.at(beforeTime),
              });
            } catch {
              // ignore scheduling errors
            }
          }
        }

        // Schedule "at prayer time" notification
        if (atPrayerTime) {
          const atTime = new Date(
            todayBase.getTime() + prayerMinutes * 60 * 1000,
          );
          if (atTime > now) {
            try {
              sendNotification({
                id: notificationId(prayer.key, "at"),
                channelId: PRAYER_CHANNEL_ID,
                title: "Meeqat - Prayer Time",
                body: `It's time for ${prayer.label}`,
                schedule: Schedule.at(atTime),
              });
            } catch {
              // ignore scheduling errors
            }
          }
        }

        // Schedule "after" notification (iqama reminder)
        if (minutesAfter > 0) {
          const afterTime = new Date(
            todayBase.getTime() + (prayerMinutes + minutesAfter) * 60 * 1000,
          );
          if (afterTime > now) {
            try {
              sendNotification({
                id: notificationId(prayer.key, "after"),
                channelId: PRAYER_CHANNEL_ID,
                title: "Meeqat - Iqama Reminder",
                body: `Get ready for Iqama for ${prayer.label}`,
                schedule: Schedule.at(afterTime),
              });
            } catch {
              // ignore scheduling errors
            }
          }
        }
      }
```

Remove the `let notificationId = 1;` declaration and update the log line:

```ts
      const scheduledCount = list.length * [minutesBefore > 0, atPrayerTime, minutesAfter > 0].filter(Boolean).length;
      console.log(`[useNotifications] Scheduled up to ${scheduledCount} notifications for ${dateKey}`);
```

**Step 2: Verify build**

```bash
bun run generate
```

**Step 3: Commit**

```bash
git add -A && git commit -m "fix: use deterministic notification IDs to prevent collisions"
```

---

### Task 7: Fix Tray Popover Grace State

**Files:**
- Modify: `app/composables/useTrayPopover.ts`

**Step 1: Consolidate grace state into an object**

Replace the module-level variables (lines 13-15):

```ts
let focusUnlisten: UnlistenFn | null = null;
let focusGraceTimer: ReturnType<typeof setTimeout> | null = null;
let focusGraceActive = false;
```

With:

```ts
let focusUnlisten: UnlistenFn | null = null;

const graceState = {
  timer: null as ReturnType<typeof setTimeout> | null,
  active: false,
  clear() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.active = false;
  },
  start(durationMs: number) {
    this.clear();
    this.active = true;
    this.timer = setTimeout(() => {
      this.active = false;
      this.timer = null;
    }, durationMs);
  },
};
```

Then update `showPopover` — replace lines 99-104:
```ts
    focusGraceActive = true;
    if (focusGraceTimer) clearTimeout(focusGraceTimer);
    focusGraceTimer = setTimeout(() => {
      focusGraceActive = false;
      focusGraceTimer = null;
    }, 300);
```
With:
```ts
    graceState.start(300);
```

Update the focus handler (line 108):
```ts
      if (!focused && !focusGraceActive) {
```
To:
```ts
      if (!focused && !graceState.active) {
```

Update `hidePopover` — replace lines 132-136:
```ts
  if (focusGraceTimer) {
    clearTimeout(focusGraceTimer);
    focusGraceTimer = null;
  }
  focusGraceActive = false;
```
With:
```ts
  graceState.clear();
```

Update the dev log (line 107):
```ts
      if (import.meta.dev) console.log("[TrayPopover] Focus changed:", focused, "grace:", focusGraceActive);
```
To:
```ts
      if (import.meta.dev) console.log("[TrayPopover] Focus changed:", focused, "grace:", graceState.active);
```

**Step 2: Verify build**

```bash
bun run generate
```

**Step 3: Commit**

```bash
git add -A && git commit -m "fix: consolidate tray popover grace state to prevent partial state"
```

---

### Task 8: Fix Geolocation User-Agent + Cache `platform()` in Tray Plugin

**Files:**
- Modify: `app/composables/useGeolocation.ts`
- Modify: `app/plugins/tray.client.ts`

**Step 1: Fix hardcoded User-Agent in `useGeolocation.ts`**

Add a constant at the top:

```ts
const APP_USER_AGENT = "Meeqat (prayer-times-app)";
```

Replace line 83:
```ts
        headers: { 'User-Agent': 'Meeqat/2.3.5 (prayer-times-app)' },
```
With:
```ts
        headers: { "User-Agent": APP_USER_AGENT },
```

**Step 2: Cache `platform()` call in `tray.client.ts`**

Currently `platform()` is called at lines 33, 53, 101, 102. Cache it once. After line 33:

```ts
  const currentPlatform = platform();
```

This already exists at line 33. But then lines 101-102 call `platform()` again:
```ts
  const isMac = platform() === "macos";
  const isWindows = platform() === "windows";
```

Change to:
```ts
  const isMac = currentPlatform === "macos";
  const isWindows = currentPlatform === "windows";
```

**Step 3: Verify build**

```bash
bun run generate
```

**Step 4: Commit**

```bash
git add -A && git commit -m "fix: remove hardcoded User-Agent version, cache platform() calls"
```

---

### Task 9: Migrate `useMockTime` to `useState`

**Files:**
- Modify: `app/composables/useMockTime.ts`

**Step 1: Replace module-level `ref` with `useState`**

Replace line 8:
```ts
const mockTimeOffsetMs = ref(0);
```
With:
```ts
const mockTimeOffsetMs = useState("mockTimeOffsetMs", () => 0);
```

No other changes needed — `useState` returns a `Ref`, so all existing code that reads/writes `.value` continues to work.

**Step 2: Verify build**

```bash
bun run generate
```

**Step 3: Commit**

```bash
git add -A && git commit -m "refactor: migrate useMockTime global ref to useState"
```

---

## Phase 3: Core Composable Split

### Task 10: Create `prayer/useState.ts` — Shared State

**Files:**
- Create: `app/composables/prayer/useState.ts`

**Step 1: Create the directory and file**

```bash
mkdir -p app/composables/prayer
```

Create `app/composables/prayer/useState.ts`:

```ts
export function usePrayerState() {
  // --- Core prayer data ---
  const timings = useState<Record<string, string> | null>(
    "prayer:timings",
    () => null,
  );
  const dateReadable = useState<string | null>(
    "prayer:dateReadable",
    () => null,
  );
  const timezone = useState<string | null>("prayer:timezone", () => null);
  const methodName = useState<string | null>("prayer:methodName", () => null);
  const fetchError = useState<string | null>("prayer:fetchError", () => null);
  const isFetching = useState("prayer:isFetching", () => false);
  const isStale = useState("prayer:isStale", () => false);
  const isOffline = useState("prayer:isOffline", () => false);

  // --- Preferences ---
  const selectedMethodId = useState("prayer:methodId", () => 4);
  const selectedCity = useState("prayer:city", () => "");
  const selectedCountry = useState("prayer:country", () => "");
  const selectedExtraTimezone = useState("prayer:extraTimezone", () => "");
  const timeFormat = useState<"24h" | "12h">("prayer:timeFormat", () => "24h");
  const showAdditionalTimes = useState(
    "prayer:showAdditionalTimes",
    () => false,
  );

  // --- GPS location ---
  const locationMode = useState<"city" | "gps">(
    "prayer:locationMode",
    () => "city",
  );
  const gpsLat = useState<number | null>("prayer:gpsLat", () => null);
  const gpsLng = useState<number | null>("prayer:gpsLng", () => null);
  const gpsCity = useState<string | null>("prayer:gpsCity", () => null);

  // --- Derived ---
  const is24Hour = computed(() => timeFormat.value === "24h");

  return {
    // core
    timings,
    dateReadable,
    timezone,
    methodName,
    fetchError,
    isFetching,
    isStale,
    isOffline,
    // preferences
    selectedMethodId,
    selectedCity,
    selectedCountry,
    selectedExtraTimezone,
    timeFormat,
    showAdditionalTimes,
    // GPS
    locationMode,
    gpsLat,
    gpsLng,
    gpsCity,
    // derived
    is24Hour,
  };
}
```

**Step 2: Verify build**

```bash
bun run generate
```

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: create prayer/useState composable for shared state"
```

---

### Task 11: Create `prayer/usePrayerCache.ts`

**Files:**
- Create: `app/composables/prayer/usePrayerCache.ts`
- Modify: `app/utils/store.ts` (remove prayer-specific cache helpers)

**Step 1: Create `app/composables/prayer/usePrayerCache.ts`**

This file takes the cache helpers from `store.ts` and adds calendar-based prefetch logic:

```ts
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
        ? buildCalendarByCoordinatesUrl(year, month, params)
        : buildCalendarByCityUrl(year, month, params);

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

  /**
   * Prefetch current month + next month if near end of month.
   * Replaces the old 30-individual-call approach.
   */
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
```

**Step 2: Trim `store.ts` — remove prayer-specific cache helpers**

Remove from `store.ts`:
- `getCacheForOptions` function (lines 90-97)
- `setCacheForOptions` function (lines 99-107)
- `cleanupOldCacheEntries` function (lines 113-149)
- `getCachedDay` function (lines 154-160)
- `setCachedDay` function (lines 165-173)
- `setCachedDays` function (lines 178-185)

Keep in `store.ts`:
- `isTauriAvailable`
- `createWebFallbackStore`
- `loadStore`
- `getSettingsStore`
- `getCacheStore`
- `cacheStoreKey` (still needed by `usePrayerCache.ts`)

Also remove the imports that are no longer needed:
- `CacheMap`, `CachedDay` from types
- `resetToMidnight` from time

**Step 3: Verify build**

```bash
bun run generate
```

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: create prayer/usePrayerCache with calendar-based prefetch"
```

---

### Task 12: Create `prayer/usePrayerFetch.ts`

**Files:**
- Create: `app/composables/prayer/usePrayerFetch.ts`

**Step 1: Create `app/composables/prayer/usePrayerFetch.ts`**

This extracts the SWR fetch logic, integrates Zod validation:

```ts
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

export type FetchParams = (CoordParams | CityParams) & {
  lat?: number;
  lng?: number;
  city?: string;
  country?: string;
};

// --- Options key for cache keying ---
function normalizeKeyPart(s: string): string {
  return s.trim().toLowerCase();
}

export function buildOptionsKey(params: FetchParams): string {
  const city = "city" in params ? normalizeKeyPart(params.city) : "gps";
  const country = "country" in params ? normalizeKeyPart(params.country) : "gps";
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
          ? buildTimingsByCoordinatesUrl(dateParam, params as CoordParams)
          : buildTimingsByCityUrl(dateParam, params as CityParams);

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
      void cache.prefetchUpcoming(params, optionsKey, targetDate);
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
```

**Step 2: Verify build**

```bash
bun run generate
```

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: create prayer/usePrayerFetch with SWR + Zod validation"
```

---

### Task 13: Create `prayer/usePrayerDisplay.ts`

**Files:**
- Create: `app/composables/prayer/usePrayerDisplay.ts`

**Step 1: Create `app/composables/prayer/usePrayerDisplay.ts`**

This extracts all display/computed logic:

```ts
import {
  computePreviousPrayerInfo,
  getDateKey,
  getTimeDiff,
  formatTimeDiff,
  resetToMidnight,
  getUserTimezone,
  buildCurrentTimeRefs,
} from "@/utils/time";
import {
  PRAYER_ORDER,
  ADDITIONAL_PRAYER_KEYS_SET,
  PRAYER_DESCRIPTIONS,
  ISLAMIC_MONTHS,
} from "@/constants/prayers";
import type { PrayerTimingItem } from "@/utils/types";
import {
  toCalendar,
  CalendarDate,
  IslamicUmalquraCalendar,
} from "@internationalized/date";

// Extended prayer order including additional times
const EXTENDED_ORDER: [string, string][] = [
  ["Imsak", "Imsak"],
  ["Fajr", "Fajr"],
  ["Sunrise", "Sunrise"],
  ["Dhuhr", "Dhuhr"],
  ["Asr", "Asr"],
  ["Maghrib", "Maghrib"],
  ["Isha", "Isha"],
  ["Midnight", "Midnight"],
  ["Firstthird", "First Third"],
  ["Lastthird", "Last Third"],
];

function parseTimeToMinutes(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.trim();
  // 12h with AM/PM
  const ampmMatch = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    let hours = Number(ampmMatch[1]);
    const minutes = Number(ampmMatch[2]);
    const isPM = ampmMatch[3]?.toUpperCase() === "PM";
    if (hours === 12) hours = 0;
    return (isPM ? hours + 12 : hours) * 60 + minutes;
  }
  // 24h
  const parts = cleaned.match(/^(\d{1,2}):(\d{2})/);
  if (!parts) return null;
  const h = Number(parts[1]);
  const m = Number(parts[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function usePrayerDisplay() {
  const state = usePrayerState();
  const { getNow } = useMockTime();

  // --- Time tracking ---
  const now = ref<Date>(getNow());
  let intervalId: ReturnType<typeof setInterval> | null = null;

  onMounted(() => {
    intervalId = setInterval(() => {
      now.value = getNow();
    }, 1000);
  });

  onBeforeUnmount(() => {
    if (intervalId) clearInterval(intervalId);
  });

  // --- Midnight rollover detection ---
  const todayDateKey = computed(() => getDateKey(now.value));

  const currentTimeString = computed(() =>
    formatTime(now.value, state.is24Hour, undefined, true),
  );

  // Date portion only (changes once per day)
  const todayDate = computed(() => {
    const d = now.value;
    return {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate(),
    };
  });

  const hijriDateVerbose = computed<string | null>(() => {
    try {
      const { year, month, day } = todayDate.value;
      const gregorianDate = new CalendarDate(year, month, day);
      const islamicDate = toCalendar(
        gregorianDate,
        new IslamicUmalquraCalendar(),
      );
      const monthName =
        ISLAMIC_MONTHS[islamicDate.month - 1] || `Month ${islamicDate.month}`;
      return `${islamicDate.day} ${monthName} ${islamicDate.year} AH`;
    } catch (e) {
      console.error("[usePrayerDisplay] Failed to format Hijri date:", e);
      return null;
    }
  });

  const gregorianDateVerbose = computed<string | null>(() => {
    try {
      const { year, month, day } = todayDate.value;
      return new Intl.DateTimeFormat("en-US", {
        calendar: "gregory",
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(new Date(year, month - 1, day));
    } catch {
      return null;
    }
  });

  // --- Timings list ---
  const userTimezone = computed(() => getUserTimezone());

  function computeAltTimeForTimezone(
    timeStr: string,
    targetTz: string | null,
  ): string | undefined {
    if (!targetTz) return undefined;
    if (targetTz === userTimezone.value) return undefined;
    const mins = parseTimeToMinutes(timeStr);
    if (mins == null) return undefined;
    const base = resetToMidnight(now.value);
    base.setMinutes(mins);
    return formatDateInTimezone(base, state.is24Hour, targetTz);
  }

  // Base timings — only recomputes when timings or settings change
  const baseTimingsList = computed<
    Omit<PrayerTimingItem, "isPast" | "isNext">[]
  >(() => {
    if (!state.timings.value) return [];

    const orderToUse = state.showAdditionalTimes.value
      ? EXTENDED_ORDER
      : PRAYER_ORDER;

    return orderToUse
      .filter(([key]) => Boolean(state.timings.value?.[key]))
      .map(([key, label]) => {
        const timeStr = (state.timings.value?.[key] ?? "") as string;
        const minutes = parseTimeToMinutes(timeStr) ?? undefined;
        const display =
          typeof minutes === "number"
            ? formatMinutesLocal(minutes, state.is24Hour)
            : timeStr;
        const description = PRAYER_DESCRIPTIONS[key] || undefined;
        const isAdditional = ADDITIONAL_PRAYER_KEYS_SET.has(key);
        return {
          key,
          label,
          time: display,
          minutes,
          altTime: computeAltTimeForTimezone(
            timeStr,
            state.selectedExtraTimezone.value,
          ),
          description,
          isAdditional,
        };
      })
      .sort((a, b) => {
        if (typeof a.minutes !== "number") return 1;
        if (typeof b.minutes !== "number") return -1;
        return a.minutes - b.minutes;
      });
  });

  const { nowSecondsOfDay } = buildCurrentTimeRefs(now);

  // Full timings list with isPast/isNext flags
  const timingsList = computed<PrayerTimingItem[]>(() => {
    const list = baseTimingsList.value;
    if (list.length === 0) return [];

    const nowS = nowSecondsOfDay.value;
    let nextIndex = list.findIndex(
      (t) =>
        typeof t.minutes === "number" && (t.minutes as number) * 60 > nowS,
    );
    if (nextIndex === -1) nextIndex = 0;

    return list.map((t, idx) => ({
      ...t,
      isPast:
        typeof t.minutes === "number"
          ? idx !== nextIndex &&
            ((idx < nextIndex && nextIndex !== 0) ||
              (nextIndex === 0 && (t.minutes as number) * 60 < nowS))
          : false,
      isNext: idx === nextIndex,
    }));
  });

  // --- Derived prayer info ---
  const upcomingKey = computed(
    () => timingsList.value.find((t) => t.isNext)?.key ?? null,
  );

  const nextPrayerLabel = computed<string | null>(
    () => timingsList.value.find((t) => t.isNext)?.label ?? null,
  );

  const countdownToNext = computed<string | null>(() => {
    const next = timingsList.value.find((t) => t.isNext);
    if (!next || typeof next.minutes !== "number") return null;
    const target = resetToMidnight(now.value);
    target.setMinutes(next.minutes as number, 0, 0);
    if (target.getTime() <= now.value.getTime()) {
      target.setDate(target.getDate() + 1);
    }
    return formatTimeDiff(getTimeDiff(now.value, target));
  });

  const previousPrayerInfo = computed(() =>
    computePreviousPrayerInfo(timingsList.value, now.value),
  );

  const previousPrayerLabel = computed<string | null>(
    () => previousPrayerInfo.value?.label ?? null,
  );

  const timeSincePrevious = computed<string | null>(
    () => previousPrayerInfo.value?.timeSince ?? null,
  );

  return {
    now,
    todayDateKey,
    currentTimeString,
    hijriDateVerbose,
    gregorianDateVerbose,
    timingsList,
    upcomingKey,
    userTimezone,
    nextPrayerLabel,
    countdownToNext,
    previousPrayerLabel,
    timeSincePrevious,
  };
}
```

**Step 2: Verify build**

```bash
bun run generate
```

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: create prayer/usePrayerDisplay for timing computations"
```

---

### Task 14: Rewrite `usePrayerTimes.ts` as Thin Orchestrator

**Files:**
- Rewrite: `app/composables/usePrayerTimes.ts`

**Step 1: Rewrite `usePrayerTimes.ts`**

This composes the sub-modules and handles preferences + lifecycle:

```ts
import { getSettingsStore } from "@/utils/store";

// --- Preferences as a single object for batch load/save ---
interface Preferences {
  methodId: number;
  city: string;
  country: string;
  extraTimezone: string;
  timeFormat: "24h" | "12h";
  showAdditionalTimes: boolean;
  locationMode: "city" | "gps";
  gpsLat: number | null;
  gpsLng: number | null;
  gpsCity: string | null;
}

const PREFERENCES_KEY = "preferences";

export function usePrayerTimes() {
  const state = usePrayerState();
  const display = usePrayerDisplay();
  const { fetchPrayerTimingsByCity, fetchByCoordinates, refreshInBackground } =
    usePrayerFetch();
  const { clearAllCache } = usePrayerCache();

  // --- Online/offline tracking ---
  function handleOnline() {
    state.isOffline.value = false;
    if (state.isStale.value) {
      refreshInBackground();
    }
  }

  function handleOffline() {
    state.isOffline.value = true;
  }

  onMounted(() => {
    state.isOffline.value =
      typeof navigator !== "undefined" && !navigator.onLine;
    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
    }
  });

  onBeforeUnmount(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    }
  });

  // --- Midnight rollover: auto-refetch when date changes ---
  watch(display.todayDateKey, () => {
    if (
      state.locationMode.value === "gps" &&
      state.gpsLat.value != null &&
      state.gpsLng.value != null
    ) {
      fetchByCoordinates(state.gpsLat.value, state.gpsLng.value);
    } else if (state.selectedCity.value && state.selectedCountry.value) {
      fetchPrayerTimingsByCity(
        state.selectedCity.value,
        state.selectedCountry.value,
        { methodId: state.selectedMethodId.value },
      );
    }
  });

  // --- Preferences load/save ---
  async function loadPreferences() {
    try {
      const store = await getSettingsStore();

      // Try new batch format first, fall back to individual keys
      const saved = await store.get<Preferences>(PREFERENCES_KEY);
      if (saved) {
        if (typeof saved.methodId === "number")
          state.selectedMethodId.value = saved.methodId;
        if (typeof saved.city === "string")
          state.selectedCity.value = saved.city;
        if (typeof saved.country === "string" && saved.country)
          state.selectedCountry.value = saved.country;
        if (typeof saved.extraTimezone === "string" && saved.extraTimezone)
          state.selectedExtraTimezone.value = saved.extraTimezone;
        if (saved.timeFormat === "24h" || saved.timeFormat === "12h")
          state.timeFormat.value = saved.timeFormat;
        if (typeof saved.showAdditionalTimes === "boolean")
          state.showAdditionalTimes.value = saved.showAdditionalTimes;
        if (saved.locationMode === "city" || saved.locationMode === "gps")
          state.locationMode.value = saved.locationMode;
        if (typeof saved.gpsLat === "number")
          state.gpsLat.value = saved.gpsLat;
        if (typeof saved.gpsLng === "number")
          state.gpsLng.value = saved.gpsLng;
        if (typeof saved.gpsCity === "string")
          state.gpsCity.value = saved.gpsCity;
        return;
      }

      // Migration: read individual keys from old format
      const method = await store.get<number>("methodId");
      const city = await store.get<string>("city");
      const country = await store.get<string>("country");
      const extraTz = await store.get<string>("extraTimezone");
      const fmt = await store.get<string>("timeFormat");
      const additionalTimes = await store.get<boolean>("showAdditionalTimes");
      const locMode = await store.get<string>("locationMode");
      const lat = await store.get<number>("gpsLat");
      const lng = await store.get<number>("gpsLng");
      const savedGpsCity = await store.get<string>("gpsCity");

      if (typeof method === "number") state.selectedMethodId.value = method;
      if (typeof city === "string") state.selectedCity.value = city;
      if (typeof country === "string" && country)
        state.selectedCountry.value = country;
      if (typeof extraTz === "string" && extraTz)
        state.selectedExtraTimezone.value = extraTz;
      if (fmt === "24h" || fmt === "12h") state.timeFormat.value = fmt;
      if (typeof additionalTimes === "boolean")
        state.showAdditionalTimes.value = additionalTimes;
      if (locMode === "city" || locMode === "gps")
        state.locationMode.value = locMode;
      if (typeof lat === "number") state.gpsLat.value = lat;
      if (typeof lng === "number") state.gpsLng.value = lng;
      if (typeof savedGpsCity === "string") state.gpsCity.value = savedGpsCity;

      // Save in new format for future loads
      await savePreferences();
    } catch (e) {
      console.warn("[usePrayerTimes] Failed to load preferences:", e);
    }
  }

  async function savePreferences() {
    try {
      const store = await getSettingsStore();
      const prefs: Preferences = {
        methodId: state.selectedMethodId.value,
        city: state.selectedCity.value,
        country: state.selectedCountry.value,
        extraTimezone: state.selectedExtraTimezone.value,
        timeFormat: state.timeFormat.value,
        showAdditionalTimes: state.showAdditionalTimes.value,
        locationMode: state.locationMode.value,
        gpsLat: state.gpsLat.value,
        gpsLng: state.gpsLng.value,
        gpsCity: state.gpsCity.value,
      };
      await store.set(PREFERENCES_KEY, prefs);
      if (store.save) await store.save();
    } catch (e) {
      console.warn("[usePrayerTimes] Failed to save preferences:", e);
    }
  }

  function clearTimings(): void {
    state.timings.value = null;
    state.dateReadable.value = null;
    state.timezone.value = null;
    state.methodName.value = null;
    state.fetchError.value = null;
    state.isStale.value = false;
  }

  // Auto-save preferences when any value changes
  watch(
    [
      state.selectedMethodId,
      state.selectedCity,
      state.selectedCountry,
      state.selectedExtraTimezone,
      state.timeFormat,
      state.showAdditionalTimes,
      state.locationMode,
      state.gpsLat,
      state.gpsLng,
      state.gpsCity,
    ],
    () => {
      void savePreferences();
    },
  );

  return {
    // state (from useState)
    isLoading: computed(() => state.isFetching.value),
    fetchError: state.fetchError,
    timings: state.timings,
    timezone: state.timezone,
    methodName: state.methodName,
    selectedMethodId: state.selectedMethodId,
    selectedCity: state.selectedCity,
    selectedCountry: state.selectedCountry,
    selectedExtraTimezone: state.selectedExtraTimezone,
    timeFormat: state.timeFormat,
    is24Hour: state.is24Hour,
    showAdditionalTimes: state.showAdditionalTimes,
    isStale: state.isStale,
    isOffline: state.isOffline,
    locationMode: state.locationMode,
    gpsLat: state.gpsLat,
    gpsLng: state.gpsLng,
    gpsCity: state.gpsCity,

    // display (from usePrayerDisplay)
    timingsList: display.timingsList,
    currentTimeString: display.currentTimeString,
    hijriDateVerbose: display.hijriDateVerbose,
    gregorianDateVerbose: display.gregorianDateVerbose,
    upcomingKey: display.upcomingKey,
    userTimezone: display.userTimezone,
    nextPrayerLabel: display.nextPrayerLabel,
    countdownToNext: display.countdownToNext,
    previousPrayerLabel: display.previousPrayerLabel,
    timeSincePrevious: display.timeSincePrevious,

    // actions
    fetchPrayerTimingsByCity,
    fetchByCoordinates,
    loadPreferences,
    savePreferences,
    clearTimings,
    clearCache: clearAllCache,
  };
}
```

**Step 2: Verify build**

```bash
bun run generate
```

**Step 3: Commit**

```bash
git add -A && git commit -m "refactor: rewrite usePrayerTimes as thin orchestrator over sub-composables"
```

---

## Phase 4: Consumer Updates

### Task 15: Update `index.vue` — Split Tray Watches

**Files:**
- Modify: `app/pages/index.vue`

**Step 1: Split the tray `watchThrottled` into two watches**

Replace the single `watchThrottled` block (lines 535-597) with two separate watches:

```ts
// Tray title update — throttle 1s (countdown changes every second)
watchThrottled(
  [nextPrayerLabel, countdownToNext],
  async () => {
    try {
      const titleCountdown = (countdownToNext.value ?? "")
        .split(":")
        .slice(0, 2)
        .join(":");
      const title =
        nextPrayerLabel.value && titleCountdown
          ? `${nextPrayerLabel.value} in ${titleCountdown}`
          : null;

      await emit("meeqat:tray:update", { title });
    } catch {
      // ignore emit errors in non-tauri/web
    }
  },
  { throttle: 1000 },
);

// Tray full data update — throttle 30s (data changes at most a few times per day)
watchThrottled(
  [
    gregorianDateVerbose,
    hijriDateVerbose,
    timingsList,
    () => locationMode.value === "gps" ? (gpsCity.value ?? "GPS") : selectedCity.value,
    () => locationMode.value === "gps" ? "" : selectedCountry.value,
  ],
  async () => {
    try {
      const dateLineParts: string[] = [];
      if (hijriDateVerbose.value)
        dateLineParts.push(`Hijri: ${hijriDateVerbose.value}`);
      if (gregorianDateVerbose.value)
        dateLineParts.push(`Gregorian: ${gregorianDateVerbose.value}`);
      const dateLine = dateLineParts.join(" | ");

      const list = (timingsList.value || [])
        .filter(
          (t) =>
            typeof t.minutes === "number" && MAIN_PRAYER_KEYS_SET.has(t.key),
        )
        .sort((a, b) => a.minutes! - b.minutes!);

      let nextLine = "Next: --";
      if (nextPrayerLabel.value && countdownToNext.value) {
        nextLine = `${nextPrayerLabel.value} in \t\t ${countdownToNext.value}`;
      }

      let sinceLine = "Last: --";
      if (previousPrayerLabel.value && timeSincePrevious.value) {
        sinceLine = `${previousPrayerLabel.value} since \t ${timeSincePrevious.value}`;
      }

      await emit("meeqat:tray:update", {
        dateLine,
        nextLine,
        sinceLine,
        hijriDate: hijriDateVerbose.value,
        gregorianDate: gregorianDateVerbose.value,
        nextPrayerLabel: nextPrayerLabel.value,
        countdown: countdownToNext.value,
        sincePrayerLabel: previousPrayerLabel.value ?? "",
        sinceTime: timeSincePrevious.value ?? "",
        timingsList: list,
        city:
          locationMode.value === "gps"
            ? (gpsCity.value ?? "GPS")
            : selectedCity.value,
        countryCode:
          locationMode.value === "gps" ? "" : selectedCountry.value,
      });
    } catch {
      // ignore emit errors in non-tauri/web
    }
  },
  { throttle: 30000 },
);
```

**Step 2: Verify build**

```bash
bun run generate
```

**Step 3: Commit**

```bash
git add -A && git commit -m "perf: split tray updates into 1s title + 30s full data watches"
```

---

## Phase 5: Verification

### Task 16: Full Build Verification + Smoke Test

**Step 1: Clean build**

```bash
rm -rf .nuxt dist
bun run generate
```

Expected: Build succeeds with no TypeScript errors.

**Step 2: Development mode smoke test**

```bash
bun run dev
```

Verify in browser (http://localhost:3000):
- [ ] Prayer times load for a city
- [ ] Time format toggle works (24h/12h)
- [ ] Calendar drawer opens and navigates dates
- [ ] Settings modal opens, method change triggers refetch
- [ ] GPS location toggle works (if available)
- [ ] Offline indicator shows when network is disabled
- [ ] No console errors

**Step 3: Tauri development mode**

```bash
bun run tauri:dev
```

Verify:
- [ ] Tray icon appears with countdown title
- [ ] Tray popover opens on click with prayer times
- [ ] Notifications schedule without errors (check console)
- [ ] App survives midnight rollover (use mock time if needed)

**Step 4: Final commit**

If any fixes were needed during smoke testing, commit them individually with descriptive messages.

---

## Dependency Graph

```
Phase 1 (foundation):    Task 1 → Task 2
Phase 2 (fixes):         Tasks 3-9 (all independent, can run in parallel)
Phase 3 (core split):    Task 10 → Task 11 → Task 12 → Task 13 → Task 14
Phase 4 (consumers):     Task 15 (depends on Phase 3)
Phase 5 (verification):  Task 16 (depends on all)
```

Phases 1 and 2 are independent and can run in parallel. Phase 3 must be sequential. Phase 4 depends on Phase 3.
