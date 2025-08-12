import type { Ref } from "vue";
import type { PrayerTimingItem } from "@/utils/types";
import { Visibility } from "@tauri-apps/plugin-notification";

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

  // Prefer provided timingsList; fallback to local usePrayerTimes instance
  const timingsList = options?.timingsList ?? usePrayerTimes().timingsList;

  async function ensurePermission(): Promise<boolean> {
    try {
      permissionGranted.value = await useTauriNotificationIsPermissionGranted();
      if (!permissionGranted.value) {
        const permission = await useTauriNotificationRequestPermission();
        permissionGranted.value = permission === "granted";
      }
      return permissionGranted.value;
    } catch (error) {
      // Web/non-tauri or unexpected error
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
    // Reset per-day flags when date changes
    const now = new Date();
    const dateKey = getDateKey(now);
    if (dateKey !== lastDateKey) {
      firedBeforeForDate.clear();
      firedAfterForDate.clear();
      lastDateKey = dateKey;
    }

    if (!timingsList.value || timingsList.value.length === 0) return;

    // Only evaluate once per minute
    if (now.getSeconds() !== 0) return;

    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const allowedPrayerKeys = new Set([
      "Fajr",
      "Dhuhr",
      "Asr",
      "Maghrib",
      "Isha",
    ]);
    const list = timingsList.value
      .filter(
        (t) => typeof t.minutes === "number" && allowedPrayerKeys.has(t.key)
      )
      .sort((a, b) => a.minutes! - b.minutes!);
    if (!list.length) return;

    // Find the next prayer strictly after now; if none, wrap to the first (tomorrow)
    let nextIndex = list.findIndex(
      (t) => (t.minutes as number) > currentMinutes
    );
    if (nextIndex === -1) nextIndex = 0;
    const next = list[nextIndex]!;
    const last = list[(nextIndex - 1 + list.length) % list.length]!;

    const nextMins = (next.minutes as number) ?? null;
    const lastMins = (last.minutes as number) ?? null;

    // 5 minutes before next Athan
    if (nextMins != null && currentMinutes === nextMins - 5) {
      const key = `${dateKey}|before|${next.key}`;
      if (!firedBeforeForDate.has(key)) {
        firedBeforeForDate.add(key);
        void send("Meeqat", `Athan for ${next.label} in 5 minutes`);
      }
    }

    // 5 minutes after last Athan
    if (lastMins != null && currentMinutes === lastMins + 5) {
      const key = `${dateKey}|after|${last.key}`;
      if (!firedAfterForDate.has(key)) {
        firedAfterForDate.add(key);
        void send("Meeqat", `Get ready for Iqama for ${last.label}`);
      }
    }
  }

  function startPrayerNotifications(): void {
    if (isRunning.value) return;
    isRunning.value = true;
    // Prime permission check but don't block start
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
