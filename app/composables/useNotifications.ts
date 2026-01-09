import type { Ref } from "vue";
import type { PrayerTimingItem } from "@/utils/types";
import { computePreviousPrayerInfo, getDateKey, getMinutesOfDay } from "@/utils/time";
import { MAIN_PRAYER_KEYS_SET } from "@/constants/prayers";
import { Visibility } from "@tauri-apps/plugin-notification";

const NOTIFICATION_MINUTES_BEFORE = 5;
const NOTIFICATION_MINUTES_AFTER = 5;

type UseNotificationsOptions = {
  timingsList?: Ref<PrayerTimingItem[]>;
};

export function useNotifications(options?: UseNotificationsOptions) {
  const toast = useToast();
  const permissionGranted = ref(false);
  const isRunning = ref(false);
  let intervalId: ReturnType<typeof setInterval> | null = null;
  const firedBeforeForDate = new Set<string>();
  const firedAfterForDate = new Set<string>();
  let lastDateKey = "";

  const timingsList = options?.timingsList ?? usePrayerTimes().timingsList;

  async function ensurePermission(): Promise<boolean> {
    try {
      permissionGranted.value = await useTauriNotificationIsPermissionGranted();
      if (!permissionGranted.value) {
        const permission = await useTauriNotificationRequestPermission();
        permissionGranted.value = permission === "granted";
      }
      return permissionGranted.value;
    } catch {
      return false;
    }
  }

  async function send(title: string, body: string): Promise<void> {
    const ok = await ensurePermission();
    if (!ok) {
      toast.add({
        title: "Notifications disabled",
        description: "Missing notifications permission",
        color: "error",
      });
      return;
    }
    try {
      useTauriNotificationSendNotification({
        title,
        body,
        visibility: Visibility.Public,
      });
    } catch {
      // ignore in non-tauri/web
    }
  }

  function tick() {
    const now = new Date();
    const dateKey = getDateKey(now);
    if (dateKey !== lastDateKey) {
      firedBeforeForDate.clear();
      firedAfterForDate.clear();
      lastDateKey = dateKey;
    }

    if (!timingsList.value || timingsList.value.length === 0) return;
    if (now.getSeconds() !== 0) return;

    const currentMinutes = getMinutesOfDay(now);

    const list = timingsList.value
      .filter((t) => typeof t.minutes === "number" && MAIN_PRAYER_KEYS_SET.has(t.key))
      .sort((a, b) => a.minutes! - b.minutes!);
    if (!list.length) return;

    let nextIndex = list.findIndex((t) => (t.minutes as number) > currentMinutes);
    if (nextIndex === -1) nextIndex = 0;
    const next = list[nextIndex]!;
    const lastInfo = computePreviousPrayerInfo(timingsList.value, now);

    const nextMins = next.minutes ?? null;
    const lastMins = lastInfo
      ? list.find((t) => t.label === lastInfo.label)?.minutes ?? null
      : null;

    // Notify before next Athan
    if (nextMins != null && currentMinutes === nextMins - NOTIFICATION_MINUTES_BEFORE) {
      const key = `${dateKey}|before|${next.key}`;
      if (!firedBeforeForDate.has(key)) {
        firedBeforeForDate.add(key);
        void send("Meeqat", `Athan for ${next.label} in ${NOTIFICATION_MINUTES_BEFORE} minutes`);
      }
    }

    // Notify after last Athan
    if (lastMins != null && lastInfo && currentMinutes === lastMins + NOTIFICATION_MINUTES_AFTER) {
      const lastKey = list.find((t) => t.label === lastInfo.label)?.key;
      if (lastKey) {
        const key = `${dateKey}|after|${lastKey}`;
        if (!firedAfterForDate.has(key)) {
          firedAfterForDate.add(key);
          void send("Meeqat", `Get ready for Iqama for ${lastInfo.label}`);
        }
      }
    }
  }

  function startPrayerNotifications(): void {
    if (isRunning.value) return;
    isRunning.value = true;
    void ensurePermission();
    intervalId = setInterval(tick, 1000);
  }

  function stopPrayerNotifications(): void {
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
    isRunning.value = false;
  }

  onBeforeUnmount(() => {
    stopPrayerNotifications();
  });

  return {
    permissionGranted,
    ensurePermission,
    send,
    startPrayerNotifications,
    stopPrayerNotifications,
    isRunning,
  };
}
