import type { RecordSubscription } from "pocketbase";
import type {
  CallsResponse,
  MessagesResponse,
  ParticipantsResponse,
  PollOptionsResponse,
  PollVotesResponse,
  UsersResponse,
} from "@/types/together";
import { cue } from "@/utils/sounds";

export type Prayer = CallsResponse["prayer"];
export type OptionKind = NonNullable<PollOptionsResponse["kind"]>;
export type Call = CallsResponse<{ organizer?: UsersResponse }>;
export type Participant = ParticipantsResponse<{ user?: UsersResponse }>;
export type Message = MessagesResponse<{ user?: UsersResponse }>;
export type PollOption = PollOptionsResponse;
export type PollVote = PollVotesResponse;

/** A poll option as the organizer types it; `value` is what finalizing applies. */
export interface OptionInput {
  kind: OptionKind;
  label: string;
  /** place: the place; time: an ISO datetime; other: unused. */
  value?: string;
}

export interface CallDetail {
  call: Call;
  participants: Participant[];
  options: PollOption[];
  votes: PollVote[];
  messages: Message[];
}

type Row = { id: string };

const isActive = (c: Pick<CallsResponse, "status">) => c.status === "open" || c.status === "finalized";
const byCreated = (a: { created: string }, b: { created: string }) => a.created.localeCompare(b.created);

function upsert<T extends Row>(list: Ref<T[]>, record: T): void {
  const i = list.value.findIndex((r) => r.id === record.id);
  if (i === -1) list.value.push(record);
  else list.value.splice(i, 1, record);
}

function applyEvent<T extends Row>(list: Ref<T[]>, e: RecordSubscription<T>): void {
  if (e.action === "delete") list.value = list.value.filter((r) => r.id !== e.record.id);
  else upsert(list, e.record);
}

/**
 * Today's active calls (open/finalized) in one room — with participants, poll
 * and chat — kept live through PocketBase realtime while `enabled` is true
 * (the rules only show calls to subscribed members). Events are merged into
 * flat lists; a (re)connect re-fetches everything, since events sent while the
 * connection was down are lost.
 */
export function useRoomCalls(roomId: string, enabled: Ref<boolean>) {
  const { pb, ensureSession, live, userId } = useTogether();

  const calls = ref<Call[]>([]);
  const participants = ref<Participant[]>([]);
  const options = ref<PollOption[]>([]);
  const votes = ref<PollVote[]>([]);
  const messages = ref<Message[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  function clear(): void {
    calls.value = [];
    participants.value = [];
    options.value = [];
    votes.value = [];
    messages.value = [];
  }

  // Ignore responses from a fetch that a newer one has superseded, and replay
  // events that arrived while a fetch was in flight (its snapshot may predate them).
  let generation = 0;
  const replay: Array<() => void> = [];
  function onEvent<T extends Row>(list: Ref<T[]>) {
    return (e: RecordSubscription<T>) => {
      const apply = () => applyEvent(list, e);
      apply();
      if (loading.value) replay.push(apply);
    };
  }

  async function refresh(): Promise<void> {
    const gen = ++generation;
    loading.value = true;
    error.value = null;
    try {
      if (!(await ensureSession())) return;
      const client = pb();
      const ofActiveCalls = client.filter(
        "call.room = {:roomId} && (call.status = 'open' || call.status = 'finalized')",
        { roomId },
      );
      const [c, p, o, v, m] = await Promise.all([
        client.collection("calls").getFullList<Call>({
          filter: client.filter("room = {:roomId} && (status = 'open' || status = 'finalized')", { roomId }),
          expand: "organizer",
        }),
        client.collection("participants").getFullList<Participant>({ filter: ofActiveCalls, expand: "user" }),
        client.collection("poll_options").getFullList<PollOption>({ filter: ofActiveCalls }),
        client.collection("poll_votes").getFullList<PollVote>({ filter: ofActiveCalls }),
        client.collection("messages").getFullList<Message>({ filter: ofActiveCalls, expand: "user", sort: "created" }),
      ]);
      if (gen !== generation) return;
      calls.value = c;
      participants.value = p;
      options.value = o;
      votes.value = v;
      messages.value = m;
      for (const apply of replay.splice(0)) apply();
    } catch (err) {
      if (gen === generation) error.value = describeError(err, "Couldn't load calls — retry");
    } finally {
      if (gen === generation) {
        loading.value = false;
        replay.length = 0;
      }
    }
  }

  /** A call turning finalized is news once, whichever lands first: the live event or my own update. */
  function cueIfFinalized(next: Call): void {
    const prev = calls.value.find((c) => c.id === next.id);
    if (prev && prev.status !== "finalized" && next.status === "finalized") cue("callFinalized");
  }

  const applyCall = onEvent(calls);
  const applyMessage = onEvent(messages);

  let stopLive: (() => void) | null = null;
  function stop(): void {
    stopLive?.();
    stopLive = null;
    generation++; // drop any in-flight fetch
    loading.value = false;
    replay.length = 0;
  }

  function start(): void {
    stop();
    const ofRoom = pb().filter("call.room = {:roomId}", { roomId });
    stopLive = live(
      [
        {
          collection: "calls",
          filter: pb().filter("room = {:roomId}", { roomId }),
          expand: "organizer",
          onEvent: (e: RecordSubscription<Call>) => {
            if (e.action === "update") cueIfFinalized(e.record);
            applyCall(e);
          },
        },
        { collection: "participants", filter: ofRoom, expand: "user", onEvent: onEvent(participants) },
        { collection: "poll_options", filter: ofRoom, onEvent: onEvent(options) },
        { collection: "poll_votes", filter: ofRoom, onEvent: onEvent(votes) },
        {
          collection: "messages",
          filter: ofRoom,
          expand: "user",
          onEvent: (e: RecordSubscription<Message>) => {
            const news = e.action === "create" && e.record.user !== userId.value && !messages.value.some((m) => m.id === e.record.id);
            if (news) cue("messageIn");
            applyMessage(e);
          },
        },
      ],
      () => void refresh(),
    );
    void refresh();
  }

  watch(
    enabled,
    (on) => {
      if (on) start();
      else {
        stop();
        clear();
      }
    },
    { immediate: true },
  );
  onScopeDispose(stop);

  /** Newest first; only calls that are still active. */
  const details = computed<CallDetail[]>(() =>
    calls.value
      .filter(isActive)
      .sort((a, b) => byCreated(b, a))
      .map((call) => ({
        call,
        participants: participants.value.filter((p) => p.call === call.id).sort(byCreated),
        options: options.value.filter((o) => o.call === call.id).sort(byCreated),
        votes: votes.value.filter((v) => v.call === call.id),
        messages: messages.value.filter((m) => m.call === call.id).sort(byCreated),
      })),
  );

  async function session() {
    if (!(await ensureSession()) || !userId.value) throw new SignedOutError();
    return { client: pb(), uid: userId.value };
  }

  /**
   * Starts a call, then adds its poll options. If this prayer already has an
   * active call today the server answers 409 with its id: that call is the
   * result (`existing: true`) and nothing is created.
   */
  async function startCall(input: {
    prayer: Prayer;
    place: string;
    options: OptionInput[];
  }): Promise<{ id: string; existing: boolean; optionsFailed: number }> {
    const { client } = await session();
    let call: Call;
    try {
      call = await client
        .collection("calls")
        .create<Call>({ room: roomId, prayer: input.prayer, place: input.place }, { expand: "organizer" });
    } catch (err) {
      const existing = (err as { response?: { data?: { existing?: string } } }).response?.data?.existing;
      if (errorStatus(err) !== 409 || !existing) throw err;
      if (!calls.value.some((c) => c.id === existing)) await refresh();
      return { id: existing, existing: true, optionsFailed: 0 };
    }
    upsert(calls, call);
    const results = await Promise.allSettled(input.options.map((o) => addOption(call.id, o)));
    return { id: call.id, existing: false, optionsFailed: results.filter((r) => r.status === "rejected").length };
  }

  async function join(callId: string): Promise<void> {
    const { client, uid } = await session();
    upsert(participants, await client.collection("participants").create<Participant>({ call: callId, user: uid }, { expand: "user" }));
    cue("callJoined");
  }

  async function leave(callId: string): Promise<void> {
    const { client, uid } = await session();
    const mine = participants.value.find((p) => p.call === callId && p.user === uid);
    if (!mine) return;
    await client.collection("participants").delete(mine.id);
    participants.value = participants.value.filter((p) => p.id !== mine.id);
    cue("callLeft");
  }

  async function updateCall(callId: string, body: Record<string, string>): Promise<void> {
    const { client } = await session();
    const call = await client.collection("calls").update<Call>(callId, body, { expand: "organizer" });
    cueIfFinalized(call);
    upsert(calls, call);
  }

  const editPlace = (callId: string, place: string) => updateCall(callId, { place });
  const finalize = (callId: string, optionId: string) => updateCall(callId, { finalize_option: optionId });
  const cancel = (callId: string) => updateCall(callId, { status: "cancelled" });

  async function addOption(callId: string, o: OptionInput): Promise<void> {
    const { client } = await session();
    upsert(options, await client.collection("poll_options").create<PollOption>({ call: callId, ...o }));
  }

  async function removeOption(optionId: string): Promise<void> {
    const { client } = await session();
    await client.collection("poll_options").delete(optionId);
    options.value = options.value.filter((o) => o.id !== optionId);
    votes.value = votes.value.filter((v) => v.option !== optionId);
  }

  /** One vote per member per call: the first creates it, later ones move it. */
  async function vote(callId: string, optionId: string): Promise<void> {
    const { client, uid } = await session();
    const mine = votes.value.find((v) => v.call === callId && v.user === uid);
    if (mine?.option === optionId) return;
    const saved = mine
      ? await client.collection("poll_votes").update<PollVote>(mine.id, { option: optionId })
      : await client.collection("poll_votes").create<PollVote>({ call: callId, option: optionId, user: uid });
    upsert(votes, saved);
    cue("voted");
  }

  async function sendMessage(callId: string, body: string): Promise<void> {
    const { client, uid } = await session();
    const message = await client
      .collection("messages")
      .create<Message>({ call: callId, user: uid, body: body.trim().slice(0, 280) }, { expand: "user" });
    upsert(messages, message);
    cue("messageSent");
  }

  return {
    details,
    loading,
    error,
    refresh,
    startCall,
    join,
    leave,
    editPlace,
    finalize,
    cancel,
    addOption,
    removeOption,
    vote,
    sendMessage,
  };
}
