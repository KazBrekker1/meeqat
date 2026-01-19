import type { Ref } from "vue";
import type { PrayerTimingItem } from "@/utils/types";
import { getDateKey } from "@/utils/time";
import { MAIN_PRAYER_KEYS_SET } from "@/constants/prayers";
import {
  sendNotification,
  isPermissionGranted,
  requestPermission,
  Schedule,
  pending,
  cancel,
} from "@tauri-apps/plugin-notification";

const NOTIFICATION_MINUTES_BEFORE = 5;
const NOTIFICATION_MINUTES_AFTER = 5;

type UseNotificationsOptions = {
  timingsList?: Ref<PrayerTimingItem[]>;
};

export function useNotifications(options?: UseNotificationsOptions) {
  const toast = useToast();
  const permissionGranted = ref(false);
  const isRunning = ref(false);
  let lastScheduledDateKey = "";

  const timingsList = options?.timingsList ?? usePrayerTimes().timingsList;

  async function ensurePermission(): Promise<boolean> {
    try {
      permissionGranted.value = await isPermissionGranted();
      if (!permissionGranted.value) {
        const permission = await requestPermission();
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
      sendNotification({ title, body });
    } catch {
      // ignore in non-tauri/web
    }
  }

  /**
   * Schedule notifications for all prayer times for today.
   * Uses the native Schedule API so notifications work even when app is backgrounded.
   */
  async function schedulePrayerNotifications(): Promise<void> {
    const ok = await ensurePermission();
    if (!ok) return;

    const now = new Date();
    const dateKey = getDateKey(now);

    // Don't reschedule if we already scheduled for today
    if (dateKey === lastScheduledDateKey) return;

    // Cancel any previously scheduled notifications
    try {
      const pendingNotifications = await pending();
      if (pendingNotifications.length > 0) {
        await cancel(pendingNotifications.map((n) => n.id));
      }
    } catch {
      // ignore errors on platforms that don't support pending()
    }

    if (!timingsList.value || timingsList.value.length === 0) return;

    const list = timingsList.value
      .filter((t) => typeof t.minutes === "number" && MAIN_PRAYER_KEYS_SET.has(t.key))
      .sort((a, b) => a.minutes! - b.minutes!);

    if (!list.length) return;

    let notificationId = 1;

    for (const prayer of list) {
      const prayerMinutes = prayer.minutes as number;

      // Create date objects for notification times
      const todayBase = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // Schedule "before" notification (5 minutes before prayer)
      const beforeTime = new Date(todayBase.getTime() + (prayerMinutes - NOTIFICATION_MINUTES_BEFORE) * 60 * 1000);
      if (beforeTime > now) {
        try {
          sendNotification({
            id: notificationId++,
            title: "Meeqat",
            body: `Athan for ${prayer.label} in ${NOTIFICATION_MINUTES_BEFORE} minutes`,
            schedule: Schedule.at(beforeTime),
          });
        } catch {
          // ignore scheduling errors
        }
      }

      // Schedule "after" notification (5 minutes after prayer - iqama reminder)
      const afterTime = new Date(todayBase.getTime() + (prayerMinutes + NOTIFICATION_MINUTES_AFTER) * 60 * 1000);
      if (afterTime > now) {
        try {
          sendNotification({
            id: notificationId++,
            title: "Meeqat",
            body: `Get ready for Iqama for ${prayer.label}`,
            schedule: Schedule.at(afterTime),
          });
        } catch {
          // ignore scheduling errors
        }
      }
    }

    lastScheduledDateKey = dateKey;
    isRunning.value = true;
  }

  function startPrayerNotifications(): void {
    void schedulePrayerNotifications();
  }

  async function stopPrayerNotifications(): Promise<void> {
    try {
      const pendingNotifications = await pending();
      if (pendingNotifications.length > 0) {
        await cancel(pendingNotifications.map((n) => n.id));
      }
    } catch {
      // ignore errors
    }
    lastScheduledDateKey = "";
    isRunning.value = false;
  }

  // Re-schedule when timings change
  watch(
    timingsList,
    () => {
      if (isRunning.value) {
        lastScheduledDateKey = ""; // Force reschedule
        void schedulePrayerNotifications();
      }
    },
    { deep: true }
  );

  onBeforeUnmount(() => {
    // Don't cancel notifications on unmount - let them fire even if app is closed
  });

  return {
    permissionGranted,
    ensurePermission,
    send,
    startPrayerNotifications,
    stopPrayerNotifications,
    schedulePrayerNotifications,
    isRunning,
  };
}
