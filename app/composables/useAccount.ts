import { createAuthClient } from "better-auth/client";
import { passkeyClient } from "@better-auth/passkey/client";
import { getPlatform } from "@/utils/platform";
import { createTokenCache } from "@/utils/sanadToken";

export interface AccountUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

function makeClient(baseURL: string) {
  // meeqat.sanad.ink → auth.sanad.ink is cross-origin but same-site: the shared
  // `.sanad.ink` session cookie only travels on credentialed requests.
  return createAuthClient({ baseURL, fetchOptions: { credentials: "include" }, plugins: [passkeyClient()] });
}
type AuthClient = ReturnType<typeof makeClient>;

// Module-level singletons: one client, one session state, one token cache per page.
let client: AuthClient | null = null;
let tokens: ReturnType<typeof createTokenCache> | null = null;
const user = ref<AccountUser | null>(null);
const status = ref<"unknown" | "signed-out" | "signed-in">("unknown");

function authClient(baseURL: string): AuthClient {
  client ??= makeClient(baseURL);
  return client;
}

/**
 * Optional Sanad account. Phase 1 supports the web build only (it shares the
 * `.sanad.ink` cookie); desktop/Android sign-in arrives with Pray Together.
 */
export function useAccount() {
  const authUrl = useRuntimeConfig().public.authUrl as string;
  const supported = getPlatform() === "web";

  async function refresh(): Promise<void> {
    if (!supported) {
      status.value = "signed-out";
      return;
    }
    try {
      const { data } = await authClient(authUrl).getSession();
      user.value = (data?.user as AccountUser | undefined) ?? null;
    } catch {
      user.value = null;
    }
    status.value = user.value ? "signed-in" : "signed-out";
    if (!user.value) tokens?.clear();
  }

  async function signInWithGoogle(): Promise<void> {
    // Absolute URL: a relative callbackURL would resolve against auth.sanad.ink.
    // Keeps the query (e.g. /native-login's challenge and state).
    await authClient(authUrl).signIn.social({
      provider: "google",
      callbackURL: window.location.origin + window.location.pathname + window.location.search,
    });
  }

  /** Passkeys are registered for rpID `sanad.ink`, so they work on any Sanad subdomain. */
  async function signInWithPasskey(): Promise<boolean> {
    const res = await authClient(authUrl).signIn.passkey();
    if (res?.error) return false;
    await refresh();
    return status.value === "signed-in";
  }

  async function signOut(): Promise<void> {
    await authClient(authUrl).signOut();
    tokens?.clear();
    user.value = null;
    status.value = "signed-out";
  }

  /** Short-lived Sanad JWT (RS256) for Meeqat's own backends (Together, phase 2+). */
  async function getToken(): Promise<string | null> {
    if (!supported) return null;
    tokens ??= createTokenCache(async () => {
      const res = await fetch(`${authUrl}/api/auth/token`, { credentials: "include" });
      if (!res.ok) return null;
      const body = (await res.json()) as { token?: string };
      return body.token ?? null;
    });
    return tokens.get();
  }

  return {
    user: readonly(user),
    status: readonly(status),
    supported,
    refresh,
    signInWithGoogle,
    signInWithPasskey,
    signOut,
    getToken,
  };
}
