import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getPlatform } from "@/utils/platform";
import { cue } from "@/utils/sounds";
import type { NativeActiveCall } from "@/utils/togetherNative";
import type { CallsResponse, ParticipantsResponse, RoomsResponse, UsersResponse } from "@/types/together";

/** An active call in one of my subscribed rooms, as the home stage shows it. */
export interface StageCall {
  id: string;
  roomId: string;
  prayer: string;
  place: string;
  status: "open" | "finalized";
  meetAt: string | null;
  organizerName: string;
  going: number;
  joined: boolean;
  /** Initials of up to three people going (the organizer when unknown). */
  initials: string[];
}

type WebCall = CallsResponse<{ room?: RoomsResponse; organizer?: UsersResponse }>;
type WebParticipant = ParticipantsResponse<{ user?: UsersResponse }>;

const initial = (name?: string) => (name?.trim()[0] ?? "?").toUpperCase();

/**
 * Pray Together for the home stage: active calls in my subscribed rooms (newest
 * first) and a room I can start a call in. Opens no connection of its own — the
 * desktop app reads the Rust listener's snapshot (src-tauri/src/together.rs); the web
 * and Android add topics to the page's one PocketBase realtime connection (the one
 * useCallAlerts already holds). Empty while signed out; never prompts sign-in.
 */
export function useActiveCalls() {
  const { pb, status, userId, live } = useTogether();
  const rooms$ = useRooms();
  const toast = useToast();
  const desktop = getPlatform() === "desktop";

  const calls = ref<StageCall[]>([]);
  /** A room where I may start calls (subscribed caller/owner), for the quiet "Start a call" link. */
  const startRoomId = ref<string | null>(null);
  const signedIn = computed(() => status.value === "ready" && Boolean(userId.value));
  const joining = ref<string | null>(null);

  async function loadRooms(): Promise<void> {
    try {
      const mine = await rooms$.fetchMyRooms();
      startRoomId.value = mine.find((m) => m.subscribed && m.role !== "member")?.room ?? null;
    } catch {
      startRoomId.value = null;
    }
  }

  // --- Web / Android: topics on the shared PocketBase realtime connection ---
  let generation = 0;
  async function refreshWeb(): Promise<void> {
    const gen = ++generation;
    try {
      const client = pb();
      const found = await client.collection("calls").getFullList<WebCall>({
        filter: "status = 'open' || status = 'finalized'",
        expand: "room,organizer",
        sort: "-created",
      });
      const people = found.length
        ? await client.collection("participants").getFullList<WebParticipant>({
            filter: found.map((c) => client.filter("call = {:id}", { id: c.id })).join(" || "),
            expand: "user",
            sort: "created",
          })
        : [];
      if (gen !== generation) return;
      calls.value = found.map((c) => {
        const going = people.filter((p) => p.call === c.id);
        const names = going.map((p) => p.expand?.user?.name);
        return {
          id: c.id,
          roomId: c.room,
          prayer: c.prayer,
          place: c.place || c.expand?.room?.default_place || c.expand?.room?.name || "",
          status: c.status as StageCall["status"],
          meetAt: c.meet_at || null,
          organizerName: c.expand?.organizer?.name || "Someone",
          going: going.length,
          joined: going.some((p) => p.user === userId.value),
          initials: (names.length ? names : [c.expand?.organizer?.name]).slice(0, 3).map(initial),
        };
      });
    } catch {
      // keep what we have; the next event or reconnect retries
    }
  }

  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  const refreshSoon = () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => void refreshWeb(), 300);
  };

  let stopLive: (() => void) | null = null;
  let unlistenDesktop: UnlistenFn | null = null;

  function fromNative(list: NativeActiveCall[] | null | undefined): StageCall[] {
    return (list ?? []).map((c) => ({
      id: c.id,
      roomId: c.roomId,
      prayer: c.prayer,
      place: c.place || c.roomName,
      status: c.status,
      meetAt: c.meetAt,
      organizerName: c.organizerName || "Someone",
      going: c.going,
      joined: c.joined,
      initials: [initial(c.organizerName)],
    }));
  }

  watch(
    signedIn,
    async (on) => {
      stopLive?.();
      stopLive = null;
      generation++;
      if (!on) {
        calls.value = [];
        startRoomId.value = null;
        return;
      }
      void loadRooms();
      if (desktop) return; // the Rust listener feeds `calls` (below)
      stopLive = live(
        [
          { collection: "calls", onEvent: refreshSoon },
          { collection: "participants", onEvent: refreshSoon },
        ],
        refreshSoon,
      );
      await refreshWeb();
    },
    { immediate: true },
  );

  onMounted(async () => {
    if (!desktop) return;
    unlistenDesktop = await listen<NativeActiveCall[]>("together:calls", ({ payload }) => {
      calls.value = fromNative(payload);
    });
    try {
      calls.value = fromNative(await invoke<NativeActiveCall[]>("together_get_calls"));
    } catch {
      // listener not running
    }
  });

  onBeforeUnmount(() => {
    stopLive?.();
    unlistenDesktop?.();
    if (refreshTimer) clearTimeout(refreshTimer);
  });

  async function join(call: StageCall): Promise<void> {
    if (joining.value) return;
    joining.value = call.id;
    try {
      if (desktop) await invoke("together_join_call", { callId: call.id });
      else {
        await pb().collection("participants").create({ call: call.id, user: userId.value });
        await refreshWeb();
      }
      cue("callJoined");
    } catch {
      cue("error");
      toast.add({ title: "Couldn't join — retry from the room", color: "error", icon: "i-lucide-triangle-alert" });
    } finally {
      joining.value = null;
    }
  }

  return { calls, signedIn, startRoomId, joining, join };
}
