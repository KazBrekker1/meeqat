# Phase 4 — Pray Together in the desktop and Android apps

> Spec: `docs/superpowers/specs/2026-09-24-pray-together-design.md` §2, §3.2, §3.4 — with the
> deviations below. Testing policy (owner): typecheck, `cargo check`/`clippy`, Go tests for the new
> endpoints, and manual verification on a built macOS app + the Android emulator. No other tests.

## Deviations from the spec (decided 2026-09-25)

1. **No sanad-auth changes.** Instead of better-auth `bearer` + `oneTimeToken` plugins, the Together
   service does the hand-off with PKCE (below). The native app only ever holds a PocketBase session.
2. **Session in the app's store** (`tauri-plugin-store`), not the OS keychain — it only grants Together
   access (rooms/chat); revisit if it ever guards more.
3. **Desktop listener is always connected while signed in** (not only in prayer windows): one idle
   SSE connection per desktop is cheap, and it can't miss a call started early.
4. Users' PocketBase token duration 7 → 30 days (renewed by `authRefresh` on every app start).

## Native sign-in hand-off (PKCE)

```
app: verifier = 32 random bytes (b64url); challenge = b64url(sha256(verifier)); state = 16 random bytes
app → system browser: https://meeqat.sanad.ink/native-login?challenge=<c>&state=<s>
page: signed in to Sanad (cookie, or Google/passkey there) → jwt = GET auth.sanad.ink/api/auth/token
page → POST together/api/sanad/handoff {token: jwt, challenge} → {code}   (code: 32 random bytes, 3 min, single use)
page → location = meeqat://auth?code=<code>&state=<s>   (+ "Open Meeqat" button, + "copy code" fallback)
app (deep link): check state → POST together/api/sanad/redeem {code, verifier} → {token, record}
```
Server keeps codes in memory (lost on restart = user retries). Both endpoints rate-limited per IP.
`meeqat://r/<CODE>` deep links open the join page `/r/<CODE>` in the app.

## Units

**A. Service** (`services/together`) — `POST /api/sanad/handoff`, `POST /api/sanad/redeem` in
`internal/sanad`, migration `3_native.go` (token duration 30 d, rate limits 60/h each). Go test: happy
path, wrong verifier, reuse, expiry.

**B. App sign-in + rooms on native**
- `app/utils/pkce.ts` (WebCrypto), `/native-login` page (web only), native branch in `useTogether`
  (`signInWithBrowser()`, deep-link redeem, session persisted via tauri store, sign out),
  `SignInGate` shows "Sign in with your browser" on native (+ "Paste code" fallback for dev builds).
- `tauri-plugin-deep-link` (scheme `meeqat`, desktop + Android) + `tauri-plugin-single-instance`
  with its `deep-link` feature (Windows/Linux deliver links to the running instance); handler in a
  client plugin: `meeqat://auth` → redeem; `meeqat://r/<code>` → `/r/<code>`.
- Remove `web-only` from rooms pages; entry button on the index page for all platforms; Settings
  Account section: on native, show the Together account (name, sign out) instead of Sanad's.
- `useCallAlerts` on native uses the notification plugin instead of the browser `Notification`.

**C. Desktop listener + tray card** (Rust, `src-tauri/src/together.rs`)
- Commands `together_set_session(url, token)` / `together_clear_session`; the webview calls them
  after sign-in / refresh / sign-out. A thread speaks PocketBase realtime: `GET /api/realtime` (SSE)
  → `PB_CONNECT` clientId → `POST /api/realtime {clientId, subscriptions:["calls"]}` with the token;
  reconnect with backoff; on (re)connect fetch active calls (`GET /api/collections/calls/records?filter=…`).
- New call by someone else → native notification "Ahmed started Asr · Musalla B2" (click opens the
  room) + `emit("together:calls", …)` to webviews. Finalized call I joined → schedule a reminder 5 min
  before `meet_at` through the existing `notify.rs` scheduler (replace on change, cancel on
  cancel/leave). Dedupe by call id + status.
- Tray popover: a compact card for the next active call (prayer · place · organizer · going count)
  with **Join** / **Open**; Join goes through the JS SDK with the shared session.
- Android: no background listener in v1 — alerts while the app is open, via B's notification path.

**D. Ship** — web + service deploy; version bump to 3.6.0 and release after the manual checks.
