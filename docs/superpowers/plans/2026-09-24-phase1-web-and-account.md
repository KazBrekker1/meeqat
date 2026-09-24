# Phase 1 — Meeqat on the web + Sanad account (web) Implementation Plan

> **Decisions (owner):** sign-in = Google + passkeys; go live automatically after local checks pass.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the existing Meeqat Nuxt app at https://meeqat.sanad.ink with optional Sanad sign-in (web only) and a privacy page, behind one platform module that replaces the scattered "am I in Tauri?" checks.

**Architecture:** The same Nuxt app (`ssr: false`) gains a third build target: `nuxt generate` → static files in a Caddy container on Coolify. A new `app/utils/platform.ts` decides once whether we run on web/desktop/android/ios; every existing check goes through it. Sign-in uses the better-auth client against auth.sanad.ink with `credentials: "include"` (meeqat.sanad.ink is a `.sanad.ink` subdomain, so the shared session cookie applies); a small token cache hands out short-lived Sanad JWTs for later phases.

**Tech Stack:** Nuxt 4, Vue 3, @nuxt/ui 4, better-auth client 1.7 + passkey plugin, Playwright (one smoke test), Caddy 2, Docker, Coolify, GitHub Actions.

**Testing policy (owner's call):** no unit-test suite; verify with `bunx nuxi typecheck`, a quick manual run, and the single web smoke test (Task 10).

Spec: `docs/superpowers/specs/2026-09-24-pray-together-design.md` (§3.1, §3.2, §3.4 web, §3.5, §5).

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `app/utils/platform.ts` | create | `detectPlatform()` (pure) + `getPlatform()` (cached) |
| `app/utils/sanadToken.ts` | create | `jwtExpiry()` + `createTokenCache()` (pure) |
| `app/composables/useAccount.ts` | create | Sanad session, Google sign-in/out, `getToken()` |
| `app/pages/privacy.vue` | create | plain-language privacy page |
| `app/app.vue`, `app/plugins/tray.client.ts`, `app/composables/useNotifications.ts`, `app/composables/useGeolocation.ts`, `app/composables/usePrayerService.ts`, `app/composables/useAppUpdate.ts`, `app/components/prayer/SettingsModal.vue`, `app/utils/store.ts`, `app/pages/tray.vue` | modify | use `getPlatform()` |
| `app/components/prayer/SettingsModal.vue` | modify | Account section (web) |
| `app/pages/index.vue` | modify | footer link to /privacy |
| `nuxt.config.ts` | modify | `runtimeConfig.public.authUrl` |
| `Dockerfile.web`, `Caddyfile.web`, `.dockerignore` | create | web image |
| `tests/e2e/web-smoke.mjs` | create | Playwright smoke test against the web image |
| `.github/workflows/release.yml` | modify | don't rebuild an existing release on ordinary pushes |
| `package.json` | modify | `test:e2e` script; deps |
| `sanad-auth/.env.example` (other repo) | modify | document the new trusted origin |

---

### Task 2: Platform module

**Files:**
- Create: `app/utils/platform.ts`

- [ ] **Step 1: Implement `app/utils/platform.ts`**

```ts
import { platform as osPlatform } from "@tauri-apps/plugin-os";

/** Where Meeqat is running: the web build, or one of the Tauri shells. */
export type PlatformKind = "web" | "desktop" | "android" | "ios";

interface TauriGlobals {
  __TAURI__?: { core?: { invoke?: unknown } };
  __TAURI_INTERNALS__?: { invoke?: unknown };
}

/** Pure decision, so it can be tested without a browser or Tauri. */
export function detectPlatform(win: TauriGlobals | undefined, os: () => string): PlatformKind {
  const inTauri = Boolean(win?.__TAURI__?.core?.invoke || win?.__TAURI_INTERNALS__?.invoke);
  if (!inTauri) return "web";
  try {
    const name = os();
    if (name === "android") return "android";
    if (name === "ios") return "ios";
    return "desktop";
  } catch {
    return "web";
  }
}

let cached: PlatformKind | null = null;

/** Decided once per page load; every platform branch in the app goes through this. */
export function getPlatform(): PlatformKind {
  if (cached) return cached;
  if (typeof window === "undefined") return "web"; // never cache a server-side answer
  cached = detectPlatform(window as TauriGlobals, osPlatform);
  return cached;
}

/** True inside any Tauri shell (desktop, Android, iOS). */
export function isNative(): boolean {
  return getPlatform() !== "web";
}
```

- [ ] **Step 2: Commit**

```bash
git add app/utils/platform.ts
git commit -m "feat(platform): one place that decides web/desktop/android/ios"
```

---

### Task 3: Route every platform check through `getPlatform()`

**Files (modify):** `app/utils/store.ts`, `app/app.vue`, `app/plugins/tray.client.ts`, `app/composables/useNotifications.ts`, `app/composables/useGeolocation.ts`, `app/composables/usePrayerService.ts`, `app/composables/useAppUpdate.ts`, `app/components/prayer/SettingsModal.vue`

- [ ] **Step 1: `app/utils/store.ts`** — keep the exported name (other code imports it) but delegate:

Replace the whole `interface TauriWindow … isTauriAvailable()` block (lines 4–13) with:

```ts
import { isNative } from "@/utils/platform";

/** Kept for existing imports; prefer getPlatform()/isNative() in new code. */
export function isTauriAvailable(): boolean {
  return isNative();
}
```

- [ ] **Step 2: `app/app.vue`** — replace the two imports and the check:

```ts
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getPlatform } from "@/utils/platform";

const route = useRoute();

onMounted(async () => {
  // Skip close handler for tray window
  if (route.path === '/tray') return;
  // Desktop only: hide-on-close keeps the app alive in the tray. On the web there's no
  // native window, and on mobile hiding the sole window would trap the user.
  if (getPlatform() !== "desktop") return;
```

(The rest of `onMounted` — `getCurrentWindow()` … — stays as it is. Delete the old `const currentPlatform = platform();` and its `if` line.)

- [ ] **Step 3: `app/plugins/tray.client.ts`** — replace lines 4–5 and 14–16:

```ts
import { getPlatform } from "@/utils/platform";
```
```ts
  if (import.meta.server || getPlatform() !== "desktop") return;
```
(Delete the `const os = platform();` line and the `if (os === "android" || os === "ios") return;` line.)

- [ ] **Step 4: `app/composables/useNotifications.ts`** — replace the `platform`/`isTauriAvailable` imports with `import { getPlatform } from "@/utils/platform";` and the helper body:

```ts
function usesRustScheduler(): boolean {
  return getPlatform() === "desktop";
}
```

- [ ] **Step 5: `app/composables/useGeolocation.ts`** — replace the two imports with `import { getPlatform } from "@/utils/platform";` and:

```ts
  function hasWebGeolocation(): boolean {
    if (!navigator.geolocation) return false;
    // Desktop webviews have no geolocation delegate (it only times out).
    return getPlatform() !== "desktop";
  }
```

- [ ] **Step 6: `app/composables/usePrayerService.ts`** — replace `isAndroidPlatform()` with:

```ts
async function isAndroidPlatform(): Promise<boolean> {
  return getPlatform() === "android";
}
```
and add `import { getPlatform } from "@/utils/platform";` at the top.

- [ ] **Step 7: `app/composables/useAppUpdate.ts`**
  - Replace imports `platform` and `isTauriAvailable` with `import { getPlatform } from "@/utils/platform";`
  - Replace the `updatePlatform` computed:

```ts
const updatePlatform = computed<UpdatePlatform>(() => {
  if (simScenario()) return simScenario() === "android" || simScenario() === "permission" ? "android" : "desktop";
  return getPlatform();
});
```
  - In `checkForUpdate`: `if (!sim && getPlatform() === "web") return; // browser: updates come from deploys`
  - In `downloadAndInstall`: `if ((!sim && getPlatform() === "web") || isBusy.value) return;`
  - In `simScenario`: `if (!import.meta.dev || typeof window === "undefined" || getPlatform() !== "web") return null;`

- [ ] **Step 8: `app/components/prayer/SettingsModal.vue`** — in `onMounted`, replace the try/import block:

```ts
onMounted(async () => {
  isAndroid.value = getPlatform() === 'android';
  if (isAndroid.value) {
    await checkPermissions();
    await loadOffset();
  }
```
and add `import { getPlatform } from '@/utils/platform';` in the `<script setup>` imports. (Keep whatever followed the old `try { … } catch {}` in `onMounted`.)

- [ ] **Step 9: Confirm nothing else calls the OS plugin directly**

Run: `grep -rn "plugin-os" app | grep -v "app/utils/platform.ts"`
Expected: no output.

- [ ] **Step 10: Typecheck and unit tests**

Run: `bunx nuxi typecheck`
Expected: exit 0.

- [ ] **Step 11: Manual check in the desktop app**

Run: `bun tauri dev`, then confirm: tray icon + popover open; closing the main window hides it (doesn't quit); Settings → Updates shows "Check for updates".
Expected: all three behave as before.

- [ ] **Step 12: Commit**

```bash
git add app/
git commit -m "refactor(platform): route every platform check through getPlatform()"
```

---

### Task 4: Keep desktop-only routes off the web

**Files:** Modify `app/pages/tray.vue` (top of `<script setup>`)

- [ ] **Step 1: Redirect `/tray` when not on desktop**

Add as the first statements after the imports in `app/pages/tray.vue`:

```ts
import { getPlatform } from "@/utils/platform";

// The tray popover only exists in the desktop app; on the web /tray would call
// Tauri APIs that aren't there.
if (getPlatform() !== "desktop") await navigateTo("/", { replace: true });
```

- [ ] **Step 2: Verify in a browser**

Run: `bun run dev`, open http://localhost:3001/tray
Expected: lands on `/` with no console errors about `__TAURI_INTERNALS__`.

- [ ] **Step 3: Commit**

```bash
git add app/pages/tray.vue
git commit -m "fix(web): /tray redirects home outside the desktop app"
```

---

### Task 5: Sanad JWT helpers

**Files:**
- Create: `app/utils/sanadToken.ts`

- [ ] **Step 1: Implement `app/utils/sanadToken.ts`**

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add app/utils/sanadToken.ts
git commit -m "feat(account): cache short-lived Sanad JWTs"
```

---

### Task 6: Account composable (web sign-in)

**Files:**
- Modify: `nuxt.config.ts` (`runtimeConfig.public`), `package.json`
- Create: `app/composables/useAccount.ts`

- [ ] **Step 1: Install the better-auth client + passkey plugin** (sanad-auth runs better-auth 1.7.2 and @better-auth/passkey 1.7.2)

Run: `bun add better-auth@^1.7 @better-auth/passkey@^1.7`

- [ ] **Step 2: Add the auth URL to `nuxt.config.ts`**

```ts
  runtimeConfig: {
    public: {
      version: pkg.version,
      // Central Sanad auth. Static build: baked in at `nuxt generate` time;
      // override with NUXT_PUBLIC_AUTH_URL for local dev (see Task 11).
      authUrl: process.env.NUXT_PUBLIC_AUTH_URL || "https://auth.sanad.ink",
    },
  },
```

- [ ] **Step 3: Create `app/composables/useAccount.ts`**

```ts
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
    await authClient(authUrl).signIn.social({
      provider: "google",
      callbackURL: window.location.origin + window.location.pathname,
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
```

- [ ] **Step 4: Typecheck**

Run: `bunx nuxi typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add nuxt.config.ts package.json bun.lock app/composables/useAccount.ts
git commit -m "feat(account): Sanad sign-in on the web via the shared cookie"
```

---

### Task 7: Account section in Settings (web)

**Files:** Modify `app/components/prayer/SettingsModal.vue`

- [ ] **Step 1: Wire the composable in `<script setup>`** (after the other composable calls)

```ts
const {
  user: accountUser,
  status: accountStatus,
  supported: accountSupported,
  refresh: refreshAccount,
  signInWithGoogle,
  signInWithPasskey,
  signOut: signOutAccount,
} = useAccount();
const passkeyFailed = ref(false);
async function onPasskey() {
  passkeyFailed.value = !(await signInWithPasskey());
}

watch(isOpen, (open) => {
  if (open) void refreshAccount();
});
```

- [ ] **Step 2: Add the section immediately above `<!-- Updates Section -->`**

```vue
        <!-- Account (web for now; desktop/Android sign-in comes with Pray Together) -->
        <section v-if="accountSupported">
          <p class="text-[11px] uppercase tracking-wider text-muted mb-1.5">Account</p>
          <div class="rounded-xl bg-elevated border border-default px-4 py-3 flex items-center justify-between gap-3">
            <template v-if="accountStatus === 'signed-in' && accountUser">
              <div class="flex items-center gap-3 min-w-0">
                <UAvatar :src="accountUser.image ?? undefined" :alt="accountUser.name" size="sm" />
                <div class="min-w-0">
                  <p class="text-sm font-medium truncate">{{ accountUser.name }}</p>
                  <p class="text-xs text-muted truncate">{{ accountUser.email }}</p>
                </div>
              </div>
              <UButton size="sm" variant="soft" color="neutral" @click="signOutAccount">Sign out</UButton>
            </template>
            <template v-else>
              <div class="min-w-0">
                <p class="text-sm font-medium">Sanad account</p>
                <p class="text-xs text-muted">Optional. You'll need it for Pray Together.</p>
              </div>
              <div class="flex flex-col items-end gap-1.5 shrink-0">
                <UButton
                  size="sm"
                  color="primary"
                  icon="i-lucide-log-in"
                  :loading="accountStatus === 'unknown'"
                  @click="signInWithGoogle"
                >
                  Sign in with Google
                </UButton>
                <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-key-round" @click="onPasskey">
                  Use a passkey
                </UButton>
              </div>
            </template>
          </div>
          <p v-if="passkeyFailed" class="mt-1.5 text-xs text-error">
            No passkey signed in. Passkeys come from another Sanad app; use Google if you haven't set one up.
          </p>
          <p class="mt-1.5 text-xs text-muted">
            Prayer times and reminders never need an account. <NuxtLink to="/privacy" class="underline">What's stored</NuxtLink>
          </p>
        </section>
```

- [ ] **Step 3: Hide the Updates section on the web** (the site updates itself on deploy)

Change the Updates section's opening tag from `<section>` to:
```vue
        <section v-if="updatePlatform !== 'web'">
```
(`updatePlatform` is already destructured from `useAppUpdate()` in this component.)

- [ ] **Step 4: Typecheck**

Run: `bunx nuxi typecheck`
Expected: exit 0.

- [ ] **Step 5: Check both platforms**

Run: `bun run dev`, open http://localhost:3001, Settings.
Expected (web): "Account" section with "Sign in with Google" (spinner briefly while the session loads, then idle — the local dev origin has no Sanad cookie); no Updates section.
Run: `bun tauri dev`, Settings.
Expected (desktop): no Account section; Updates section still present.

- [ ] **Step 6: Commit**

```bash
git add app/components/prayer/SettingsModal.vue
git commit -m "feat(account): Account section in Settings on the web"
```

---

### Task 8: Privacy page

**Files:**
- Create: `app/pages/privacy.vue`
- Modify: `app/pages/index.vue` (footer)

- [ ] **Step 1: Create `app/pages/privacy.vue`**

```vue
<template>
  <div class="min-h-screen overflow-y-auto bg-[#0a0e22] text-white">
    <main class="mx-auto max-w-2xl px-5 py-10 space-y-8">
      <NuxtLink to="/" class="text-sm text-white/60 hover:text-white">← Back to Meeqat</NuxtLink>
      <header>
        <h1 class="text-2xl font-semibold">What Meeqat stores and sends</h1>
        <p class="mt-2 text-white/70">Meeqat has no ads, no analytics and no tracking. This page lists every place your data goes.</p>
      </header>

      <section class="space-y-2">
        <h2 class="text-lg font-semibold">On your device only</h2>
        <ul class="list-disc ps-5 space-y-1 text-white/80">
          <li>Your settings, favourite places and cached prayer times.</li>
          <li>Reminders are scheduled on your device, not on a server.</li>
        </ul>
      </section>

      <section class="space-y-2">
        <h2 class="text-lg font-semibold">Services Meeqat talks to</h2>
        <ul class="list-disc ps-5 space-y-1 text-white/80">
          <li><b>AlAdhan</b> (api.aladhan.com) calculates prayer times. It receives the city, or the coordinates you chose.</li>
          <li><b>"Use my location"</b>: your phone's location stays on the phone; on desktop, <b>GeoJS</b> (get.geojs.io) estimates a city from your IP address.</li>
          <li><b>Place search</b>: what you type goes to <b>Photon</b> (photon.komoot.io, OpenStreetMap). Naming a spot picked on the map uses <b>Nominatim</b> (OpenStreetMap).</li>
          <li><b>Maps</b> load tiles from <b>CARTO</b>.</li>
          <li><b>Updates</b> (apps only) are checked against Meeqat's GitHub releases.</li>
        </ul>
      </section>

      <section class="space-y-2">
        <h2 class="text-lg font-semibold">If you sign in (optional)</h2>
        <p class="text-white/80">Sign-in uses your <b>Sanad</b> account (auth.sanad.ink), shared with other Sanad apps, with Google or a passkey. It holds your name, email and profile picture. Meeqat doesn't send your location, prayer times or settings to Sanad.</p>
      </section>

      <section class="space-y-2">
        <h2 class="text-lg font-semibold">Pray Together (coming soon)</h2>
        <p class="text-white/80">When it launches, it will store only: the rooms you join and your role, calls you start or join, and your votes. Chat messages are deleted one hour after each call. Your location is never stored; rooms that choose to be discoverable store a location rounded to about 100 metres.</p>
      </section>

      <p class="text-sm text-white/50">Questions? Open an issue on <a class="underline" href="https://github.com/KazBrekker1/meeqat/issues">GitHub</a>.</p>
    </main>
  </div>
</template>

<script setup lang="ts">
useHead({ title: "Privacy · Meeqat", htmlAttrs: { class: "dark" } });
</script>
```

- [ ] **Step 2: Link it from the home footer** — in `app/pages/index.vue`, inside `<footer …>` right after `<span>Meeqat v{{ appVersion }}</span>`:

```vue
          <NuxtLink to="/privacy" class="hover:text-white/60">Privacy</NuxtLink>
```

- [ ] **Step 3: Check it renders**

Run: `bun run dev`, open http://localhost:3001/privacy
Expected: page renders and scrolls; "← Back to Meeqat" returns home; footer on `/` shows "Privacy".

- [ ] **Step 4: Commit**

```bash
git add app/pages/privacy.vue app/pages/index.vue
git commit -m "feat(web): privacy page listing every service Meeqat talks to"
```

---

### Task 9: Web container image

**Files:** Create `Dockerfile.web`, `Caddyfile.web`, `.dockerignore`

- [ ] **Step 1: Create `.dockerignore`**

```
node_modules
.nuxt
.output
dist
src-tauri/target
src-tauri/gen
tools
design
docs
.git
```

- [ ] **Step 2: Create `Caddyfile.web`**

```
:80 {
	root * /srv
	encode zstd gzip
	@assets path /_nuxt/*
	header @assets Cache-Control "public, max-age=31536000, immutable"
	header / Cache-Control "no-cache"
	# SPA: unknown paths (/rooms, /r/<code>, /privacy …) fall back to the app shell.
	try_files {path} {path}/ /200.html /index.html
	file_server
}
```

- [ ] **Step 3: Create `Dockerfile.web`**

```dockerfile
# Meeqat web (meeqat.sanad.ink): the same Nuxt app as the desktop/Android shells,
# generated as static files and served by Caddy.
FROM oven/bun:1-slim AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY . .
ARG NUXT_PUBLIC_AUTH_URL=https://auth.sanad.ink
ENV NUXT_PUBLIC_AUTH_URL=$NUXT_PUBLIC_AUTH_URL
RUN bunx nuxi prepare && bun run generate

FROM caddy:2-alpine
COPY Caddyfile.web /etc/caddy/Caddyfile
COPY --from=build /app/.output/public /srv
EXPOSE 80
```

- [ ] **Step 4: Build and run it locally**

Run:
```bash
docker build -f Dockerfile.web -t meeqat-web .
docker run --rm -d -p 8088:80 --name meeqat-web meeqat-web
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8088/
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8088/privacy
```
Expected: `200` and `200`.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile.web Caddyfile.web .dockerignore
git commit -m "build(web): static Nuxt build served by Caddy"
```

---

### Task 10: Web smoke test

**Files:** Create `tests/e2e/web-smoke.mjs`; modify `package.json`

- [ ] **Step 1: Install Playwright and add the script**

Run: `bun add -d playwright && bunx playwright install chromium`

Add to `package.json` `"scripts"`: `"test:e2e": "node tests/e2e/web-smoke.mjs"`

- [ ] **Step 2: Create `tests/e2e/web-smoke.mjs`**

```js
// Smoke test for the web build. Run the image first (Task 9, Step 4), then:
//   WEB_URL=http://localhost:8088 bun run test:e2e
import { chromium } from "playwright";

const base = process.env.WEB_URL ?? "http://localhost:8088";
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 900 } });
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && /tauri/i.test(m.text()) && errors.push(m.text()));

function check(ok, label) {
  console.log(`${ok ? "✔" : "✘"} ${label}`);
  if (!ok) process.exitCode = 1;
}

await page.goto(base);
await page.waitForTimeout(3000);
check(await page.getByRole("button", { name: "Open settings" }).isVisible(), "home renders");

await page.getByRole("button", { name: "Open settings" }).click();
await page.waitForTimeout(1000);
check(await page.getByText("Sanad account").isVisible(), "Account section shown on the web");
check(!(await page.getByText("Check for updates").isVisible()), "no in-app updater on the web");
await page.keyboard.press("Escape");

await page.goto(`${base}/tray`);
await page.waitForTimeout(1500);
check(new URL(page.url()).pathname === "/", "/tray redirects home on the web");

await page.goto(`${base}/privacy`);
check(await page.getByRole("heading", { name: "What Meeqat stores and sends" }).isVisible(), "privacy page renders");

check(errors.length === 0, `no Tauri/page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
await browser.close();
```

- [ ] **Step 3: Run it against the local image**

Run: `WEB_URL=http://localhost:8088 bun run test:e2e`
Expected: five ✔ lines, exit 0.

- [ ] **Step 4: Stop the container and commit**

```bash
docker stop meeqat-web
git add tests/e2e/web-smoke.mjs package.json bun.lock
git commit -m "test(web): Playwright smoke test for the web build"
```

---

### Task 11: Don't rebuild existing releases on ordinary pushes

Pushing web changes to `main` currently re-runs the whole desktop/Android release for the
current version (and re-uploads its assets). Only a version bump should release.

**Files:** Modify `.github/workflows/release.yml`

- [ ] **Step 1: Expose a `skip` output from `create-release`**

In the `create-release` job's `outputs:` add:
```yaml
      skip: ${{ steps.meta.outputs.skip }}
```

In the "Ensure GitHub release exists" step, replace the existing-release branch:
```yaml
          if gh release view "$TAG" >/dev/null 2>&1; then
            echo "Release $TAG already exists"
            # A push that doesn't bump the version must not rebuild and re-upload an
            # existing release. To re-run a failed release, use "Run workflow".
            if [ "${{ github.event_name }}" = "push" ]; then
              echo "skip=true" >> "$GITHUB_OUTPUT"
            fi
            exit 0
          fi
```

- [ ] **Step 2: Gate the publish jobs**

Add to both `publish-desktop:` and `publish-android:` (next to their `needs: create-release`):
```yaml
    if: needs.create-release.outputs.skip != 'true'
```
(`updater-manifest` needs `publish-desktop`, so it is skipped automatically.)

- [ ] **Step 3: Validate the YAML**

Run: `bunx --bun yaml-lint .github/workflows/release.yml || python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/release.yml')); print('ok')"`
Expected: `ok` (or lint passes).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: only release when the version changes"
```

---

### Task 12: Local development against Sanad

Cookies from auth.sanad.ink never reach `localhost`, so web sign-in needs a local auth service.

**Files:** none in meeqat (instructions only). In `sanad-auth`: modify `.env.example`.

- [ ] **Step 1: Run sanad-auth locally** (in `~/coding/personal/sanad-auth`)

```bash
cp .env.example .env   # first time only
# add the Meeqat dev origin to TRUSTED_ORIGINS in .env:
#   TRUSTED_ORIGINS=http://localhost:3001,http://localhost:3000,https://auth.sanad.ink
docker compose -f docker-compose.dev.yml up -d
bun run dev             # listens on :3005
```

- [ ] **Step 2: Point Meeqat at it**

Run (in meeqat): `NUXT_PUBLIC_AUTH_URL=http://localhost:3005 bun run dev`
Expected: Settings → Account → "Sign in with Google" goes through Google and returns signed in, showing your name and email.

- [ ] **Step 3: Document the production origin** — in `sanad-auth/.env.example`, change the `TRUSTED_ORIGINS` line to:

```
TRUSTED_ORIGINS=https://hojjah.sanad.ink,https://meeqat.sanad.ink,https://auth.sanad.ink,http://localhost:3000,http://localhost:3001
```

- [ ] **Step 4: Commit (sanad-auth repo)**

```bash
cd ~/coding/personal/sanad-auth
git add .env.example
git commit -m "docs: meeqat.sanad.ink is a trusted origin"
```

---

### Task 13: Deploy meeqat.sanad.ink

Outward-facing: do these with the owner's go-ahead.

- [ ] **Step 1: Trust the new origin in production Sanad**

In Coolify → Commons → sanad-auth (app `jtdugil4qzuoswynjbzjh21n`) → Environment Variables: append `,https://meeqat.sanad.ink` to `TRUSTED_ORIGINS`. Redeploy.
Verify:
```bash
curl -s -o /dev/null -D - -X OPTIONS https://auth.sanad.ink/api/auth/get-session \
  -H "Origin: https://meeqat.sanad.ink" -H "Access-Control-Request-Method: GET" | grep -i access-control-allow-origin
```
Expected: `access-control-allow-origin: https://meeqat.sanad.ink`

- [ ] **Step 2: DNS**

Run: `dig +short meeqat.sanad.ink`
Expected: the Coolify server's IP (covered by the `*.sanad.ink` record if one exists; otherwise add an A record).

- [ ] **Step 3: Create the Coolify app**

Coolify → + New Resource → Private GitHub App → `KazBrekker1/meeqat`, branch `main`, build pack **Dockerfile**, Dockerfile location `/Dockerfile.web`, port **80**, domain `https://meeqat.sanad.ink`, auto-deploy on push. Deploy.

- [ ] **Step 4: Push and verify**

```bash
cd meeqat && git push origin main
```
Wait for the Coolify deploy, then:
```bash
WEB_URL=https://meeqat.sanad.ink bun run test:e2e
```
Expected: five ✔ lines. Also confirm the GitHub "Release" run for this push finished with the publish jobs **skipped** (Task 11).

- [ ] **Step 5: Manual sign-in check**

Open https://meeqat.sanad.ink → Settings → "Sign in with Google" → returns signed in with your name and email; "Sign out" returns to signed out.
In the browser console: `await (await fetch("https://auth.sanad.ink/api/auth/token", {credentials:"include"})).json()` → `{ token: "eyJ…" }`.

---

## Self-review notes

- Spec coverage (phase 1 = spec §7.1): web target (Tasks 9, 13), platform adapters (Tasks 2–4), web sign-in (Tasks 5–7, 12–13), privacy page (Task 8), TRUSTED_ORIGINS (Tasks 12–13). Release-pipeline guard (Task 11) is added because web pushes would otherwise re-release the apps.
- Deliberately not in phase 1: native sign-in, deep links, keychain (phase 4); the Together service (phase 2).
