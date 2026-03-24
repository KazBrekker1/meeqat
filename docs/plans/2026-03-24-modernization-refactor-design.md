# Meeqat Modernization & Refactor Design

**Date:** 2026-03-24
**Version:** 2.4.1 baseline
**Scope:** Code organization, performance, robustness, modern patterns

---

## 1. Composable Split & State Architecture

### Problem

`usePrayerTimes.ts` is 775 lines containing fetch logic, caching, display computation, preferences, lifecycle hooks, and athan stubs. Too many responsibilities in one file.

### Solution

Split into focused modules under `app/composables/prayer/`:

| File | Responsibility | ~Lines |
|---|---|---|
| `useState.ts` | Shared reactive state via Nuxt `useState` | ~60 |
| `usePrayerCache.ts` | Cache read/write/cleanup, calendar-based prefetch | ~120 |
| `usePrayerFetch.ts` | SWR fetch logic, API calls, background refresh | ~150 |
| `usePrayerDisplay.ts` | Timings list computation, countdown, dates | ~150 |
| `usePrayerTimes.ts` | Thin orchestrator, preferences, lifecycle | ~120 |

### State via `useState`

Shared state moves from scattered `ref()` declarations to Nuxt `useState` — singleton per key, shareable across components:

```ts
export function usePrayerState() {
  const timings = useState<Record<string, string> | null>('prayer:timings', () => null)
  const fetchError = useState<string | null>('prayer:fetchError', () => null)
  const isFetching = useState('prayer:isFetching', () => false)
  const isStale = useState('prayer:isStale', () => false)
  const isOffline = useState('prayer:isOffline', () => false)
  // ... preferences, GPS state, etc.
  return { timings, fetchError, isFetching, isStale, isOffline, ... }
}
```

Why `useState` over Pinia: single-page Tauri app with SSR disabled. `useState` gives singleton state for free without adding a dependency.

### Public API Preserved

`usePrayerTimes()` still returns the same refs and functions. Components don't change how they call it. The split is invisible to consumers.

---

## 2. Zod Validation & Calendar API Migration

### Problem

- API responses are trusted blindly — malformed data silently corrupts state
- Prefetching makes up to 30 individual API calls (batch of 5, with circuit breaker)
- URL construction uses fragile string concatenation

### Solution: Calendar Endpoints

Switch from `/v1/timings/{date}` (one day) to `/v1/calendar/{year}/{month}` (entire month in 1 call). Collapses 30 calls into 1-2. Eliminates batch logic, circuit breaker, and consecutive-failure tracking.

### Zod Schemas (`app/utils/schemas.ts`)

```ts
import { z } from 'zod'

const TimingsSchema = z.record(z.string(), z.string())

const DateInfoSchema = z.object({
  readable: z.string(),
  timestamp: z.string(),
  gregorian: z.object({ date: z.string() }),
  hijri: z.object({ date: z.string() }),
})

const MetaSchema = z.object({
  timezone: z.string(),
  method: z.object({ id: z.number(), name: z.string() }),
  latitude: z.number(),
  longitude: z.number(),
})

// Single-day response (kept for on-demand date picks)
export const PrayerTimingsResponseSchema = z.object({
  code: z.literal(200),
  data: z.object({
    timings: TimingsSchema,
    date: DateInfoSchema,
    meta: MetaSchema,
  }),
})

// Calendar/month response (replaces 30 individual calls)
export const PrayerCalendarResponseSchema = z.object({
  code: z.literal(200),
  data: z.array(z.object({
    timings: TimingsSchema,
    date: DateInfoSchema,
    meta: MetaSchema,
  })),
})
```

### URL Construction (`app/utils/api.ts`)

Replace string concatenation with `URL` + `URLSearchParams`:

```ts
const ALADHAN_BASE = 'https://api.aladhan.com/v1'

const API_MIRRORS = [
  'https://api.aladhan.com/v1',
  'https://aladhan.api.islamic.network/v1',
] as const

function buildUrl(base: string, endpoint: string, params: Record<string, string | number>): string {
  const url = new URL(`${base}/${endpoint}`)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value))
  }
  return url.toString()
}
```

New calendar endpoints: `buildCalendarUrl`, `buildCalendarByCityUrl`.

### Validation fires once, right after `$fetch`:

```ts
const raw = await $fetch(url, { method: 'GET' })
const res = PrayerCalendarResponseSchema.parse(raw)
```

ZodError surfaces like any other fetch error — no silent corruption.

---

## 3. Anti-Pattern Fixes

### 3a. Notification ID Collisions

**Problem:** Sequential counter starting at 1 risks collisions on reschedule.

**Fix:** Deterministic IDs based on prayer key + timing type:

```ts
const PRAYER_ID_BASE: Record<string, number> = {
  Fajr: 1000, Dhuhr: 2000, Asr: 3000, Maghrib: 4000, Isha: 5000,
}

function notificationId(prayerKey: string, type: 'before' | 'at' | 'after'): number {
  const base = PRAYER_ID_BASE[prayerKey] ?? 9000
  const offset = type === 'before' ? 1 : type === 'at' ? 2 : 3
  return base + offset
}
```

### 3b. Tray Popover Grace State

Consolidate `focusGraceTimer`, `focusGraceActive` into a single object to prevent partial state.

### 3c. Dead Code Removal

- Delete `app/utils/audio.ts` entirely — `startAthan()` is a no-op
- Remove commented-out athan watcher in `usePrayerTimes.ts:705-722`
- Remove `isAthanActive`, `startAthan`, `dismissAthan`, `testPlayAthan` from composable return and `index.vue`
- Remove deprecated `getStore` alias in `store.ts`

### 3d. `any` Type Cleanup

- `store.ts`: Typed `TauriWindow` interface instead of `window as any`
- `tray.client.ts`: Cache `platform()` call — currently called 3 times redundantly

### 3e. `shallowRef` Optimization

`timings` ref holds an object replaced wholesale on each fetch — use `shallowRef` to skip deep proxy overhead.

### 3f. Batch Preference Load/Save

Replace 10 sequential `store.get()` / `store.set()` calls with a single `Preferences` object:

```ts
interface Preferences {
  methodId: number
  city: string
  country: string
  extraTimezone: string
  timeFormat: '24h' | '12h'
  showAdditionalTimes: boolean
  locationMode: 'city' | 'gps'
  gpsLat: number | null
  gpsLng: number | null
  gpsCity: string | null
}
```

One round-trip instead of ten.

### 3g. Hardcoded User-Agent

`useGeolocation.ts:83` has `'Meeqat/2.3.5'` — extract to a constant derived from app version.

---

## 4. Performance Optimizations

### 4a. Calendar-Based Prefetch

Covered in Section 2. 30 calls → 1-2 calls.

### 4b. `Intl.DateTimeFormat` Caching

`formatTime()` creates a new `Intl.DateTimeFormat` on every call (runs every second). Cache formatters by options key:

```ts
const formatterCache = new Map<string, Intl.DateTimeFormat>()

function getCachedFormatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options)
  let fmt = formatterCache.get(key)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(undefined, options)
    formatterCache.set(key, fmt)
  }
  return fmt
}
```

### 4c. `timingsList` → `nextPrayerIndex`

Instead of recreating all timing objects every second to update `isPast`/`isNext` flags, expose `nextPrayerIndex` as a computed integer. Components compare their index against it.

### 4d. Tray Update Throttling

Split into two watches:
- Countdown text: throttle 1s
- Full data payload (timingsList, dates): throttle 30s

---

## 5. File Change Summary

### New Files

- `app/composables/prayer/useState.ts`
- `app/composables/prayer/usePrayerFetch.ts`
- `app/composables/prayer/usePrayerCache.ts`
- `app/composables/prayer/usePrayerDisplay.ts`
- `app/utils/schemas.ts`

### Modified Files

- `app/composables/usePrayerTimes.ts` — thin orchestrator
- `app/composables/useNotifications.ts` — deterministic IDs
- `app/composables/useTrayPopover.ts` — grace state consolidation
- `app/composables/useMockTime.ts` — `ref` → `useState`
- `app/composables/useGeolocation.ts` — User-Agent fix
- `app/utils/api.ts` — URL construction, calendar endpoints, mirrors
- `app/utils/store.ts` — typed window, remove deprecated alias
- `app/utils/format.ts` — formatter caching
- `app/utils/types.ts` — remove API response type (replaced by Zod)
- `app/pages/index.vue` — remove athan props, nextPrayerIndex, split tray watches
- `app/plugins/tray.client.ts` — cache platform()
- `package.json` — add `zod`

### Deleted Files

- `app/utils/audio.ts`

### Unchanged

- `app/composables/usePrayerService.ts` — already well-optimized
- `app/constants/` — clean
- `src-tauri/` — Rust side untouched
- All Vue components except `index.vue`

### Dependencies

- Add: `zod`

### Risk Assessment

- **Low risk:** Dead code removal, constant extraction, `any` cleanup, formatter caching, User-Agent fix
- **Medium risk:** Composable split, `useState` migration, notification ID scheme
- **Highest risk:** Calendar API migration (mitigated by Zod), `nextPrayerIndex` refactor
