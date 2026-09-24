# Pray Together + Meeqat on the web — design

Status: draft for review · 2026-09-24
Research behind it: `docs/research/prayer-app-user-needs.md`, `docs/research/realtime-backend-options.md`.

## 1. Goal

Help people in the same place — typically a workplace — pray in congregation. Someone
starts a **call** for the coming prayer in a **room**; everyone subscribed to that room
is told, and can **join** or **ignore**, vote on where/when, and chat briefly. Meeqat
becomes available in three ways — **web** (meeqat.sanad.ink), **desktop** (tray), and
**Android** — with an optional Sanad account that the rooms feature requires.

Non-goals (v1): push notifications while the app is closed, iOS, settings sync, family
circles, mosque/iqama integrations. Prayer times, reminders, Qibla and widgets keep
working signed out and offline, exactly as today.

## 2. Product rules

**Rooms**
- Created by any signed-in user, who becomes **owner**. Fields: name, default place
  ("Floor 3 musalla"), time zone (IANA, from the creator), 8-character **join code**.
- Joined with the code or an invite link `https://meeqat.sanad.ink/r/<code>` (opens the
  installed app via `meeqat://r/<code>` when present).
- Roles: **owner** (rename, edit default place, rotate code, remove members, choose
  callers, make discoverable), **caller** (can start calls), **member** (join, vote, chat).
  The owner is always a caller.
- Each member can **subscribe/unsubscribe** (unsubscribed = still a member, not notified).
- **Discoverable** (owner opt-in, default off): the room stores a location rounded to
  3 decimal places (~110 m). Anyone signed in can list discoverable rooms within ~1 km
  of a position they send with the query (never stored) and subscribe without a code,
  as a member.

**Calls**
- One **active** call per room per prayer per day (active = `open` or `finalized`).
  A second caller trying to start one is shown the existing call instead.
- Started by a caller with a place (defaults to the room's) and an optional poll.
- The place is editable by the organizer while the call is active; members see a
  "place changed" marker.
- **Poll**: the organizer writes options, each tagged `place`, `time` or `other`; members
  vote (one vote per member per call). The organizer **finalizes** by picking an option
  (not necessarily the most-voted): a `place` pick sets the place, a `time` pick sets the
  meeting time.
- Members **join** or **ignore**. Ignore is local only (nothing sent). Joining can be undone
  until the call ends.
- On finalize, every joiner's device **arms a local reminder** for the meeting time
  (5 min before), using the existing schedulers (Rust on desktop, native on Android,
  an in-page timer on web while the tab is open).
- A call **ends** 30 min after its meeting time (or 45 min after start if never finalized),
  or when the organizer cancels. Ending writes a one-line **history** entry
  ("Asr · 6 prayed together · B2") and schedules chat deletion.
- Ownership of an open call passes to any other caller if the organizer leaves the room.

**Chat**
- Per call, messages ≤ 280 characters, members only. Deleted 1 hour after the call ends.
  No message is kept anywhere after that.

**Reaching people** (no push service)
- Clients hold a live connection only **in prayer windows** — 20 min before to 30 min
  after each of the user's prayer times — and whenever the rooms UI is open. On connect
  they fetch active calls, so a call started earlier is not missed.
- A new call in a subscribed room raises a local notification: "Ahmed started Asr ·
  Musalla B2 — Join / Ignore". On desktop it also appears in the tray popover.

## 3. Architecture

```
            meeqat.sanad.ink (web)      Tauri desktop (tray)      Android app
                 │  same Nuxt app, three build targets (platform adapters)  │
                 └───────────────┬───────────────────────┬──────────────────┘
       Sanad session ────────────┘                       │ PocketBase SDK + realtime (SSE)
   (cookie on web; bearer on native)                     ▼
auth.sanad.ink ──JWT (RS256)──▶ together.sanad.ink  (PocketBase as a Go program)
   better-auth                  · /api/sanad/exchange → PocketBase session
                                · collections + API rules + hooks + cron
                                · SQLite (pb_data volume), nightly backup to S3
```

### 3.1 Repository layout (light monorepo)

```
meeqat/
  app/                  Nuxt app — unchanged location; now also the web target
  app/platform/         web.ts · desktop.ts · android.ts (see 3.2)
  src-tauri/            desktop + Android shell (unchanged)
  services/together/    PocketBase Go program (main.go, hooks, migrations, tests)
  tools/widget-preview/ (existing)
  docs/
```
- One `package.json` stays at the root; `services/together` is a Go module.
- PocketBase collection types are generated into `app/types/together.ts`
  (`pocketbase-typegen`) so the app and service share one schema source.
- CI: new `together.yml` (Go test + Docker image) and `web.yml` (build + deploy);
  the release workflow only runs for desktop/Android changes (path filters).
- Later, if the web app diverges (landing page, SEO): split into Nuxt layers
  (`layers/core` + `apps/web` + `apps/native`). Not needed now.

### 3.2 Platform adapters

The code already branches on `isTauriAvailable()`. Formalize it as one interface
chosen at startup, so feature code never checks the platform itself:

| Capability | web | desktop | Android |
|---|---|---|---|
| Sign in | Sanad cookie (same site) | browser handoff + deep link (3.4) | same as desktop |
| Store session | cookie (Sanad) | OS keychain (Rust `keyring`) | app-private store |
| Realtime owner | page (while tab open) | **Rust listener** in prayer windows + page when open | app webview while running |
| Notifications | Notification API while tab open | Rust scheduler (exists) | native schedule (exists) |
| Updates | n/a (deploy) | updater (exists) | APK updater (exists) |

Desktop's listener lives in Rust because the hidden main window is throttled by macOS
(the same reason the tray moved to Rust). It speaks PocketBase's realtime protocol
(SSE `GET /api/realtime`, then `POST` subscriptions) and forwards events to the webviews
and the notification scheduler.

### 3.3 PocketBase service (`services/together`)

PocketBase imported as a Go library (`pocketbase.New()`), still one binary.

**Collections**

| Collection | Fields | Notes |
|---|---|---|
| `users` (auth) | `sanad_id` (unique), `name`, `avatar` | created/updated on exchange; no password login |
| `rooms` | `name`, `default_place`, `tz`, `code` (unique), `owner`→users, `discoverable`, `lat`, `lng` | `lat`/`lng` only when discoverable, rounded to 3 dp; index on (`lat`,`lng`) |
| `memberships` | `room`→rooms, `user`→users, `role` (owner/caller/member), `subscribed` | unique (`room`,`user`) |
| `calls` | `room`, `prayer` (fajr/dhuhr/asr/maghrib/isha/jumuah), `day` (YYYY-MM-DD in room tz), `status` (open/finalized/ended/cancelled), `organizer`→users, `place`, `meet_at`, `place_changed_at` | partial unique index (`room`,`prayer`,`day`) WHERE status IN ('open','finalized') |
| `participants` | `call`, `user` | unique (`call`,`user`) |
| `poll_options` | `call`, `kind` (place/time/other), `label`, `value` | organizer-only writes |
| `poll_votes` | `call`, `option`, `user` | unique (`call`,`user`) |
| `messages` | `call`, `user`, `body` (≤280) | members only |
| `room_history` | `room`, `prayer`, `day`, `place`, `joined` | written on call end |

**Access rules** (PocketBase rule syntax, abridged):
- `calls` list/view: `@request.auth.id != "" && room.memberships_via_room.user ?= @request.auth.id`
- `calls` create: members with role owner/caller (enforced in a hook; see below)
- `messages` create: sender is a participant-or-member of the call's room and `user = @request.auth.id`
- `rooms` view: members, or `discoverable = true` (limited fields via a custom
  `/api/rooms/nearby` route that never returns member lists)

**Hooks and routes**
- `POST /api/sanad/exchange` — body: Sanad JWT. Verifies it against
  `https://auth.sanad.ink/api/auth/jwks` (RS256, `iss` = `https://auth.sanad.ink`,
  checked `aud`, cached keys, 60 s clock skew), finds or creates the user by
  `sub` → `sanad_id`, refreshes name/avatar from claims, returns a PocketBase auth
  token (7-day expiry; clients re-exchange on expiry or 401).
- `OnRecordCreateRequest(calls)` — in the request transaction: requester is a caller of
  the room; compute `day` in the room's tz; if an active call exists return it with 409.
  The partial unique index is the backstop against races.
- `OnRecordUpdateRequest(calls)` — organizer-only for place/poll/finalize/cancel;
  finalize validates the chosen option belongs to the call.
- `GET /api/rooms/nearby?lat&lng` — bounding box ±0.01° on the index, then haversine
  ≤ 1 km, returns name, default place, distance (rounded to 50 m), member count.
- `POST /api/rooms/{id}/rotate-code`, `POST /api/rooms/join` (code) — owner / anyone.
- Cron every 5 min: end calls past their end time, write `room_history`, delete messages
  of calls ended > 1 h ago.
- Built-in rate limiter on: 10 calls/hour/user, 30 messages/min/user, 60 exchange/hour/IP.

**Deployment**: Coolify app from `services/together/Dockerfile` (multi-stage Go →
distroless), domain `together.sanad.ink`, volume for `pb_data`, memory cap 512 MB
(measured ~150 MB at 2,000 live connections), nightly backup via PocketBase's S3 backups,
admin UI restricted to the owner's account.

### 3.4 Sign-in

**Web (meeqat.sanad.ink)** — a `.sanad.ink` subdomain, so the existing Sanad cookie
applies. The app calls `GET https://auth.sanad.ink/api/auth/token` (credentials: include)
for a JWT and exchanges it at `/api/sanad/exchange`.

**Desktop/Android** — the web app is the login page:
1. App opens the system browser at `https://meeqat.sanad.ink/native-login?state=<random>`.
2. The page (signed in via cookie, or after Sanad sign-in) asks Sanad for a one-time token
   and redirects to `meeqat://auth?ott=<token>&state=<state>`.
3. The app checks `state`, redeems the one-time token with Sanad for a session, stores the
   bearer token in the keychain, then does the same JWT → exchange as the web.

**Changes to sanad-auth**: add better-auth `bearer` and `oneTimeToken` plugins
(one-time tokens expire in 3 min, single use); add `https://meeqat.sanad.ink`,
`tauri://localhost`, `http://tauri.localhost` to `TRUSTED_ORIGINS`. The `/token` JWT
endpoint and existing apps are unaffected. The native-login page only ever redirects to
the `meeqat://` scheme.

Tauri: `tauri-plugin-deep-link` registers `meeqat://` (macOS/Windows/Linux/Android).
Deep links only reach an installed bundle on macOS, so local dev uses a debug build or a
paste-the-code fallback.

### 3.5 Web app deployment

- Same Nuxt app; `nuxt generate` → static files served by Coolify (Caddy/nginx image).
  Routes: `/` (prayer times, as the app), `/rooms`, `/r/:code`, `/native-login`.
- Desktop-only pieces (tray, updater, widget, Rust scheduler) are behind the platform
  adapter and never load on the web.
- Web reminders fire only while a tab is open; the page says so and links the apps.

## 4. Error handling

- **Exchange fails** (Sanad down, expired JWT): rooms UI shows "Can't reach your account
  — try again"; everything else in Meeqat keeps working.
- **Realtime drops**: the SDK/listener reconnects with backoff; on reconnect it re-fetches
  active calls, so nothing is missed within the window.
- **Race to start a call**: the loser gets 409 with the existing call and sees it.
- **Offline**: rooms UI is read-only with a banner; queued actions are not retried silently
  (a failed join shows "Couldn't join — retry").
- **Removed from a room / code rotated**: next request returns 403; the room disappears
  with a one-line notice.

## 5. Privacy

- No user location is stored. Nearby search sends a position with the request only.
- Room locations are opt-in and rounded to ~110 m.
- Chat is deleted 1 h after a call; history keeps counts, not names.
- A plain-language privacy page (web + app) lists exactly what the rooms feature stores,
  published before launch (per the research: the category's trust baseline).
- Account deletion: add a Sanad `user.delete` webhook; the service deletes that user's
  memberships, participants, votes and messages.

## 6. Testing

- **Service (Go)**: PocketBase `tests.ApiScenario` for exchange (valid, wrong `aud`,
  expired, unknown key), call creation (caller/member, duplicate → 409, race via parallel
  requests), finalize, access rules (non-member cannot list/subscribe), cron (end + delete).
- **Load**: the existing 2,000-subscriber benchmark script run against the service in CI
  weekly (memory ceiling assertion).
- **App**: unit tests for prayer-window computation and the platform adapter; Playwright
  E2E on the web build (create room → join by code → start call → vote → finalize).
- **Desktop listener**: Rust tests against a local PocketBase (connect, subscribe, reconnect).

## 7. Delivery phases (each gets its own implementation plan)

1. **Web target + web sign-in** — platform adapters, `nuxt generate` web build deployed to
   meeqat.sanad.ink, Sanad cookie sign-in, privacy page.
2. **Together service** — `services/together` with schema, rules, hooks, exchange, cron,
   tests; deployed to together.sanad.ink.
3. **Rooms & calls on the web** — rooms, join codes/links, calls, poll, chat, nearby,
   history.
4. **Native sign-in + desktop/Android** — sanad-auth plugins, native-login handoff, deep
   links, keychain; Rust listener + tray card on desktop; Android in-app connection.
5. **Later** — settings/prayer-log sync, push notifications, Sanad delete webhook if not
   done in 2.

## 8. Open questions (decide before phase 3)

- Jumu'ah: separate "prayer" value (as above), or a Dhuhr call on Fridays?
- Should unsubscribed members still see calls when they open the app? (Proposed: yes,
  just no notification.)
