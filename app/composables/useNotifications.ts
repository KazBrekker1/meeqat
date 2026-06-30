import type { Ref } from "vue";
import type { PrayerTimingItem } from "@/utils/types";
import type { UpcomingDay } from "@/composables/prayer/usePrayerFetch";
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

// Audible channel (sound + vibration + heads-up) and a parallel silent channel
// for discreet mode. Android bakes sound/importance into the channel at creation
// and they're immutable afterwards, so a discreet mode needs its own channel.
const PRAYER_CHANNEL_ID = "prayer-notifications";
const PRAYER_CHANNEL_SILENT_ID = "prayer-notifications-silent";

// How many days ahead to schedule. The OS keeps these pending while the app is
// killed/backgrounded, so a rolling window means alerts keep firing even if the
// app is never reopened — the single-day window was the main "athan stopped"
// reliability bug. Each launch/resume refills the window.
const MAX_HORIZON_DAYS = 7;
// iOS silently drops scheduled notifications past 64 pending. Cap below that and
// keep the SOONEST ones, so the most imminent alerts are never the ones dropped.
const MAX_PENDING = 60;

// Notification timing options (in minutes)
export const NOTIFICATION_TIMING_OPTIONS = [0, 5, 10, 15, 20, 30] as const;
export type NotificationTiming = (typeof NOTIFICATION_TIMING_OPTIONS)[number];

export interface NotificationSettings {
  enabled: boolean;
  minutesBefore: NotificationTiming;
  minutesAfter: NotificationTiming;
  atPrayerTime: boolean;
  /** Discreet mode: deliver silently (no sound/vibration, no heads-up banner). */
  silent: boolean;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  minutesBefore: 5,
  minutesAfter: 5,
  atPrayerTime: true,
  silent: false,
};

/**
 * Ensures both notification channels exist for Android 8.0+: an audible channel
 * and a discreet/silent one. Creating an existing channel is a no-op, and the
 * call is harmless on platforms without channels (iOS, desktop).
 * Must be called before scheduling notifications.
 */
async function ensureNotificationChannels(): Promise<void> {
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
  try {
    await createChannel({
      id: PRAYER_CHANNEL_SILENT_ID,
      name: "Prayer Notifications (Silent)",
      description: "Discreet prayer reminders — no sound or vibration",
      importance: Importance.Low,
      visibility: Visibility.Public,
      vibration: false,
    });
  } catch {
    // ignore
  }
}

type UseNotificationsOptions = {
  timingsList?: Ref<PrayerTimingItem[]>;
  settings?: Ref<NotificationSettings>;
  /**
   * Resolves the next N days of main prayers from cache (real per-day times).
   * When provided, scheduling uses a rolling multi-day window; without it, it
   * falls back to scheduling today only from `timingsList`.
   */
  getUpcomingDays?: (days: number) => Promise<UpcomingDay[]>;
};

export function useNotifications(options?: UseNotificationsOptions) {
  const toast = useToast();
  const permissionGranted = ref(false);
  const isRunning = ref(false);
  let lastScheduledDateKey = "";
  let lastTimingsHash = ""; // Track timings to detect actual changes
  let isInitialLoad = true; // Track if we're in initial load phase
  let isScheduling = false; // Prevent concurrent scheduling

  if (!options?.timingsList) {
    throw new Error('[useNotifications] timingsList option is required');
  }
  const timingsList = options.timingsList;

  // Use provided settings or create local reactive settings
  const settings = options?.settings ?? ref<NotificationSettings>({ ...DEFAULT_NOTIFICATION_SETTINGS });

  // Load/save settings from store
  async function loadNotificationSettings(): Promise<void> {
    try {
      const store = await getSettingsStore();
      const saved = await store.get<NotificationSettings>("notificationSettings");
      if (saved) {
        // Use Object.assign to avoid triggering the watcher during initial load
        Object.assign(settings.value, { ...DEFAULT_NOTIFICATION_SETTINGS, ...saved });
      }
    } catch (e) {
      console.warn("[useNotifications] Failed to load settings:", e);
    } finally {
      isInitialLoad = false;
    }
  }

  async function saveNotificationSettings(): Promise<void> {
    try {
      const store = await getSettingsStore();
      await store.set("notificationSettings", settings.value);
      if (store.save) await store.save();
    } catch (e) {
      console.warn("[useNotifications] Failed to save settings:", e);
    }
  }

  // Watch settings changes and reschedule (skip during initial load)
  watch(settings, () => {
    if (isInitialLoad) return; // Don't reschedule during initial settings load
    void saveNotificationSettings();
    if (isRunning.value) {
      void schedulePrayerNotifications(true); // settings changed → relay window
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

  // Discreet mode routing. Android honors the channel (sound/importance baked in
  // at creation); iOS/desktop honor the per-notification `sound`. We set both so
  // every platform is covered.
  function deliveryChannel(): string {
    return settings.value.silent ? PRAYER_CHANNEL_SILENT_ID : PRAYER_CHANNEL_ID;
  }
  function deliverySound(): string | undefined {
    return settings.value.silent ? undefined : "default";
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
      await ensureNotificationChannels();
      sendNotification({
        title,
        body,
        channelId: deliveryChannel(),
        sound: deliverySound(),
      });
    } catch {
      // ignore in non-tauri/web
    }
  }

  type ScheduledNotification = { time: Date; title: string; body: string };

  /**
   * Build the full set of candidate notifications across the rolling window from
   * real per-day prayer times, drop past ones, and return them soonest-first,
   * capped at MAX_PENDING. Falls back to today-only from `timingsList` when
   * `getUpcomingDays` isn't wired or the cache has no upcoming days yet.
   */
  async function buildScheduledNotifications(
    now: Date,
  ): Promise<ScheduledNotification[]> {
    let days: UpcomingDay[] = [];
    if (options?.getUpcomingDays) {
      try {
        days = await options.getUpcomingDays(MAX_HORIZON_DAYS);
      } catch {
        days = [];
      }
    }

    if (!days.length) {
      const today = (timingsList.value ?? [])
        .filter(
          (t) =>
            typeof t.minutes === "number" && MAIN_PRAYER_KEYS_SET.has(t.key),
        )
        .map((t) => ({ key: t.key, label: t.label, minutes: t.minutes! }));
      if (today.length) {
        const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        days = [{ dateKey: getDateKey(base), date: base, prayers: today }];
      }
    }

    const { minutesBefore, minutesAfter, atPrayerTime } = settings.value;
    const out: ScheduledNotification[] = [];

    for (const day of days) {
      for (const prayer of day.prayers) {
        // Local wall-clock time for this prayer; setMinutes keeps it DST-correct.
        const at = new Date(day.date);
        at.setHours(0, 0, 0, 0);
        at.setMinutes(prayer.minutes);

        if (minutesBefore > 0) {
          const t = new Date(at.getTime() - minutesBefore * 60_000);
          if (t > now)
            out.push({
              time: t,
              title: "Meeqat - Prayer Reminder",
              body: `Athan for ${prayer.label} in ${minutesBefore} minutes`,
            });
        }
        if (atPrayerTime && at > now) {
          out.push({
            time: at,
            title: "Meeqat - Prayer Time",
            body: `It's time for ${prayer.label}`,
          });
        }
        if (minutesAfter > 0) {
          const t = new Date(at.getTime() + minutesAfter * 60_000);
          if (t > now)
            out.push({
              time: t,
              title: "Meeqat - Iqama Reminder",
              body: `Get ready for Iqama for ${prayer.label}`,
            });
        }
      }
    }

    out.sort((a, b) => a.time.getTime() - b.time.getTime());
    return out.slice(0, MAX_PENDING);
  }

  /**
   * Schedule a rolling multi-day window of prayer notifications via the native
   * Schedule API, so they fire even when the app is backgrounded or killed.
   * Pass `force` to refill the window regardless of the same-day guard (used on
   * resume and when timings/settings change).
   */
  async function schedulePrayerNotifications(force = false): Promise<void> {
    if (isScheduling) {
      console.log("[useNotifications] Scheduling already in progress, skipping");
      return;
    }

    if (!settings.value.enabled) {
      isRunning.value = false;
      return;
    }

    const ok = await ensurePermission();
    if (!ok) return;

    const now = new Date();
    const dateKey = getDateKey(now);

    if (!force && dateKey === lastScheduledDateKey) {
      console.log("[useNotifications] Already scheduled for today, skipping");
      return;
    }

    isScheduling = true;
    try {
      await ensureNotificationChannels();

      // Clear the existing window before re-laying it.
      try {
        const pendingNotifications = await pending();
        if (pendingNotifications.length > 0) {
          await cancel(pendingNotifications.map((n) => n.id));
        }
      } catch {
        // ignore on platforms without pending()
      }

      const scheduled = await buildScheduledNotifications(now);
      if (!scheduled.length) {
        // Nothing to schedule yet (e.g. cache not populated). Leave the guard
        // unset so the next change/resume retries.
        isRunning.value = true;
        return;
      }

      const channelId = deliveryChannel();
      const sound = deliverySound();

      scheduled.forEach((n, i) => {
        try {
          sendNotification({
            id: i + 1, // unique within this batch (all prior pending cleared)
            channelId,
            sound,
            title: n.title,
            body: n.body,
            schedule: Schedule.at(n.time),
          });
        } catch {
          // ignore scheduling errors
        }
      });

      console.log(
        `[useNotifications] Scheduled ${scheduled.length} notifications across up to ${MAX_HORIZON_DAYS} days`,
      );
      lastScheduledDateKey = dateKey;
      lastTimingsHash = (timingsList.value ?? [])
        .filter((t) => MAIN_PRAYER_KEYS_SET.has(t.key))
        .map((t) => `${t.key}:${t.minutes}`)
        .join("|");
      isRunning.value = true;
    } finally {
      isScheduling = false;
    }
  }

  async function startPrayerNotifications(): Promise<void> {
    // First, cancel any stale notifications from previous sessions
    try {
      const pendingNotifications = await pending();
      if (pendingNotifications.length > 0) {
        console.log(`[useNotifications] Clearing ${pendingNotifications.length} stale notifications on startup`);
        await cancel(pendingNotifications.map((n) => n.id));
      }
    } catch {
      // ignore errors on platforms that don't support pending()
    }
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

  // Re-schedule when timings actually change (not just reactive updates)
  watch(
    timingsList,
    (newTimings) => {
      if (!isRunning.value || isInitialLoad) return;

      // Create a simple hash of the timings to detect actual changes
      const hash = newTimings
        ?.filter((t) => MAIN_PRAYER_KEYS_SET.has(t.key))
        .map((t) => `${t.key}:${t.minutes}`)
        .join("|") ?? "";

      if (hash && hash !== lastTimingsHash) {
        console.log("[useNotifications] Timings changed, rescheduling");
        lastTimingsHash = hash;
        void schedulePrayerNotifications(true);
      }
    },
    { deep: true }
  );

  // Refill the rolling window when the app returns to the foreground. The OS may
  // have killed the app, and days that have since rolled into the window won't be
  // scheduled yet. Cancel + reschedule is idempotent and cheap.
  const documentVisibility = useDocumentVisibility();
  watch(documentVisibility, (v) => {
    if (v === "visible" && settings.value.enabled && !isInitialLoad) {
      void schedulePrayerNotifications(true);
    }
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
