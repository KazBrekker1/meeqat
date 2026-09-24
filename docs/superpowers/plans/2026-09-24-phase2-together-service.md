# Phase 2 — Together service (PocketBase) + prayer-times calendar feed

> **Decisions (owner):** PocketBase; lean tests (only the three rules below); calendar = one
> subscribable link whose events carry their own alerts ("let the calendar do everything");
> go live automatically after local checks pass.
>
> **For agentic workers:** use superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** A small Go service at https://together.sanad.ink — PocketBase as a library — that
holds Pray Together data (rooms, memberships, calls, polls, chat, history) behind access
rules, accepts Sanad logins via a token exchange, and serves a subscribable `.ics` calendar
of prayer times. Plus an "Add to calendar" section in the app.

**Spec:** `docs/superpowers/specs/2026-09-24-pray-together-design.md` §2, §3.3, §3.4 (exchange), §5, §6.

**Tech:** Go 1.27, PocketBase v0.40.4 (`github.com/pocketbase/pocketbase`), `github.com/golang-jwt/jwt/v5`,
`github.com/MicahParks/keyfunc/v3` (JWKS), AlAdhan calendar API, Docker (distroless), Coolify.

**Testing policy:** Go tests only for (1) exchange validation, (2) one-active-call incl. a
parallel race, (3) unsubscribed members see no calls. Everything else: `go vet`, `go build`,
a local run with `curl`, and the app's `bunx nuxi typecheck`.

**PocketBase API note:** verify every PocketBase call against the installed version
(`go doc github.com/pocketbase/pocketbase/core <Symbol>`), not memory — v0.23+ APIs differ
from older examples online.

---

## Layout

```
services/together/
  go.mod                      module meeqat.app/together
  main.go                     app bootstrap: routes, hooks, cron, superuser-from-env
  migrations/1_init.go        collections, fields, indexes, rules, rate limits
  internal/sanad/exchange.go  JWKS verification + user upsert + PocketBase token
  internal/calls/calls.go     call create/update hooks, day-in-room-tz, jumuah rule
  internal/rooms/rooms.go     join-by-code, rotate-code, nearby
  internal/cleanup/cleanup.go cron: end calls, write history, delete old messages
  internal/calendar/ics.go    /cal/prayers.ics (AlAdhan month fetch, cache, VEVENT+VALARM)
  internal/*_test.go          the three test areas only
  Dockerfile                  multi-stage → gcr.io/distroless/static, VOLUME /pb_data
app/components/prayer/CalendarSubscribe.vue   "Add to calendar" (Settings)
```

---

## Unit A — Service skeleton + schema

### Task A1: module + bootstrap

- [ ] `cd services/together && go mod init meeqat.app/together && go get github.com/pocketbase/pocketbase@v0.40.4`
- [ ] `main.go`:
  - `app := pocketbase.New()`; register migrations with `migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{Automigrate: false})` and blank-import `meeqat.app/together/migrations`.
  - Import `_ "time/tzdata"` (distroless has no zoneinfo; call days are computed in room time zones).
  - On bootstrap, if env `PB_SUPERUSER_EMAIL` and `PB_SUPERUSER_PASSWORD` are set, upsert that superuser (so the admin UI is usable after the first deploy without a shell).
  - `app.OnServe().BindFunc(...)`: register routes from the internal packages (each exposes `Register(se *core.ServeEvent, app core.App)`), `GET /api/health` → `{"ok":true}`.
  - `app.Start()`.
- [ ] Run: `go run . serve --http 127.0.0.1:8090` → `curl -s localhost:8090/api/health` prints `{"ok":true}`.
- [ ] Commit: `feat(together): PocketBase service skeleton`.

### Task A2: schema migration (`migrations/1_init.go`)

Collections (all fields as in spec §3.3). Use the built-in `users` auth collection and add
fields to it rather than creating a new one.

| Collection | Fields | Indexes |
|---|---|---|
| `users` (existing auth) | `sanad_id` text required, `avatar_url` url | unique `sanad_id` |
| `rooms` | `name` text req max 60 · `default_place` text max 80 · `tz` text req · `code` text req (8 chars, A–Z2–9) · `owner` relation→users req · `discoverable` bool · `lat` number · `lng` number | unique `code`; (`lat`,`lng`) |
| `memberships` | `room` relation→rooms req (cascade delete) · `user` relation→users req (cascade) · `role` select owner/caller/member req · `subscribed` bool | unique (`room`,`user`) |
| `calls` | `room` relation req (cascade) · `prayer` select fajr/dhuhr/asr/maghrib/isha/jumuah req · `day` text req (YYYY-MM-DD) · `status` select open/finalized/ended/cancelled req · `organizer` relation→users req · `place` text max 80 · `meet_at` date · `place_changed_at` date | **partial unique** (`room`,`prayer`,`day`) `WHERE status IN ('open','finalized')` |
| `participants` | `call` relation req (cascade) · `user` relation req | unique (`call`,`user`) |
| `poll_options` | `call` relation req (cascade) · `kind` select place/time/other · `label` text req max 60 · `value` text max 80 | |
| `poll_votes` | `call` relation req (cascade) · `option` relation→poll_options req (cascade) · `user` relation req | unique (`call`,`user`) |
| `messages` | `call` relation req (cascade) · `user` relation req · `body` text req max 280 | (`call`,`created`) |
| `room_history` | `room` relation req (cascade) · `prayer` · `day` · `place` · `joined` number | (`room`,`day`) |

Autodate fields `created`/`updated` on every collection.

**Access rules** — "subscribed member of the call's room", written with ONE alias so all
three conditions apply to the same membership row (this is what test 3 guards):

```
SUB(roomExpr) =
  @request.auth.id != "" &&
  @collection.memberships:me.room ?= {roomExpr} &&
  @collection.memberships:me.user ?= @request.auth.id &&
  @collection.memberships:me.subscribed ?= true
MEMBER(roomExpr) = same without the subscribed line
```

| Collection | list/view | create | update | delete |
|---|---|---|---|---|
| `users` | `id = @request.auth.id` | superuser only (exchange creates) | `id = @request.auth.id` | superuser |
| `rooms` | `MEMBER(id)` | `@request.auth.id != "" && owner = @request.auth.id` | owner only: `owner = @request.auth.id` | owner |
| `memberships` | own rows, or rows of rooms I'm a member of: `user = @request.auth.id \|\| MEMBER(room)` | superuser only (join route / room-create hook) | own `subscribed` only: `user = @request.auth.id && @request.body.role:isset = false && @request.body.room:isset = false && @request.body.user:isset = false`; owner may change `role`: via hook (A2 note) | own row (leave) or room owner |
| `calls` | `SUB(room)` | `SUB(room)` (+ caller check in hook) | `organizer = @request.auth.id` (+ hook) | none |
| `participants` | `SUB(call.room)` | `SUB(call.room) && user = @request.auth.id` | none | `user = @request.auth.id` |
| `poll_options` | `SUB(call.room)` | `call.organizer = @request.auth.id` | organizer | organizer |
| `poll_votes` | `SUB(call.room)` | `SUB(call.room) && user = @request.auth.id` | `user = @request.auth.id` | `user = @request.auth.id` |
| `messages` | `SUB(call.room)` | `SUB(call.room) && user = @request.auth.id` | none | `user = @request.auth.id` |
| `room_history` | `MEMBER(room)` | superuser (cron) | none | none |

A2 note: role changes (owner promotes caller) go through `PATCH /api/rooms/{id}/members/{userId}`
(Unit C), not the generic update rule.

Rate limits (app settings, in the migration): enable; `POST /api/collections/calls/records` 10/h
per user; `POST /api/collections/messages/records` 30/min; `POST /api/sanad/exchange` 60/h per IP.

- [ ] Run `go run . migrate up && go run . serve` → open http://127.0.0.1:8090/_/ and confirm the collections/indexes/rules (superuser from env).
- [ ] Commit: `feat(together): schema, indexes and access rules`.

---

## Unit B — Sanad token exchange (`internal/sanad`)

`POST /api/sanad/exchange` body `{ "token": "<Sanad JWT>" }`:
1. Verify with JWKS `https://auth.sanad.ink/api/auth/jwks` (keyfunc v3, background refresh,
   `SANAD_JWKS_URL` env override for tests): alg RS256 only, `iss` == `SANAD_ISSUER`
   (default `https://auth.sanad.ink`), `aud` contains `SANAD_AUDIENCE` (default `convex` —
   Sanad's current audience), `exp`/`nbf` with 60 s leeway.
2. Find `users` by `sanad_id = sub`; create if missing (random password, `verified=true`,
   email from claim or `<sub>@users.meeqat.invalid` if absent); update `name`/`avatar_url`
   from `name`/`image` claims when changed.
3. Return `{ "token": record.NewAuthToken(), "record": <user> }` (PocketBase auth token; set the
   `users` collection auth token duration to 7 days in A2).
Errors: 400 missing token, 401 invalid/expired/wrong aud/iss — same generic message.

**Test (1)** `exchange_test.go`: spin an `httptest` JWKS server with a generated RSA key; cases:
valid → 200 + user created with `sanad_id`; second call → same user, name updated; wrong `aud` → 401;
expired → 401; signed by unknown key → 401; `alg: none`/HS256 → 401.

- [ ] Implement, `go test ./internal/sanad/...` passes, commit `feat(together): Sanad token exchange`.

---

## Unit C — Rooms & calls

**Rooms (`internal/rooms`)**
- Hook `OnRecordCreateRequest("rooms")`: generate `code` (8 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`,
  retry on collision), force `owner = auth`, validate `tz` with `time.LoadLocation`, round
  `lat/lng` to 3 dp and clear them unless `discoverable`. After create: insert owner membership
  (`role=owner`, `subscribed=true`) in the same transaction.
- `POST /api/rooms/join` `{code}` (auth): find room by code → upsert membership `role=member, subscribed=true` → return room.
- `POST /api/rooms/{id}/join` (auth): join a **discoverable** room without a code.
- `POST /api/rooms/{id}/rotate-code` (owner) → new code.
- `PATCH /api/rooms/{id}/members/{userId}` `{role: caller|member}` (owner; can't demote self) ; `DELETE` same path removes a member (owner).
- `GET /api/rooms/nearby?lat&lng` (auth): discoverable rooms with `lat` within ±0.01 and `lng`
  within ±0.01/cos(lat), haversine ≤ 1000 m, sorted by distance; returns `id, name, default_place,
  distance_m` (rounded to 50), `members` count. Never codes or member lists.

**Calls (`internal/calls`)**
- `OnRecordCreateRequest("calls")` (inside the request transaction):
  requester has a membership with role owner/caller **and** `subscribed=true`; set
  `organizer = auth`, `status = open`, `day = now in room.tz (YYYY-MM-DD)`, default `place` to
  `room.default_place`; reject `prayer=jumuah` unless that day is Friday in room tz (400);
  if an active call exists for (room, prayer, day) → 409 with `{ "existing": <call id> }`.
  The partial unique index turns a concurrent duplicate into a DB error → map to the same 409.
  After create: add organizer to `participants`.
- `OnRecordUpdateRequest("calls")`: only `place`, `meet_at`, `status` (finalize/cancel) change;
  a `place` change sets `place_changed_at = now`; finalize requires `finalize_option` in the body →
  must belong to this call → `kind=place` sets `place`, `kind=time` sets `meet_at` (parse RFC3339);
  status transitions: open→finalized, open|finalized→cancelled only.

**Test (2)** `calls_test.go`: caller creates Asr call → 201; second create same room/prayer/day → 409
with `existing`; 10 goroutines create concurrently → exactly one 201, rest 409; member (not caller)
→ 403; jumuah on a non-Friday → 400; jumuah + dhuhr on a Friday → both 201.
**Test (3)** `access_test.go`: unsubscribed member lists `calls` → empty; subscribed member → sees it;
non-member → empty.

- [ ] Implement, tests pass, commit `feat(together): rooms and calls rules`.

## Unit D — Cleanup cron (`internal/cleanup`)

`app.Cron().MustAdd("calls-lifecycle", "*/5 * * * *", …)`:
- End calls: `status` open/finalized and (`meet_at` + 30 min < now, or `meet_at` empty and
  `created` + 45 min < now) → `status=ended`; write `room_history` (prayer, day, place, participants count).
- Delete `messages` whose call ended > 1 h ago (by call `updated`).
- Check by running with a temporary 1-minute schedule locally and a hand-made old call (no test).
- [ ] Commit `feat(together): end calls and delete chat on a schedule`.

---

## Unit E — Calendar feed (`internal/calendar`) + app UI

**Endpoint** `GET /cal/prayers.ics?lat&lng&method&tz[&name][&alert][&days][&sunrise]` — no auth:
- Validate: lat/lng numbers (rounded to 3 dp), `method` int 0–23, `tz` loads, `alert` minutes
  0–60 (default **10**), `days` 7–90 (default 60), `sunrise` 0|1 (default 0), `name` ≤ 40 chars.
- Data: AlAdhan `https://api.aladhan.com/v1/calendar/{year}/{month}?latitude&longitude&method&timezonestring&shafaq=general`
  for the months covering today…today+days; cache per (lat,lng,method,tz,year,month) for 24 h
  in memory (bounded, e.g. 5,000 entries LRU); on AlAdhan failure serve stale cache or 503.
  Parse `HH:MM (+03)` timings in `tz` for each date.
- Output: `text/calendar; charset=utf-8`, `Cache-Control: public, max-age=21600`.
  `VCALENDAR` with `X-WR-CALNAME:Prayer times · {name}`, `X-WR-TIMEZONE:{tz}`,
  `REFRESH-INTERVAL;VALUE=DURATION:PT12H` and `X-PUBLISHED-TTL:PT12H`. One `VEVENT` per prayer:
  stable `UID:{date}-{prayer}-{lat}-{lng}-{method}@meeqat`, `DTSTART` UTC, `DURATION:PT20M`,
  `SUMMARY:{Fajr|Dhuhr|Asr|Maghrib|Isha}` (Friday Dhuhr → `Jumu'ah / Dhuhr`),
  `TRANSP:TRANSPARENT` (doesn't mark you busy), and a `VALARM` (`ACTION:DISPLAY`,
  `TRIGGER:-PT{alert}M`) — the calendar does the reminding. Lines folded at 75 octets, CRLF.
- Check: `curl` the feed for Doha method 4 and compare 3 days against the app's times; validate
  with `python3 -c "import icalendar"` or an online validator. No Go test.

**App** `app/components/prayer/CalendarSubscribe.vue`, shown in Settings on web and desktop
(and Android) when a location is set:
- Builds the feed URL from the active location (city coordinates or GPS point), method,
  time zone and city name: `https://together.sanad.ink/cal/prayers.ics?...`.
- Buttons: **Apple / Outlook** (`webcal://…`), **Google Calendar**
  (`https://calendar.google.com/calendar/render?cid=` + encoded `webcal://…`), **Copy link**.
  Note under them: "Your calendar refreshes this every few hours; Google can take up to a day."
- Opening external links in the Tauri shells: add `tauri-plugin-opener` (Rust + JS) and open
  via `openUrl()` when `getPlatform() !== "web"`; plain links on the web.
- Also mention it on `/privacy`: the calendar link contains the chosen coordinates (rounded)
  and is fetched by your calendar provider.
- [ ] `bunx nuxi typecheck`; manual check that the three buttons produce correct URLs.
- [ ] Commits: `feat(together): subscribable prayer-times calendar`, `feat(app): add prayer times to your calendar`.

---

## Unit F — Deploy together.sanad.ink

- [ ] `services/together/Dockerfile`: `golang:1.27` build (`CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /together .`) → `gcr.io/distroless/static:nonroot`, `VOLUME /pb_data`, `EXPOSE 8090`,
      `CMD ["/together","serve","--http=0.0.0.0:8090","--dir=/pb_data"]`, run `migrate up` automatically on start (PocketBase auto-applies registered migrations on serve).
- [ ] Coolify (API, as for meeqat-web): new app in project "Meeqat", Dockerfile
      `/services/together/Dockerfile`, base directory `/services/together`, port 8090, domain
      `https://together.sanad.ink`, persistent volume `/pb_data`, env `PB_SUPERUSER_EMAIL`,
      `PB_SUPERUSER_PASSWORD` (generated, stored in Coolify only), memory limit 512 MB. Deploy.
- [ ] Verify live: `/api/health` 200; `/api/sanad/exchange` with a junk token → 401;
      `/cal/prayers.ics?lat=25.285&lng=51.531&method=4&tz=Asia/Qatar&name=Doha` → valid calendar;
      admin UI reachable at `/_/`.
- [ ] Push `main` (release workflow skips publishing; web redeploys via API for the Settings UI).
