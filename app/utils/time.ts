export function getDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDdMmYyyy(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}-${mm}-${yyyy}`;
}

export function parseYyyyMmDd(
  yyyyMmDd: string
): { year: number; month: number; day: number } | null {
  const m = yyyyMmDd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return null;
  }
  return { year, month, day };
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function buildCurrentTimeRefs(now: Ref<Date>) {
  const nowMinutes = computed(
    () => now.value.getHours() * 60 + now.value.getMinutes()
  );
  const nowSecondsOfDay = computed(
    () =>
      now.value.getHours() * 3600 +
      now.value.getMinutes() * 60 +
      now.value.getSeconds()
  );
  return { nowMinutes, nowSecondsOfDay };
}
