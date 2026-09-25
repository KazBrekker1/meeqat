import PocketBase, { ClientResponseError, type AuthRecord, type RecordSubscription, type UnsubscribeFunc } from "pocketbase";
import type { TypedPocketBase } from "@/types/together";

export type TogetherStatus = "signed-out" | "connecting" | "ready" | "error";

const UNREACHABLE = "Can't reach your account — try again";

// Module singletons: one PocketBase client (one realtime connection) per page.
let client: TypedPocketBase | null = null;
const status = ref<TogetherStatus>("connecting");
const errorMessage = ref<string | null>(null);
const userId = ref<string | null>(null);
/** The stored session was checked against the server during this page load. */
let verified = false;
let ensuring: Promise<boolean> | null = null;

function pb(): TypedPocketBase {
  if (!client) {
    client = new PocketBase(useRuntimeConfig().public.togetherUrl as string) as TypedPocketBase;
    // Rooms pages fire parallel reads on the same collection; the SDK would
    // otherwise abort all but the last one.
    client.autoCancellation(false);
    client.authStore.onChange(() => {
      userId.value = client?.authStore.record?.id ?? null;
    }, true);
  }
  return client;
}

async function verifyStoredSession(): Promise<boolean> {
  try {
    await pb().collection("users").authRefresh();
    return true;
  } catch (err) {
    if (err instanceof ClientResponseError && err.status === 0) throw err; // offline: not a bad token
    pb().authStore.clear();
    return false;
  }
}

async function establish(): Promise<boolean> {
  const account = useAccount();
  const store = pb().authStore;

  // Signed out of Sanad in this page (e.g. from Settings): drop the session too.
  if (account.status.value === "signed-out" && verified) {
    store.clear();
    verified = false;
  }
  if (verified && store.isValid) return true;

  // Dev only (tree-shaken from production): `?together-token=<pb token>` for the
  // E2E script and manual testing with impersonated users.
  if (import.meta.dev) {
    const devToken = new URLSearchParams(window.location.search).get("together-token");
    if (devToken) {
      store.save(devToken, null);
      return (verified = await verifyStoredSession());
    }
  }

  if (!account.supported) return false;
  if (account.status.value === "unknown") await account.refresh();
  const sanadUser = account.user.value;
  if (account.status.value !== "signed-in" || !sanadUser) {
    store.clear();
    return false;
  }

  // Reuse the stored 7-day session if it belongs to the same Sanad account —
  // exchanges are rate-limited per IP, and a whole office shares one IP.
  if (store.isValid && store.record?.sanad_id === sanadUser.id && (await verifyStoredSession())) {
    return (verified = true);
  }

  const jwt = await account.getToken();
  if (!jwt) throw new Error("no Sanad token");
  const res = await pb().send<{ token: string; record: AuthRecord }>("/api/sanad/exchange", {
    method: "POST",
    body: { token: jwt },
  });
  store.save(res.token, res.record);
  return (verified = true);
}

/** A friendly one-liner for a failed Together request. */
export function describeError(err: unknown, fallback: string): string {
  if (err instanceof ClientResponseError) {
    if (err.status === 0) return "You're offline — check your connection and retry";
    if (err.status === 429) return "Too many attempts — wait a few minutes and retry";
  }
  return fallback;
}

/** HTTP status of a failed Together request (0 = network). */
export function errorStatus(err: unknown): number | null {
  return err instanceof ClientResponseError ? err.status : null;
}

interface LiveTopic {
  collection: string;
  /** Record id, or "*" (default) for every record the rules let us see. */
  topic?: string;
  filter?: string;
  expand?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onEvent: (e: RecordSubscription<any>) => void;
}

/**
 * Shared PocketBase session for Pray Together. `ensureSession()` exchanges the
 * Sanad JWT for a PocketBase session the first time it's needed and reuses a
 * valid one otherwise; every Together request goes through it.
 */
export function useTogether() {
  async function ensureSession(): Promise<boolean> {
    ensuring ??= (async () => {
      if (!(verified && pb().authStore.isValid)) status.value = "connecting";
      errorMessage.value = null;
      try {
        const ok = await establish();
        status.value = ok ? "ready" : "signed-out";
        return ok;
      } catch {
        status.value = "error";
        errorMessage.value = UNREACHABLE;
        return false;
      }
    })().finally(() => {
      ensuring = null;
    });
    return ensuring;
  }

  /**
   * Realtime subscriptions that stay correct across async gaps: the returned
   * stop function (safe to call before the subscriptions resolve) removes all
   * of them. `onReconnect` runs after every (re)connect — callers re-fetch there,
   * since events sent while the connection was down are lost.
   */
  function live(topics: LiveTopic[], onReconnect?: () => void): () => void {
    let stopped = false;
    const unsubs: UnsubscribeFunc[] = [];
    const track = (p: Promise<UnsubscribeFunc>) =>
      p
        .then((unsub) => (stopped ? unsub() : void unsubs.push(unsub)))
        .catch((err) => console.warn("[together] realtime subscribe failed", err));

    for (const t of topics) {
      const { filter, expand } = t;
      track(pb().collection(t.collection).subscribe(t.topic ?? "*", t.onEvent, { filter, expand }));
    }
    if (onReconnect) track(pb().realtime.subscribe("PB_CONNECT", onReconnect));

    return () => {
      stopped = true;
      for (const unsub of unsubs.splice(0)) void unsub().catch(() => {});
    };
  }

  return {
    pb,
    status: readonly(status),
    error: readonly(errorMessage),
    /** Reactive id of the signed-in Together user. */
    userId: readonly(userId),
    ensureSession,
    live,
  };
}

/**
 * Runs a Together action from a button: tracks which one is busy (by key) and
 * turns a failure into an error toast. Resolves to whether it succeeded.
 */
export function useTogetherAction() {
  const toast = useToast();
  const busy = ref<string | null>(null);

  async function run(key: string, failTitle: string, fn: () => Promise<unknown>): Promise<boolean> {
    busy.value = key;
    try {
      await fn();
      return true;
    } catch (err) {
      toast.add({
        title: failTitle,
        description: describeError(err, "") || undefined,
        color: "error",
        icon: "i-lucide-triangle-alert",
      });
      return false;
    } finally {
      if (busy.value === key) busy.value = null;
    }
  }

  return { busy: readonly(busy), run };
}
