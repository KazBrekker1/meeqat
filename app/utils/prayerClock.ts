// The one answer to "which time is next, which was last" for a day's list of
// times. The schedule, the orbit, the tray popover and Pray Together all derive
// from it, so they cannot disagree at a boundary.
//
// Entries are in ascending order of `minutes` (minutes after local midnight); an
// entry without a time is never next-today and never past. A time has passed
// from its own first second (`minutes * 60 <= nowSeconds`).

export interface ClockEntry {
  minutes?: number;
}

/** Index of the first time still ahead today, or -1 once the last one has passed. */
export function indexOfNextToday(
  entries: readonly ClockEntry[],
  nowSeconds: number,
): number {
  return entries.findIndex(
    (t) => typeof t.minutes === "number" && t.minutes * 60 > nowSeconds,
  );
}

export interface PrayerClock<T> {
  /** All of today's times have passed: `next` is tomorrow's first. */
  allPassed: boolean;
  /** Before today's first time: `previous` is yesterday's last. */
  beforeFirst: boolean;
  /** -1 only for an empty list. */
  nextIndex: number;
  previousIndex: number;
  next: T | null;
  previous: T | null;
}

/**
 * Next and previous entry around `nowSeconds` (seconds after local midnight),
 * going round the day. Which keys take part (the five prayers, sunrise, the
 * additional times) is the caller's choice: pass the list already filtered.
 */
export function prayerClock<T extends ClockEntry>(
  entries: readonly T[],
  nowSeconds: number,
): PrayerClock<T> {
  const today = indexOfNextToday(entries, nowSeconds);
  const allPassed = today === -1;
  const nextIndex = entries.length ? (allPassed ? 0 : today) : -1;
  const previousIndex = entries.length
    ? (nextIndex - 1 + entries.length) % entries.length
    : -1;
  return {
    allPassed,
    beforeFirst: today === 0,
    nextIndex,
    previousIndex,
    next: entries[nextIndex] ?? null,
    previous: entries[previousIndex] ?? null,
  };
}

/**
 * The list with `isNext`/`isPast` set from `indexToday` (see indexOfNextToday).
 * Takes the index rather than the time so a reactive caller only rebuilds the
 * list when a time is crossed, not every second.
 */
export function flagPrayers<T extends ClockEntry>(
  entries: readonly T[],
  indexToday: number,
): (T & { isNext: boolean; isPast: boolean })[] {
  // All of today's times have passed: the next one is tomorrow's first.
  const allPassed = indexToday === -1;
  const nextIndex = allPassed ? 0 : indexToday;
  return entries.map((t, idx) => ({
    ...t,
    isPast:
      typeof t.minutes === "number"
        ? idx !== nextIndex && (allPassed || idx < nextIndex)
        : false,
    isNext: idx === nextIndex,
  }));
}
