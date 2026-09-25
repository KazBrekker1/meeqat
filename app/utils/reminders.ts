/** A time-of-day / calendar reminder for the home stage, most time-sensitive first. */
export interface StageReminder {
  kind: "fast" | "kahf" | "morning" | "evening";
  icon: string;
  /** Icon tile background + foreground. */
  tint: { bg: string; fg: string };
  title: string;
  arabic: string;
  detail: string;
  cta?: { label: string; href: string };
}

const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
};

/**
 * Which reminders apply right now, in priority order: White-days fast (Hijri 13–15,
 * before Dhuhr) → Friday Surat al-Kahf (until Maghrib) → morning adhkar (Fajr → Dhuhr) /
 * evening adhkar (ʿAṣr → Maghrib). Prayer minutes are minutes since local midnight;
 * a missing one switches its reminders off.
 */
export function stageReminders(input: {
  nowMin: number;
  weekday: number;
  hijriDay: number | null;
  hijriMonth: string | null;
  minutes: { fajr?: number; dhuhr?: number; asr?: number; maghrib?: number };
  maghribLabel?: string;
}): StageReminder[] {
  const { nowMin, weekday, hijriDay, hijriMonth, minutes: m } = input;
  const out: StageReminder[] = [];
  const before = (t?: number) => t != null && nowMin < t;
  const between = (a?: number, b?: number) => a != null && b != null && nowMin >= a && nowMin < b;

  if (hijriDay != null && hijriDay >= 13 && hijriDay <= 15 && before(m.dhuhr)) {
    out.push({
      kind: "fast",
      icon: "lucide:moon",
      tint: { bg: "rgba(252,211,77,.12)", fg: "#fcd34d" },
      title: "White days",
      arabic: "الأيام البيض",
      detail: `${hijriMonth ? `13–15 ${hijriMonth}` : "13–15"} · today is the ${ordinal(hijriDay)}`,
    });
  }
  if (weekday === 5 && before(m.maghrib)) {
    out.push({
      kind: "kahf",
      icon: "lucide:book-open",
      tint: { bg: "rgba(52,211,153,.12)", fg: "#6ee7b7" },
      title: "Friday · Surat al-Kahf",
      arabic: "سورة الكهف",
      detail: input.maghribLabel ? `Before Maghrib · ${input.maghribLabel}` : "Before Maghrib",
      cta: { label: "Read", href: "https://quran.com/18" },
    });
  }
  if (between(m.fajr, m.dhuhr)) {
    out.push({
      kind: "morning",
      icon: "lucide:sun",
      tint: { bg: "rgba(253,186,116,.12)", fg: "#fdba74" },
      title: "Morning adhkar",
      arabic: "أذكار الصباح",
      detail: "After Fajr, until the sun is high",
    });
  } else if (between(m.asr, m.maghrib)) {
    out.push({
      kind: "evening",
      icon: "lucide:sunset",
      tint: { bg: "rgba(196,181,253,.12)", fg: "#c4b5fd" },
      title: "Evening adhkar",
      arabic: "أذكار المساء",
      detail: "From ʿAṣr until Maghrib",
    });
  }
  return out;
}
