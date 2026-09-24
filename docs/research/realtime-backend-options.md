# Realtime backend options for "pray together" (2026-09-24)

Research + local measurement pass for Meeqat's rooms/calls feature. Candidates
were checked against primary sources (GitHub API, license files, official
docs) on 2026-09-24; dates and star counts below are from that day and will
drift. Measurements were run locally in Docker/native binary on an 8-core /
16 GB Mac (not the target Coolify box), so treat absolute numbers as
directional, not a guarantee of production headroom.

## 1. Summary

**Ranking for this feature: PocketBase > TrailBase > SurrealDB > sync engines
(Zero/Electric/Triplit/PowerSync/InstantDB) > SpacetimeDB > RustBase.**
Self-hosted Convex (already running for another app) remains an option too —
see the comparison below for why a second Convex instance is not
recommended here.

Decisive reasons:

1. **Resource fit under real constraint.** The Coolify box has ~6 GB free.
   PocketBase idled at 65 MB and held 2,000 realtime SSE connections at
   154 MB (~0.04 MB/connection). TrailBase idled at 588 MB (its WASM/auth-UI
   runtime is loaded even when unused) and hit 802-810 MB at 2,000
   connections. Both are far below Convex's measured 1.35 GB at 2,000, but
   TrailBase's idle floor alone is ~7x PocketBase's and would eat a large
   slice of the free RAM before a single user connects.
2. **No candidate cleanly accepts Sanad's external RS256 JWTs out of the
   box.** All of PocketBase, TrailBase, and SurrealDB assume they mint their
   own tokens or verify OIDC-discovery-based providers. SurrealDB is the
   *only* one with documented native JWKS verification for an arbitrary
   external issuer (`DEFINE ACCESS ... TYPE JWT ... URL <jwks>`), which is
   a meaningful point in its favor despite its license and immaturity for
   this use case.
3. **License risk.** SurrealDB and SpacetimeDB are Business Source License
   1.1 (source-available, not OSI open source, with a "no DBaaS" restriction
   that doesn't affect self-hosting but is a governance risk). PocketBase
   (MIT) and TrailBase (OSL-3.0, permissive for applications built on top)
   carry less lock-in risk for a small self-hosted project.
2. **Atomicity for "one active call per room per prayer."** PocketBase's
   Go hooks run inside the same request/transaction and are the most
   battle-tested; TrailBase's SQL access-rule expressions plus STRICT
   tables and unique indexes can enforce this declaratively in SQLite
   without custom code — arguably cleaner for this one rule.
3. **Ecosystem maturity and bus factor.** PocketBase: 61k stars, MIT, single
   maintainer (Gani Georgiev) but very active, huge community, and
   widely deployed in production. TrailBase: 5.6k stars, small team,
   OSL-3.0 is uncommon and would need legal sign-off. RustBase (the
   "base/bin"-named Rust option the user recalled) exists but is a 6-star,
   4-month-old side project — not viable for production.

**Could it replace per-user settings sync later?** PocketBase's realtime
record subscriptions plus its Go/JS hook system are general enough to serve
as a lightweight settings-sync backend too (subscribe to a `user_settings`
collection filtered to `user = @request.auth.id`). TrailBase could do the
same via its record APIs. Neither is a purpose-built sync engine (no
CRDT/conflict resolution, no offline-first merge) — for that, a dedicated
sync engine (Zero, Electric, Triplit) would be a better long-term fit, but
that's more infrastructure than this feature needs today.

## 2. Comparison table

| | **PocketBase** | **TrailBase** | **SurrealDB** | **SpacetimeDB** | **RustBase** | **libSQL/sqld** |
|---|---|---|---|---|---|---|
| Language | Go | Rust | Rust | Rust | Rust | Rust/C |
| License | MIT | OSL-3.0 | BSL 1.1 → Apache-2.0 after 4y | BSL 1.1 → AGPLv3 | Apache-2.0 | MIT |
| Latest release | v0.40.4 (2026-09-12) | v0.33.22 (2026-09-23) | v3.2.4 (2026-08-17) | (rolling, active 2026-09-24) | early/unreleased-quality | active |
| Last commit | 2026-09-21 | 2026-09-24 | 2026-09-14 | 2026-09-24 | 2026-09-23 | 2026-09-16 |
| Stars (rough) | ~61,100 | ~5,600 | ~33,000 | ~25,200 | ~6 | ~17,200 |
| Single binary | Yes | Yes | Yes | Yes (server) | Yes | It's a DB engine, not a backend |
| Realtime model | SSE, per-record or per-collection subscribe via `/api/realtime` | SSE + WebSocket, per-record or `*` subscribe on a "record API" | Native live queries (`LIVE SELECT`) over WS | Reducer-based, subscription queries over WS | SSE (per docs; unverified) | N/A — not a realtime backend |
| Filtered per-user subscriptions | Yes — subscribe to `collection/id`, gated by collection rules | Yes — subscribe to `table/id` or `table/*`, gated by ACL + access rules | Yes — `LIVE SELECT ... WHERE` with record permissions | Yes — SQL-like subscription queries per client | Claimed, unverified | N/A |
| Atomic server logic | Go/JS event hooks run inside the request; also declarative API rules (SQL-like) | SQL access-rule expressions (`_USER_`/`_ROW_`/`_REQ_`) + STRICT tables/unique constraints; JS/TS via V8, WASM via Wasmtime for custom endpoints | Transactions, `DEFINE EVENT`, permissions, functions | Reducers = atomic transactions by design (this is SpacetimeDB's core model) | Hooks (unverified depth) | None (raw DB) |
| Custom external JWT/JWKS (no OIDC discovery) | Not supported for bearer auth on record APIs; OAuth2 config supports a `jwksURL` only for its own OAuth2/OIDC login *redirect* flow, not passthrough verification of arbitrary bearer JWTs. A community discussion (#2198) proposes a custom `verifyToken` hook but it isn't built in. | Not supported. Auth docs cover TrailBase's own ed25519-signed tokens and OAuth2 provider login (incl. one Apple-specific native JWKS-verification PR), not verification of arbitrary external bearer JWTs against a JWKS URL. | **Supported natively**: `DEFINE ACCESS ... TYPE JWT ... URL <jwks-url>` verifies RS256/ES256 tokens against any JWKS endpoint, no OIDC discovery document required. | Docs describe OIDC-based identity derivation and mention issues (e.g. #2600) with providers lacking discovery; JWKS-only static config is unclear/limited. | Unverified | N/A |
| Scheduled jobs / TTL | Built-in cron (`app.Cron()` in Go, `cronAdd` in JS) — good fit for "delete chat after 1h" | V8 JS runtime supports scheduled tasks (per DeepWiki; not confirmed in official docs) | `DEFINE EVENT`/timers less turnkey; typically an external cron | Reducer-based scheduled tables (`#[spacetimedb::table(scheduled = ...)]`) — native and precise | Unverified | N/A |
| Geo/distance query | **Native**: `geoPoint` field type + `geoDistance()` function usable in filters/rules (Haversine, km) | No native geo type found; would need geohash/bbox on indexed TEXT/REAL columns | Native geo types + functions | No native geo primitives found | Unverified | N/A |
| Community resource figures | Community claims 10k+ persistent connections on a $4 Hetzner VPS (2 vCPU/4 GB); official benchmarks repo covers HTTP, not realtime scale | None found beyond "sub-millisecond" API-latency marketing claims | None specific found | None specific found | None | N/A |
| Tauri/Android fit (JS SDK) | Official JS SDK (`pocketbase` npm), works in any webview; Dart SDK for Flutter | Official JS/TS SDK plus **Kotlin, Swift, Dart, Go, Python, Rust, .NET** SDKs — best multi-platform native fit | JS SDK + embeddable Rust crate + WASM-in-browser | JS/TS SDK, Rust SDK (module + client) | Unverified | N/A |
| Rust SDK | Community only | **Official** (`client/rust`) | **Official**, plus embeddable | **Official** | Unverified | N/A |

Sync engines (briefer, since they don't bring their own auth/hosting model
the same way):

| | Zero (Rocicorp) | ElectricSQL | InstantDB (self-host) | Triplit | PowerSync |
|---|---|---|---|---|---|
| Status 2026 | Reached 1.0 in 2026-06 | Active, Postgres-native shape streaming | Self-hostable, own DB | **Acquired by Supabase (Oct 2025)**; roadmap now folds into Supabase | Active, sits in front of your Postgres |
| Model | Server-authoritative reactive cache over your Postgres | Shapes stream Postgres rows to clients; you own the write path | Bring-your-own-schema realtime db | Realtime relational sync, multi-user native | Sync bucket abstraction over Postgres |
| Fit here | Overkill: needs its own sync service + your Postgres; no built-in auth/JWT-issuer story for Sanad tokens beyond passing them through to your own API | Same shape: needs Postgres logical replication, extra moving part vs. a single binary | Interesting long-term (offline-first), but heavier to stand up than needed for a v1 room feature | Uncertain roadmap post-acquisition; wouldn't bet a new feature on it in 2026 | Good if source-of-truth is already Postgres; not the case here |

All are reasonable choices *if* Meeqat later wants proper offline-first
multi-device sync (e.g. for settings or the "one-line room history"), but
none reduce the operational surface for a v1 "pray together" feature the
way PocketBase or TrailBase do — each adds a second service in front of a
database you'd still have to run.

**SpacetimeDB** (reviewed previously, included for completeness): BSL 1.1,
needs an OIDC-discovery-capable identity provider by default; Sanad's lack
of a discovery document is a real integration gap here (see GitHub issue
#2600 for a similar report against Supabase-issued JWTs). Reducer model
(atomic by construction) is attractive for the "one call per room" rule,
but the license and auth gap keep it out of the near-term running.

**libSQL/sqld/Turso**: confirmed to be a distributed SQLite engine, not a
realtime backend — no subscriptions, auth, or hooks layer. Only relevant as
a possible storage layer under something else; not evaluated further.

**Other Rust "base/bin"-named projects found**: `pjonaszik/rustbase` — "a
multi-tenant Backend-as-a-Service in Rust — realms, apps, collections,
auth, hooks, files, realtime, dashboard." 6 stars, created 2026-05, last
push 2026-09-23, Apache-2.0. Matches the shape the user was recalling, but
it's too new/unproven (no releases checked, essentially unused) to be a
real candidate today — flagged for awareness only.

## 3. Measurements

Method: Docker (TrailBase, official `trailbase/trailbase:latest` image;
PocketBase compiled into a minimal Alpine image from the official Linux
binary release, since PocketBase ships no official Docker image) on an
8-core / 16 GB macOS host via OrbStack, `ulimit -n 10240`. Schema: `rooms`
(200 rows), `calls` (200 rows, one active call per room), `messages`. Node
22 script used the platform's global `fetch` to open long-lived SSE
connections (`ReadableStream` reader loop) rather than raw WebSocket, since
both backends' realtime protocol is SSE-based, not WebSocket. Each of the N
subscribers was bound to one of the 200 call records round-robin (≈10
per call at N=2,000, mirroring the Convex baseline's 200 rooms × 10
members). RSS reported via `docker stats` (single sample per step, not
averaged). Container restarted between each N to get a clean measurement
rather than a cumulative ramp.

| Backend | Idle (schema loaded, no data) | 250 conns | 500 conns | 1,000 conns | 2,000 conns | Idle CPU @ 2,000 | Burst (200 call updates + 1,600 message inserts, ~90s wall time) |
|---|---|---|---|---|---|---|---|
| **Convex baseline** (from prior measurement) | 85-100 MB | ~480 MB | — | ~850 MB | ~1.35 GB | 15-30% of a core | not re-run here |
| **PocketBase** v0.40.4 | 65 MB | 77 MB | 98 MB | 105 MB | 154 MB | ~0% (0.00-0.06% reported) | CPU 25-49% of a core during burst; RSS rose to ~180-233 MB then settled ~226 MB; **all 200 call-update events delivered to their 200 dedicated listeners** |
| **TrailBase** v0.33.22 | 588 MB | 737 MB | 694 MB | 772 MB | 802-810 MB | ~0% at steady state (brief 4-6% blips) | CPU 8-18% of a core during burst; RSS stayed ~793-810 MB; **all 200 call-update events delivered** |
| **SurrealDB** | not measured | — | — | — | — | — | not measured |

Per-connection marginal memory (idle → 2,000, roughly): PocketBase ≈
0.045 MB/connection; TrailBase ≈ 0.11 MB/connection (802 MB − 588 MB over
2,000). Both are well below Convex's ~0.5 MB/connection you measured
previously, but TrailBase's ~588 MB idle floor (driven by its bundled
Wasmtime runtime + precompiled admin/auth-UI WASM component, observed
compiling twice per container start in the logs) would consume roughly a
third of the box's ~6 GB free before any user shows up, and doesn't
directly compare to Convex's leaner idle number.

**Why the 500-connection TrailBase RSS (694 MB) is lower than the
250-connection sample (737 MB):** each step restarted the container fresh
and RSS includes JIT/allocator noise from the WASM component being
recompiled at boot; treat these numbers as ±50 MB noise, not exact.

**SurrealDB was not measured** — deprioritized after the survey stage
because (a) it needs a distinct schema/query paradigm (SurrealQL, live
queries) that would require a larger prototype than the tiny record-CRUD
shape used for PocketBase/TrailBase, and (b) its BSL license already
excluded it from the top-2 "realistic candidates" the task asked to
benchmark; time was spent instead on deeper auth/geo verification for it.
If it becomes a real contender, it deserves its own measurement pass.

**Caveats on all numbers above:**
- Run on a Mac dev machine via OrbStack, not the actual 8-core/15.6 GB
  Coolify Linux box; absolute numbers will differ, especially CPU.
- Single-sample `docker stats` reads, not averaged/percentile.
- SSE (not WebSocket) drivers were used for both — this matches each
  product's actual realtime transport, so it's a fair comparison to each
  other, but not identical wire mechanics to Convex's own protocol.
- No sustained soak test (memory-not-returned-after-disconnect, which the
  Convex baseline flagged, was not checked for PocketBase/TrailBase due to
  time).
- Burst target was "~60s"; actual wall time was ~90-95s because the
  Node script's per-write delay accounted for HTTP round-trip time on top
  of the requested spacing — the reported CPU/RSS trends are still valid,
  the timing is just looser than specified.

## 4. Auth integration notes

**Sanad currently issues**: RS256 JWTs, `iss: https://auth.sanad.ink`,
`aud: "convex"`, 15-min expiry, JWKS at
`https://auth.sanad.ink/api/auth/jwks`, **no** `.well-known/openid-configuration`
(confirmed by grepping the `sanad-auth` repo locally — no discovery route,
and `src/auth.ts` configures the better-auth `jwt` plugin with `jwt.issuer`
and `jwt.audience` but no discovery endpoint).

**PocketBase**: No first-class way to accept an externally-issued bearer
JWT as an authenticated record-API caller. Two realistic paths: (1) fork
and add a custom Go middleware that verifies the Sanad JWT (via JWKS,
using any Go JWT library) and maps `sub` to a PocketBase user record before
the request reaches PocketBase's router — requires running PocketBase as a
Go framework (`pocketbase.New()` + custom middleware), not the prebuilt
binary; (2) put a tiny reverse-proxy/edge function in front that verifies
the Sanad JWT and re-mints a short-lived PocketBase auth token via the
admin API on each session start. Both are extra code to write and
maintain; neither is "drop in the JWKS URL."

**TrailBase**: Similarly no built-in verification of arbitrary external
bearer JWTs for its record APIs — its access-rule SQL expressions
(`_USER_`) rely on TrailBase's own session, populated via its own
auth/OAuth2 login flows. The closest built-in mechanism is the WASM
runtime: a custom WASM (or V8/JS) endpoint could implement JWKS
verification of the Sanad token and issue a TrailBase session, similar to
the PocketBase edge-function approach. No changes to `sanad-auth` would be
required either way, since verification happens on the backend-in-a-box
side.

**If SurrealDB were chosen instead**: `DEFINE ACCESS user_access ON
DATABASE TYPE JWT URL "https://auth.sanad.ink/api/auth/jwks" AUTHENTICATE {
...}` should work directly against Sanad's existing JWKS endpoint with
**no discovery document needed** and no `sanad-auth` changes — this is the
one candidate where the described JWT setup is a documented, native fit.
This is a meaningful enough advantage that if SurrealDB's license and
learning curve turn out acceptable, it deserves the deeper measurement
pass this report couldn't complete.

**No changes to `sanad-auth` are required for any candidate purely to
support this integration** — the gap is entirely on the backend-in-a-box
side (accepting/verifying the token), not in what Sanad issues.

## 5. Risks

- **Bus factor.** PocketBase is essentially a single-maintainer project
  (very active, but a key-person risk); TrailBase is a small team; both
  are far more exposed than Convex's PostgreSQL/managed-team pedigree.
- **License friction.** OSL-3.0 (TrailBase) is unusual and has a
  broader "derivative work" copyleft trigger than MIT/Apache — worth a
  quick legal read before committing, even though the vendor's own FAQ
  claims applications built on top aren't covered. BSL 1.1 (SurrealDB,
  SpacetimeDB) is not OSI open source and bars offering the software
  as a hosted service to third parties — irrelevant for pure self-hosting
  but a real constraint if the roadmap ever includes reselling access.
- **Maturity of realtime at scale.** Neither PocketBase's nor TrailBase's
  realtime layer has been measured here beyond 2,000 connections or beyond
  a single ~90s burst; production prayer-time spikes (many rooms opening
  near-simultaneously at prayer time) weren't modeled beyond the one burst
  test run.
- **Data migration.** Both use SQLite as their embedded store — file-level
  backup (litestream, sqlite backup API, or the products' own backup
  commands, e.g. TrailBase's `trail backups`) is straightforward, but
  neither has been tested here for restore correctness or point-in-time
  recovery.
- **TrailBase idle footprint.** The ~588 MB static Wasmtime/WASM overhead
  measured here is a real cost on a box with ~6 GB free, especially
  once the existing Convex instance's footprint (up to ~1.35 GB observed
  at 2,000 of its own connections) is added back in.
- **Auth gap is unverified against real production traffic.** The
  proposed JWKS-verification approaches for PocketBase/TrailBase (custom
  middleware or WASM endpoint) are architecturally sound based on the
  docs read, but neither was actually built and load-tested here — this
  is the single biggest remaining unknown before committing to either.

## 6. Sources

- [trailbaseio/trailbase (GitHub)](https://github.com/trailbaseio/trailbase)
- [TrailBase releases](https://github.com/trailbaseio/trailbase/releases)
- [TrailBase auth docs](https://trailbase.io/documentation/auth/)
- [TrailBase config.proto](https://raw.githubusercontent.com/trailbaseio/trailbase/main/crates/core/proto/config.proto)
- [TrailBase subscribe.ts example](https://github.com/trailbaseio/trailbase/blob/main/docs/examples/record_api_ts/src/subscribe.ts)
- [TrailBase native Apple sign-in PR #286 (JWKS usage example)](https://github.com/trailbaseio/trailbase/pull/286)
- [pocketbase/pocketbase (GitHub)](https://github.com/pocketbase/pocketbase)
- [PocketBase releases](https://github.com/pocketbase/pocketbase/releases)
- [PocketBase realtime API docs](https://pocketbase.io/docs/api-realtime/)
- [PocketBase Go jobs scheduling docs](https://pocketbase.io/docs/go-jobs-scheduling/)
- [PocketBase GeoPointField JSVM reference](https://pocketbase.io/jsvm/classes/GeoPointField.html)
- [PocketBase custom JWT discussion #2198](https://github.com/pocketbase/pocketbase/discussions/2198)
- [PocketBase custom OAuth2 provider discussion #6016](https://github.com/pocketbase/pocketbase/discussions/6016)
- [surrealdb/surrealdb (GitHub)](https://github.com/surrealdb/surrealdb)
- [SurrealDB LICENSE (BSL 1.1)](https://raw.githubusercontent.com/surrealdb/surrealdb/main/LICENSE)
- [SurrealDB DEFINE ACCESS ... TYPE JWT docs](https://surrealdb.com/docs/surrealql/statements/define/access/jwt)
- [SurrealDB tokens & JWTs docs](https://surrealdb.com/docs/learn/security/authorization/tokens-and-jwts)
- [SurrealDB open source page](https://surrealdb.com/opensource)
- [clockworklabs/SpacetimeDB (GitHub)](https://github.com/clockworklabs/spacetimedb)
- [SpacetimeDB FAQ](https://spacetimedb.com/docs/intro/faq/)
- [SpacetimeDB auth claims/OIDC docs](https://spacetimedb.com/docs/1.12.0/core-concepts/authentication/usage/)
- [SpacetimeDB issue #2600 (OIDC discovery gap with Supabase JWTs)](https://github.com/clockworklabs/SpacetimeDB/issues/2600)
- [tursodatabase/libsql (GitHub)](https://github.com/tursodatabase/libsql)
- [pjonaszik/rustbase (GitHub)](https://github.com/pjonaszik/rustbase)
- [Zero 1.0 announcement (InfoQ)](https://www.infoq.com/news/2026/06/zero-version-1/)
- [Sync engine comparison (Strata Sync guides)](https://blode.co/stratasync/guides/sync-engine-comparison)
- Local: `/Users/yousseifelshahawy/coding/personal/sanad-auth/src/auth.ts` (jwt plugin config, confirms no discovery endpoint)
- Local measurement scripts/output (this session): Docker `trailbase/trailbase:latest`, PocketBase v0.40.4 Linux binary in a minimal Alpine image, Node 22 `fetch`-based SSE load scripts — not preserved (deleted per task instructions).
