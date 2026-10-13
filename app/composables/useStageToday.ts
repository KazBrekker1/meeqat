import { ISLAMIC_MONTHS, MAIN_PRAYER_KEYS_SET } from "@/constants/prayers";
import { toHijri } from "@/utils/hijri";
import { moonView } from "@/utils/moon/sphere";
import { prayerClock } from "@/utils/prayerClock";
import { qiblaBearing } from "@/utils/qibla";
import { pad2, getSecondsOfDay, parseTimeToMinutes } from "@/utils/time";

/**
 * What the home stage shows about today besides the schedule: the Moon and sun
 * chips, the Qibla bearing, the reminder cards and the next of the five prayers.
 * All derived from usePrayerRuntime().
 */
export function useStageToday() {
  const { timingsList, countdownToNext, activeCoords, locationDisplayName, nowHHMM } = usePrayerRuntime();
  const { getNow } = useMockTime();

  // Sub-minute now for the orbit comet, so it advances smoothly each tick in sync
  // with the countdown instead of stepping once a minute. (countdownToNext ticks 1s.)
  const nowSecondsLive = computed(() => {
    void countdownToNext.value;
    return getSecondsOfDay(getNow());
  });

  // --- Today strip ---
  // The real Moon for the chips (phase name, % lit), once a minute.
  const stageMoon = computed(() => {
    void nowHHMM.value;
    const c = activeCoords.value;
    const v = moonView(getNow(), c?.lat ?? 0, c?.lng ?? 0);
    return { phase: v.phase, fraction: v.fraction };
  });
  const timingByKey = (key: string) => timingsList.value.find((t) => t.key === key);
  const sunTimes = computed(() => {
    const rise = timingByKey("Sunrise"), set = timingByKey("Maghrib");
    let dayLength: string | undefined;
    if (typeof rise?.minutes === "number" && typeof set?.minutes === "number" && set.minutes > rise.minutes) {
      const d = set.minutes - rise.minutes;
      dayLength = `${Math.floor(d / 60)}h ${pad2(d % 60)}m`;
    }
    return { sunrise: rise?.time, sunset: set?.time, dayLength };
  });
  const qibla = computed(() => (activeCoords.value ? qiblaBearing(activeCoords.value.lat, activeCoords.value.lng) : null));
  const shortPlace = computed(() => locationDisplayName.value?.split(",")[0]?.trim() || null);

  // --- Reminders (White days → Friday al-Kahf → adhkar) ---
  const hijriToday = computed(() => {
    void nowHHMM.value;
    const d = getNow();
    try {
      const h = toHijri(d);
      return { day: h.day, month: ISLAMIC_MONTHS[h.month - 1] ?? null };
    } catch {
      return null;
    }
  });
  const reminders = computed(() => {
    if (!timingsList.value.length) return [];
    const mins = (k: string) => timingByKey(k)?.minutes;
    return stageReminders({
      nowMin: parseTimeToMinutes(nowHHMM.value) ?? 0,
      weekday: getNow().getDay(),
      hijriDay: hijriToday.value?.day ?? null,
      hijriMonth: hijriToday.value?.month ?? null,
      minutes: { fajr: mins("Fajr"), dhuhr: mins("Dhuhr"), asr: mins("Asr"), maghrib: mins("Maghrib") },
      maghribLabel: timingByKey("Maghrib")?.time,
    });
  });

  // The next of the five prayers (tomorrow's Fajr after ʿIshāʾ), for "Start a call for …".
  const nextMainPrayer = computed(() => {
    const main = timingsList.value.filter((t) => MAIN_PRAYER_KEYS_SET.has(t.key) && typeof t.minutes === "number");
    return prayerClock(main, nowSecondsLive.value).next?.label ?? null;
  });

  return { nowSecondsLive, stageMoon, sunTimes, qibla, shortPlace, reminders, nextMainPrayer };
}
