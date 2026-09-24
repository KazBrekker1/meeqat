/** Expiry of a JWT in epoch milliseconds, or 0 if it can't be read. */
export function jwtExpiry(token: string): number {
  const payload = token.split(".")[1];
  if (!payload) return 0;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.exp === "number" ? json.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

const REFRESH_MARGIN_MS = 60_000;

/**
 * Sanad JWTs live 15 minutes. Keep one until a minute before it expires, and let
 * concurrent callers share a single request.
 */
export function createTokenCache(
  fetchToken: () => Promise<string | null>,
  now: () => number = Date.now
) {
  let token: string | null = null;
  let expiresAt = 0;
  let inflight: Promise<string | null> | null = null;

  return {
    async get(): Promise<string | null> {
      if (token && now() < expiresAt - REFRESH_MARGIN_MS) return token;
      inflight ??= fetchToken()
        .then((t) => {
          token = t;
          expiresAt = t ? jwtExpiry(t) : 0;
          return t;
        })
        .finally(() => {
          inflight = null;
        });
      return inflight;
    },
    clear(): void {
      token = null;
      expiresAt = 0;
    },
  };
}
