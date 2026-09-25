import PocketBase, { ClientResponseError, type AuthRecord, type RecordSubscription, type UnsubscribeFunc } from "pocketbase";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { TypedPocketBase, UsersRecord } from "@/types/together";
import { isNative } from "@/utils/platform";
import { createChallenge, createState, createVerifier } from "@/utils/pkce";
import { getSettingsStore } from "@/utils/store";
import { cue } from "@/utils/sounds";

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

// --- Native apps (desktop/Android): the PocketBase session comes from a PKCE
// hand-off through the browser (/native-login) and lives in the settings store.
const SESSION_KEY = "together.session";
const PENDING_KEY = "together.pendingSignIn";
/** Long enough to sign in to Google in the browser; the code itself lives 3 minutes. */
const PENDING_TTL_MS = 30 * 60 * 1000;

interface SavedSession {
  token: string;
  record: AuthRecord;
}
interface PendingSignIn {
  verifier: string;
  state: string;
  at: number;
}
export interface TogetherSession {
  url: string;
  token: string;
}
type SessionListener = (session: TogetherSession | null) => void;

const account = shallowRef<UsersRecord | null>(null);
/** A browser sign-in was started and hasn't been redeemed or cancelled. */
const awaitingBrowser = ref(false);
const signInError = ref<string | null>(null);
let pending: PendingSignIn | null = null;
/** The saved session was read back into the auth store (from then on, changes are saved). */
let restored = false;
const sessionListeners = new Set<SessionListener>();
let lastNotifiedToken: string | null = null;

function pb(): TypedPocketBase {
  if (!client) {
    client = new PocketBase(useRuntimeConfig().public.togetherUrl as string) as TypedPocketBase;
    // Rooms pages fire parallel reads on the same collection; the SDK would
    // otherwise abort all but the last one.
    client.autoCancellation(false);
    client.authStore.onChange(() => {
      userId.value = client?.authStore.record?.id ?? null;
      account.value = (client?.authStore.record as UsersRecord | null) ?? null;
      if (isNative() && restored) void persistSession();
      notifySessionListeners();
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
    // Native sessions cost a browser round trip to replace: keep them through server hiccups.
    if (isNative() && err instanceof ClientResponseError && ![401, 403, 404].includes(err.status)) throw err;
    pb().authStore.clear();
    return false;
  }
}

function notifySessionListeners(): void {
  const store = client?.authStore;
  const token = store?.isValid ? store.token : "";
  if (token === lastNotifiedToken) return;
  lastNotifiedToken = token;
  const session = token ? { url: pb().baseURL, token } : null;
  for (const cb of sessionListeners) {
    try {
      cb(session);
    } catch (err) {
      console.warn("[together] session listener failed", err);
    }
  }
}

async function persistSession(): Promise<void> {
  const store = pb().authStore;
  const saved: SavedSession | null = store.token && store.record ? { token: store.token, record: store.record } : null;
  try {
    const settings = await getSettingsStore();
    await settings.set(SESSION_KEY, saved);
    await settings.save?.();
  } catch (err) {
    console.warn("[together] couldn't save the session", err);
  }
}

async function setPending(next: PendingSignIn | null): Promise<void> {
  pending = next;
  awaitingBrowser.value = Boolean(next);
  const settings = await getSettingsStore();
  await settings.set(PENDING_KEY, next);
  await settings.save?.();
}

/** The browser sign-in in progress, from memory or (after a relaunch) the store. */
async function loadPending(): Promise<PendingSignIn | null> {
  pending ??= (await (await getSettingsStore()).get<PendingSignIn>(PENDING_KEY)) ?? null;
  if (pending && Date.now() - pending.at > PENDING_TTL_MS) await setPending(null);
  return pending;
}

/** Native: restore the saved session once, then check it with the server. */
async function establishNative(): Promise<boolean> {
  const store = pb().authStore;
  if (verified && store.isValid) return true;
  if (!restored) {
    const saved = await (await getSettingsStore()).get<SavedSession>(SESSION_KEY);
    restored = true;
    if (saved?.token) store.save(saved.token, saved.record ?? null);
    // A sign-in started before a relaunch can still finish (the deep link may start the app).
    awaitingBrowser.value = Boolean(await loadPending());
  }
  if (!store.token) return false;
  if (!store.isValid) {
    store.clear(); // expired: not opened within the token's 30 days
    return false;
  }
  return (verified = await verifyStoredSession());
}

async function establish(): Promise<boolean> {
  if (isNative()) return establishNative();
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

  // A different (or no) account before: this exchange is a real sign-in, not a 7-day renewal.
  const newAccount = store.record?.sanad_id !== sanadUser.id;
  const jwt = await account.getToken();
  if (!jwt) throw new Error("no Sanad token");
  const res = await pb().send<{ token: string; record: AuthRecord }>("/api/sanad/exchange", {
    method: "POST",
    body: { token: jwt },
  });
  store.save(res.token, res.record);
  if (newAccount) cue("signedIn");
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
 * valid one otherwise; every Together request goes through it. The native apps
 * have no Sanad cookie: their session comes from `signInWithBrowser()` →
 * `redeem()` and is kept in the settings store.
 */
export function useTogether() {
  const webUrl = useRuntimeConfig().public.webUrl as string;

  /** Runs `fn` after any in-flight session work; later callers of ensureSession wait for it. */
  function exclusive(fn: () => Promise<boolean>): Promise<boolean> {
    const prev = ensuring;
    const run: Promise<boolean> = (async () => {
      await prev?.catch(() => false);
      return fn();
    })().finally(() => {
      if (ensuring === run) ensuring = null;
    });
    ensuring = run;
    return run;
  }

  async function ensureSession(): Promise<boolean> {
    if (ensuring) return ensuring;
    return exclusive(async () => {
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
    });
  }

  /**
   * Native: start a PKCE sign-in in the system browser. The browser comes back
   * with `meeqat://auth?code&state` (plugins/deepLinks.client.ts) or the user
   * pastes the code; both end in `redeem()`.
   */
  async function signInWithBrowser(): Promise<void> {
    signInError.value = null;
    const verifier = createVerifier();
    const state = createState();
    const challenge = await createChallenge(verifier);
    await setPending({ verifier, state, at: Date.now() });
    try {
      await openUrl(`${webUrl}/native-login?${new URLSearchParams({ challenge, state })}`);
    } catch (err) {
      console.warn("[together] couldn't open the browser", err);
      signInError.value = "Couldn't open your browser — try again";
      await setPending(null);
    }
  }

  /** Native: forget a sign-in started in the browser. */
  async function cancelSignIn(): Promise<void> {
    signInError.value = null;
    await setPending(null);
  }

  /**
   * Native: trade the hand-off code for a PocketBase session. `state` comes with
   * the deep link; a pasted code has none and uses the pending attempt's.
   */
  function redeem(code: string, state?: string): Promise<boolean> {
    return exclusive(async () => {
      signInError.value = null;
      const attempt = await loadPending();
      if (!attempt) {
        signInError.value = "This sign-in has expired — start again";
        return false;
      }
      if (state !== undefined && state !== attempt.state) {
        signInError.value = "This sign-in link is from an older attempt — start again";
        return false;
      }
      try {
        const res = await pb().send<{ token: string; record: AuthRecord }>("/api/sanad/redeem", {
          method: "POST",
          body: { code: code.trim(), verifier: attempt.verifier },
        });
        restored = true; // a later restore must not overwrite the new session
        pb().authStore.save(res.token, res.record);
        verified = true;
        status.value = "ready";
        errorMessage.value = null;
        await setPending(null);
        cue("signedIn");
        return true;
      } catch (err) {
        const s = errorStatus(err);
        signInError.value =
          s === 400 || s === 401
            ? "That code didn't work — it may have expired or been used. Sign in again."
            : describeError(err, UNREACHABLE);
        return false;
      }
    });
  }

  /** Native: drop the Together session on this device. */
  async function signOut(): Promise<void> {
    await exclusive(async () => {
      await pb().realtime.unsubscribe().catch(() => {});
      pb().authStore.clear();
      verified = false;
      status.value = "signed-out";
      errorMessage.value = null;
      return false;
    });
  }

  /**
   * Hook for handing the session to native code (Unit C: the desktop listener).
   * `cb` gets `{url, token}` on sign-in and every refresh, `null` on sign-out,
   * and is called right away if a session is already loaded. Returns an unsubscribe.
   */
  function onSessionChange(cb: SessionListener): () => void {
    sessionListeners.add(cb);
    const store = pb().authStore;
    if (store.isValid) cb({ url: pb().baseURL, token: store.token });
    return () => void sessionListeners.delete(cb);
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
    /** The signed-in Together user record (name, avatar). */
    account: readonly(account),
    ensureSession,
    live,
    // Native sign-in (desktop/Android)
    awaitingBrowser: readonly(awaitingBrowser),
    signInError: readonly(signInError),
    signInWithBrowser,
    cancelSignIn,
    redeem,
    signOut,
    onSessionChange,
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
      cue("error");
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
