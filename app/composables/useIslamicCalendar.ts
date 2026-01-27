import {
  toCalendar,
  CalendarDate,
  IslamicUmalquraCalendar,
} from "@internationalized/date";
import type { PrayerTimingItem } from "@/utils/types";
import { getStore } from "@/utils/store";
import { ISLAMIC_MONTHS } from "@/constants/prayers";

// Ramadan is month 9 in the Islamic calendar
function isRamadan(month: number): boolean {
  return month === 9;
}

function getDaysUntilRamadan(currentMonth: number, currentDay: number): number | null {
  if (currentMonth === 9) return 0; // Already in Ramadan
  if (currentMonth > 9) {
    // Next Ramadan is next year
    return (12 - currentMonth) * 30 + (9 - 1) * 30 + (1 - currentDay);
  }
  // Ramadan is this year
  return (9 - currentMonth - 1) * 30 + (30 - currentDay) + 1;
}

export interface RamadanInfo {
  isActive: boolean;
  dayNumber: number | null;
  daysRemaining: number | null;
  daysUntilRamadan: number | null;
}

export interface SuhoorIftarTimes {
  suhoorEnd: string | null;      // Same as Fajr
  iftarTime: string | null;      // Same as Maghrib
  suhoorCountdown: string | null;
  iftarCountdown: string | null;
  isFasting: boolean;            // Between Fajr and Maghrib
}

export interface IslamicCalendarState {
  currentIslamicDate: {
    day: number;
    month: number;
    year: number;
    monthName: string;
  } | null;
  ramadanInfo: RamadanInfo;
  ramadanModeEnabled: boolean;
}

export function useIslamicCalendar(timingsList?: Ref<PrayerTimingItem[]>) {
  const now = ref(new Date());
  const ramadanModeEnabled = ref(true); // Auto-enable during Ramadan

  // Update time every second
  let intervalId: ReturnType<typeof setInterval> | null = null;
  onMounted(() => {
    intervalId = setInterval(() => {
      now.value = new Date();
    }, 1000);
    void loadSettings();
  });
  onBeforeUnmount(() => {
    if (intervalId) clearInterval(intervalId);
  });

  // Load/save Ramadan mode setting
  async function loadSettings(): Promise<void> {
    try {
      const store = await getStore();
      const saved = await store.get<boolean>("ramadanModeEnabled");
      if (typeof saved === "boolean") {
        ramadanModeEnabled.value = saved;
      }
    } catch (e) {
      console.warn("[useIslamicCalendar] Failed to load settings:", e);
    }
  }

  async function setRamadanModeEnabled(enabled: boolean): Promise<void> {
    ramadanModeEnabled.value = enabled;
    try {
      const store = await getStore();
      await store.set("ramadanModeEnabled", enabled);
      if (store.save) await store.save();
    } catch (e) {
      console.warn("[useIslamicCalendar] Failed to save settings:", e);
    }
  }

  // Current Islamic date
  const currentIslamicDate = computed(() => {
    try {
      const d = now.value;
      const gregorianDate = new CalendarDate(
        d.getFullYear(),
        d.getMonth() + 1,
        d.getDate()
      );
      const islamicDate = toCalendar(gregorianDate, new IslamicUmalquraCalendar());
      return {
        day: islamicDate.day,
        month: islamicDate.month,
        year: islamicDate.year,
        monthName: ISLAMIC_MONTHS[islamicDate.month - 1] || `Month ${islamicDate.month}`,
      };
    } catch {
      return null;
    }
  });

  // Ramadan info
  const ramadanInfo = computed<RamadanInfo>(() => {
    const islamic = currentIslamicDate.value;
    if (!islamic) {
      return {
        isActive: false,
        dayNumber: null,
        daysRemaining: null,
        daysUntilRamadan: null,
      };
    }

    const isActive = isRamadan(islamic.month);

    if (isActive) {
      // We're in Ramadan
      const daysInRamadan = 30; // Approximate
      return {
        isActive: true,
        dayNumber: islamic.day,
        daysRemaining: daysInRamadan - islamic.day,
        daysUntilRamadan: 0,
      };
    } else {
      // Calculate days until Ramadan
      const daysUntil = getDaysUntilRamadan(islamic.month, islamic.day);
      return {
        isActive: false,
        dayNumber: null,
        daysRemaining: null,
        daysUntilRamadan: daysUntil,
      };
    }
  });

  // Suhoor/Iftar times (requires prayer times)
  const suhoorIftarTimes = computed<SuhoorIftarTimes>(() => {
    const list = timingsList?.value || [];
    const fajr = list.find(t => t.key === "Fajr");
    const maghrib = list.find(t => t.key === "Maghrib");

    if (!fajr || !maghrib) {
      return {
        suhoorEnd: null,
        iftarTime: null,
        suhoorCountdown: null,
        iftarCountdown: null,
        isFasting: false,
      };
    }

    const fajrMinutes = fajr.minutes;
    const maghribMinutes = maghrib.minutes;
    const nowMinutes = now.value.getHours() * 60 + now.value.getMinutes();

    // Determine if currently fasting (between Fajr and Maghrib)
    const isFasting = typeof fajrMinutes === "number" &&
                      typeof maghribMinutes === "number" &&
                      nowMinutes >= fajrMinutes &&
                      nowMinutes < maghribMinutes;

    // Calculate countdowns
    let suhoorCountdown: string | null = null;
    let iftarCountdown: string | null = null;

    if (typeof fajrMinutes === "number" && typeof maghribMinutes === "number") {
      const nowSeconds = now.value.getHours() * 3600 + now.value.getMinutes() * 60 + now.value.getSeconds();

      if (nowMinutes < fajrMinutes) {
        // Before Fajr - countdown to suhoor end
        const diffSeconds = fajrMinutes * 60 - nowSeconds;
        suhoorCountdown = formatCountdown(diffSeconds);
      }

      if (nowMinutes < maghribMinutes) {
        // Before Maghrib - countdown to iftar
        const diffSeconds = maghribMinutes * 60 - nowSeconds;
        iftarCountdown = formatCountdown(diffSeconds);
      }
    }

    return {
      suhoorEnd: fajr.time,
      iftarTime: maghrib.time,
      suhoorCountdown,
      iftarCountdown,
      isFasting,
    };
  });

  // Should show Ramadan mode UI
  const showRamadanMode = computed(() => {
    return ramadanModeEnabled.value && ramadanInfo.value.isActive;
  });

  return {
    currentIslamicDate,
    ramadanInfo,
    suhoorIftarTimes,
    showRamadanMode,
    ramadanModeEnabled,
    setRamadanModeEnabled,
  };
}

// Helper to format countdown
function formatCountdown(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, "0");

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}
