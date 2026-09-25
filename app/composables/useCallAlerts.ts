import type { RecordSubscription } from "pocketbase";
import { prayerName } from "@/utils/together";
import type { CallsResponse, ParticipantsResponse, RoomsResponse, UsersResponse } from "@/types/together";

type AlertCall = CallsResponse<{ room?: RoomsResponse; organizer?: UsersResponse }>;
type MyParticipation = ParticipantsResponse<{ call?: AlertCall }>;

const REMIND_BEFORE_MS = 5 * 60 * 1000;

// Module-level: one set of subscriptions and timers per page, however many
// components ask for alerts.
let starting: Promise<void> | null = null;
const reminders = new Map<string, { at: string; timer: ReturnType<typeof setTimeout> }>();

/**
 * Web call alerts while a Meeqat tab is open (spec §2 "Reaching people"):
 * a toast (+ browser notification when the tab is in the background) for a new
 * call in a subscribed room, and a reminder 5 minutes before the meeting time
 * of every finalized call I've joined.
 */
export function useCallAlerts() {
  const toast = useToast();
  const route = useRoute();
  const { pb, ensureSession, live, userId } = useTogether();

  function notify(title: string, body: string): void {
    if (typeof Notification === "undefined" || Notification.permission !== "granted" || !document.hidden) return;
    try {
      new Notification(title, { body, icon: "/favicon-32.png" });
    } catch {
      // Some mobile browsers only allow notifications from a service worker; the toast still shows.
    }
  }

  function describe(call: AlertCall): string {
    return [call.expand?.room?.name, call.place].filter(Boolean).join(" · ");
  }

  function onCall(e: RecordSubscription<AlertCall>): void {
    const call = e.record;
    if (e.action === "create" && call.organizer !== userId.value) {
      const title = `${call.expand?.organizer?.name || "Someone"} started ${prayerName(call.prayer)}`;
      notify(title, `${describe(call)} — Join or ignore`);
      // Already looking at that room: the call appears there anyway.
      if (route.path !== `/rooms/${call.room}`) {
        toast.add({
          title,
          description: describe(call),
          icon: "i-lucide-users",
          duration: 30_000,
          actions: [
            { label: "Join", color: "primary", onClick: () => void joinFromAlert(call) },
            { label: "Ignore", color: "neutral", variant: "ghost" },
          ],
        });
      }
    }
    if (e.action !== "create") void syncReminders();
  }

  async function joinFromAlert(call: AlertCall): Promise<void> {
    try {
      await pb().collection("participants").create({ call: call.id, user: userId.value });
    } catch {
      toast.add({ title: "Couldn't join — retry from the room", color: "error", icon: "i-lucide-triangle-alert" });
    }
    await navigateTo(`/rooms/${call.room}`);
  }

  /** Re-arm reminders from the server's truth: finalized calls I joined that meet later. */
  async function syncReminders(): Promise<void> {
    const uid = userId.value;
    if (!uid) return;
    let mine: MyParticipation[];
    try {
      mine = await pb().collection("participants").getFullList<MyParticipation>({
        filter: pb().filter("user = {:uid} && call.status = 'finalized' && call.meet_at > @now", { uid }),
        expand: "call.room",
      });
    } catch {
      return; // keep the current timers; the next event or reconnect retries
    }
    const keep = new Set<string>();
    for (const p of mine) {
      const call = p.expand?.call;
      if (!call?.meet_at) continue;
      keep.add(call.id);
      const existing = reminders.get(call.id);
      if (existing?.at === call.meet_at) continue;
      if (existing) clearTimeout(existing.timer);
      const delay = new Date(call.meet_at).getTime() - REMIND_BEFORE_MS - Date.now();
      if (delay <= 0) continue;
      const timer = setTimeout(() => {
        reminders.delete(call.id);
        const title = `${prayerName(call.prayer)} in 5 minutes`;
        toast.add({ title, description: describe(call), icon: "i-lucide-bell-ring", duration: 60_000 });
        notify(title, describe(call));
      }, delay);
      reminders.set(call.id, { at: call.meet_at, timer });
    }
    for (const [id, r] of reminders) {
      if (!keep.has(id)) {
        clearTimeout(r.timer);
        reminders.delete(id);
      }
    }
  }

  /** Idempotent; does nothing while signed out (never prompts sign-in). */
  function start(): Promise<void> {
    starting ??= (async () => {
      if (!(await ensureSession()) || !userId.value) {
        starting = null; // try again once signed in
        return;
      }
      live(
        [
          { collection: "calls", expand: "room,organizer", onEvent: onCall },
          {
            collection: "participants",
            filter: pb().filter("user = {:uid}", { uid: userId.value }),
            onEvent: () => void syncReminders(),
          },
        ],
        () => void syncReminders(),
      );
      await syncReminders();
    })();
    return starting;
  }

  /** Ask once, from a user action (joining or subscribing), never on page load. */
  function requestNotificationPermission(): void {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission().catch(() => {});
    }
  }

  return { start, requestNotificationPermission };
}
