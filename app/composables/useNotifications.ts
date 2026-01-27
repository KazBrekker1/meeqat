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
  createChannel,
  Importance,
  Visibility,
} from "@tauri-apps/plugin-notification";

const PRAYER_CHANNEL_ID = "prayer-notifications";

// Notification timing options (in minutes)
export const NOTIFICATION_TIMING_OPTIONS = [0, 5, 10, 15, 20, 30] as const;
export type NotificationTiming = (typeof NOTIFICATION_TIMING_OPTIONS)[number];

export interface NotificationSettings {
  enabled: boolean;
  minutesBefore: NotificationTiming;
  minutesAfter: NotificationTiming;
  atPrayerTime: boolean;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  minutesBefore: 5,
  minutesAfter: 5,
  atPrayerTime: true,
};

/**
 * Ensures the notification channel exists for Android 8.0+.
 * Must be called before scheduling notifications.
 */
async function ensureNotificationChannel(): Promise<void> {
  try {
    await createChannel({
      id: PRAYER_CHANNEL_ID,
      name: "Prayer Notifications",
      description: "Notifications for prayer times and reminders",
      importance: Importance.High,
      visibility: Visibility.Public,
      vibration: true,
      sound: "default",
    });
  } catch {
    // Channel might already exist or platform doesn't support it (iOS, desktop)
  }
}

type UseNotificationsOptions = {
  timingsList?: Ref<PrayerTimingItem[]>;
  settings?: Ref<NotificationSettings>;
};

export function useNotifications(options?: UseNotificationsOptions) {
  const toast = useToast();
  const permissionGranted = ref(false);
  const isRunning = ref(false);
  let lastScheduledDateKey = "";

  const timingsList = options?.timingsList ?? usePrayerTimes().timingsList;

  // Use provided settings or create local reactive settings
  const settings = options?.settings ?? ref<NotificationSettings>({ ...DEFAULT_NOTIFICATION_SETTINGS });

  // Load/save settings from store
  async function loadNotificationSettings(): Promise<void> {
    try {
      const store = await getStore();
      const saved = await store.get<NotificationSettings>("notificationSettings");
      if (saved) {
        settings.value = { ...DEFAULT_NOTIFICATION_SETTINGS, ...saved };
      }
    } catch (e) {
      console.warn("[useNotifications] Failed to load settings:", e);
    }
  }

  async function saveNotificationSettings(): Promise<void> {
    try {
      const store = await getStore();
      await store.set("notificationSettings", settings.value);
      if (store.save) await store.save();
    } catch (e) {
      console.warn("[useNotifications] Failed to save settings:", e);
    }
  }

  // Watch settings changes and reschedule
  watch(settings, () => {
    void saveNotificationSettings();
    if (isRunning.value) {
      lastScheduledDateKey = ""; // Force reschedule
      void schedulePrayerNotifications();
    }
  }, { deep: true });

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
      await ensureNotificationChannel();
      sendNotification({ title, body, channelId: PRAYER_CHANNEL_ID });
    } catch {
      // ignore in non-tauri/web
    }
  }

  /**
   * Schedule notifications for all prayer times for today.
   * Uses the native Schedule API so notifications work even when app is backgrounded.
   */
  async function schedulePrayerNotifications(): Promise<void> {
    if (!settings.value.enabled) {
      isRunning.value = false;
      return;
    }

    const ok = await ensurePermission();
    if (!ok) return;

    // Ensure notification channel exists (required for Android 8.0+)
    await ensureNotificationChannel();

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
    const { minutesBefore, minutesAfter, atPrayerTime } = settings.value;

    for (const prayer of list) {
      const prayerMinutes = prayer.minutes as number;

      // Create date objects for notification times
      const todayBase = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // Schedule "before" notification
      if (minutesBefore > 0) {
        const beforeTime = new Date(todayBase.getTime() + (prayerMinutes - minutesBefore) * 60 * 1000);
        if (beforeTime > now) {
          try {
            sendNotification({
              id: notificationId++,
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
        const atTime = new Date(todayBase.getTime() + prayerMinutes * 60 * 1000);
        if (atTime > now) {
          try {
            sendNotification({
              id: notificationId++,
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
        const afterTime = new Date(todayBase.getTime() + (prayerMinutes + minutesAfter) * 60 * 1000);
        if (afterTime > now) {
          try {
            sendNotification({
              id: notificationId++,
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

  // Load settings on init
  void loadNotificationSettings();

  return {
    permissionGranted,
    ensurePermission,
    send,
    startPrayerNotifications,
    stopPrayerNotifications,
    schedulePrayerNotifications,
    isRunning,
    // Notification settings
    settings,
    loadNotificationSettings,
    saveNotificationSettings,
  };
}
