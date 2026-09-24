# Phase 3 — Rooms & calls on the web

> Spec: `docs/superpowers/specs/2026-09-24-pray-together-design.md` §2 (product rules — the source of truth
> for behaviour), §3.5, §4. Backend is live at https://together.sanad.ink (`services/together`).
> Testing policy (owner): `bunx nuxi typecheck` + ONE Playwright E2E script. No unit tests.

**Goal:** signed-in web users can create/join rooms, start and join calls, vote, chat, discover
nearby rooms and see history — live, via PocketBase realtime — at meeqat.sanad.ink.
Native apps get this in Phase 4 (native sign-in); for now the rooms routes are web-only.

## Backend contract (already built — read the Go code when unsure)

- Collections: `rooms`, `memberships` (role owner/caller/member, `subscribed`), `calls` (prayer
  fajr/dhuhr/asr/maghrib/isha/jumuah, `day`, status open/finalized/ended/cancelled, organizer,
  place, meet_at, place_changed_at), `participants`, `poll_options` (kind place/time/other, label,
  value), `poll_votes` (one per user per call), `messages` (≤280), `room_history`, `users`
  (name, avatar_url; others' names visible via expand).
- Rules: calls/participants/poll_*/messages only visible to **subscribed** members; rooms/memberships/
  history to members. Realtime (SSE) obeys the same rules.
- Server sets on call create: organizer, status=open, day (room tz), default place; 409
  `{data:{existing:<id>}}` if an active call exists → open that call instead. Jumu'ah only on Fridays (400).
- Call update (organizer only): `place`, `meet_at`, `status: "cancelled"`, or
  `finalize_option: <poll_option id>` (sets place for kind=place; meet_at for kind=time, whose
  `value` must be an ISO datetime; status→finalized). Nothing is editable once ended/cancelled.
- Custom routes (auth): `POST /api/rooms/join {code}`, `POST /api/rooms/{id}/join` (discoverable),
  `POST /api/rooms/{id}/rotate-code`, `PATCH|DELETE /api/rooms/{id}/members/{userId}` (`{role}`),
  `GET /api/rooms/nearby?lat&lng` → `[{id,name,default_place,distance_m,members}]`.
- Room create: `POST /api/collections/rooms/records {name, default_place, tz, discoverable, lat, lng}`
  (server sets owner + code, rounds/clears coords, adds owner membership).
- Leave a room: delete own membership record. Subscribe toggle: update own membership `{subscribed}`.
- Exchange: `POST /api/sanad/exchange {token}` → `{token, record}` (PocketBase auth, 7 days).

## Tasks

1. **SDK + types** — `bun add pocketbase`. Generate `app/types/together.ts` with
   `bunx pocketbase-typegen --db services/together/pb_data/data.db --out app/types/together.ts`
   (run the service once locally with `go run . serve` in `services/together` to create the DB); add
   script `"together:types"`. If typegen is awkward, hand-write the types from the migration.

2. **`app/composables/useTogether.ts`** — module singleton `PocketBase(togetherUrl)` (runtime config
   `public.togetherUrl`, exists). `status: "signed-out" | "connecting" | "ready" | "error"`.
   `ensureSession()`: valid `pb.authStore` → ready; else `useAccount().getToken()` → exchange →
   `authStore.save`. Sanad signed out → clear authStore, "signed-out". Exchange failure → "error"
   ("Can't reach your account — try again"). Dev-only (`import.meta.dev`): `?together-token=<pb token>`
   saves that token (used by the E2E and manual testing); must be tree-shaken from prod.
   Point `NUXT_PUBLIC_TOGETHER_URL=http://127.0.0.1:8090` for local dev.

3. **`app/composables/useRooms.ts`** — my rooms (`memberships` with `expand: room`), create, join by
   code, join discoverable, leave, subscribe toggle, owner edits (name/default place/discoverable +
   "use my current location" via existing `useGeolocation`), rotate code, members (`expand: user`),
   set role, remove member, nearby (asks for position once; position never stored), history.

4. **`app/composables/useRoomCalls.ts`** (per room) — today's active calls (status open|finalized)
   with participants, poll options + vote counts, my vote, messages; realtime subscriptions on
   `calls`, `participants`, `poll_options`, `poll_votes`, `messages` filtered to this room/call,
   unsubscribed on unmount; re-fetch on reconnect (`PB_CONNECT`). Actions: start (409 → select existing),
   join/leave, edit place, add/remove poll option, vote/change vote, finalize, cancel, send message.

5. **`app/composables/useCallAlerts.ts`** — started once from `app.vue`/index on the web while signed
   in: subscribe to `calls` create/update. New call (not mine) → toast with **Join** / **Ignore**
   actions + browser `Notification` if permission granted (ask on first room join, not on load).
   Finalized call I joined → in-page timer 5 min before `meet_at` → toast + Notification. Web only
   fires while a tab is open — say so once in the rooms page.

6. **Pages** (middleware `web-only`: non-web → `/`, like `desktop-only`):
   - `/rooms` — sign-in gate (reuse `useAccount` Google/passkey buttons) → my rooms list (name, place,
     role, subscribed state, active call badge), **Create room** (name, default place; tz from device),
     **Join with code** (8 chars, uppercase, forgiving input), **Nearby** (discoverable within 1 km, join).
   - `/rooms/[id]` — header (name, place, subscribe toggle, leave); active call card(s); **Start a call**
     for callers/owner: prayer picker defaulting to the next prayer from the app's own prayer times
     (`usePrayerTimes`), Jumu'ah offered only on Fridays (room tz), place (defaults to room's), optional
     poll options; unsubscribed members see "Subscribe to see calls" instead of calls; members list
     (owner: make caller/member, remove); invite: copy link `https://meeqat.sanad.ink/r/<code>` and
     code, owner rotate; owner settings (name, place, discoverable + location); history (last 20).
   - Call card: prayer · organizer · place (+ "place changed" marker if `place_changed_at`) · meet time;
     participants (avatars/initials + count); **Join** / **Leave**; poll (options with counts, my vote
     highlighted; organizer adds options and **Finalize** any option); chat (list + input, 280 max,
     autoscroll); organizer: edit place, cancel.
   - `/r/[code]` — sign in if needed → join → `navigateTo('/rooms/<id>')`; errors inline.
   - Entry point: "Pray together" button on the index page, web only, near the existing header actions.
   - Look: match the app (dark, Reem Kufi, `rounded-xl bg-elevated border border-default`,
     `text-[11px] uppercase tracking-wider text-muted` section labels, @nuxt/ui components). Mobile-first
     width; works on desktop browsers. `@click` handlers must be functions (strict @nuxt/ui types).

7. **Privacy page** — the "Pray Together will store" section becomes present tense and exact:
   account name/avatar, rooms, memberships, calls, votes, chat (deleted 1 h after a call), history
   counts; nearby search position not stored; room location only if discoverable, ~100 m.

8. **E2E** `tests/e2e/together-e2e.mjs` (+ script `test:e2e:together`): starts nothing itself —
   expects `bun dev` (with `NUXT_PUBLIC_TOGETHER_URL`) and a local service with
   `PB_SUPERUSER_EMAIL/PASSWORD`; creates two users via the superuser API + `impersonate`, then in two
   browser contexts with `?together-token=`: A creates room → B joins by code → A starts call with two
   place options → B joins + votes → A finalizes → B sees finalized place → B chats → A sees message.

9. **Checks** — typecheck clean; E2E passes; screenshots of `/rooms`, `/rooms/[id]` with an active
   call, and the join page to `/tmp/phase3-*.png` (mobile 390px + desktop 1280px for the room page).
   Commit per task group (`feat(rooms): ...`).
