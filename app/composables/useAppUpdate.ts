import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Channel, invoke } from "@tauri-apps/api/core";
import { getPlatform } from "@/utils/platform";
import { cue } from "@/utils/sounds";

const REPO = "KazBrekker1/meeqat";
const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;
// Re-check this often while the app stays open (the desktop tray app can run for days).
const RECHECK_MS = 6 * 60 * 60 * 1000;
// Kotlin prefixes the "install unknown apps" rejection with this (PrayerServicePlugin.kt).
const ERR_INSTALL_PERMISSION = "[install-permission]";
const PROMPTED_KEY = "meeqat:update-prompted";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "uptodate"
  | "available"
  | "downloading"
  /** Desktop: installing, then relaunching into the new version. */
  | "installing"
  /** Android: the APK is downloaded and the system install dialog is open. */
  | "ready"
  | "error";

/** What failed, so the UI can offer the right next step. */
export type UpdateErrorKind = "check" | "download" | "permission";

export type UpdatePlatform = "desktop" | "android" | "ios" | "web";

/**
 * Cross-platform in-app updater.
 *
 * Desktop (macOS/Windows/Linux): uses Tauri's `updater` plugin, which checks the
 * signed `latest.json` published to GitHub Releases, downloads + verifies the
 * signature, installs, and relaunches.
 *
 * Android: the Tauri updater plugin does not support mobile. Instead we do a
 * Telegram-style flow — detect a newer release via the GitHub API, then the
 * prayer-service plugin's `install_apk` downloads the APK (streaming progress over
 * a Channel) and fires the system install dialog.
 *
 * Module-level singleton state so the footer pill, the update modal and the
 * settings section share one source of truth.
 */
const status = ref<UpdateStatus>("idle");
const latestVersion = ref<string | null>(null);
const releaseNotes = ref<string | null>(null);
const downloadedBytes = ref(0);
// null while the size is unknown (no Content-Length) → the UI shows an indeterminate bar.
const totalBytes = ref<number | null>(null);
const errorMessage = ref<string | null>(null);
const errorKind = ref<UpdateErrorKind | null>(null);
const lastCheckedAt = ref<number | null>(null);

// Desktop: hold the resolved Update handle between check and install.
let pendingUpdate: Update | null = null;
// Android: the APK asset URL to install.
let pendingApkUrl: string | null = null;

const updatePlatform = computed<UpdatePlatform>(() => {
  if (simScenario()) return simScenario() === "android" || simScenario() === "permission" ? "android" : "desktop";
  return getPlatform();
});

/** An update exists and hasn't been installed yet (includes a failed install, for retry). */
const hasUpdate = computed(
  () =>
    latestVersion.value !== null &&
    (["available", "downloading", "installing", "ready"].includes(status.value) ||
      (status.value === "error" && errorKind.value !== "check"))
);
const isUpdateAvailable = hasUpdate;
const isBusy = computed(() =>
  ["checking", "downloading", "installing"].includes(status.value)
);
const downloadProgress = computed(() =>
  totalBytes.value ? Math.min(100, Math.round((downloadedBytes.value / totalBytes.value) * 100)) : 0
);
const progressKnown = computed(() => totalBytes.value !== null);

function normalizeVersion(v: string): string {
  // Strip a leading "meeqat-v" / "v" so "meeqat-v3.2.0" -> "3.2.0".
  return v.replace(/^meeqat-v/i, "").replace(/^v/i, "").trim();
}

/** Returns true when `candidate` is a strictly newer semver than `current`. */
function isNewer(candidate: string, current: string): boolean {
  const a = normalizeVersion(candidate).split(".").map((n) => parseInt(n, 10) || 0);
  const b = normalizeVersion(current).split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    if (ai > bi) return true;
    if (ai < bi) return false;
  }
  return false;
}

/** Turn plugin/network errors into a sentence a person can act on. */
function describeError(e: unknown, kind: UpdateErrorKind): { kind: UpdateErrorKind; message: string } {
  const raw = e instanceof Error ? e.message : String(e);
  if (raw.includes(ERR_INSTALL_PERMISSION)) {
    return {
      kind: "permission",
      message: raw.slice(raw.indexOf(ERR_INSTALL_PERMISSION) + ERR_INSTALL_PERMISSION.length).trim(),
    };
  }
  if (/failed to fetch|networkerror|load failed|error sending request|unable to resolve host|timed? ?out|abort|dns|connect/i.test(raw)) {
    return {
      kind,
      message: kind === "check"
        ? "Couldn't reach GitHub to check for updates. Check your connection and try again."
        : "The download was interrupted. Check your connection and try again.",
    };
  }
  if (/GitHub API 403|rate limit/i.test(raw)) {
    return { kind, message: "GitHub is limiting update checks right now. Try again in an hour." };
  }
  if (/signature/i.test(raw)) {
    return { kind, message: "The download didn't pass its signature check, so it wasn't installed." };
  }
  // Drop Rust/plugin wrapper prefixes ("Plugin invoke error: …").
  const message = raw.replace(/^(plugin invoke error|invoke rejected|error):\s*/gi, "").trim();
  return { kind, message: message || "Something went wrong. Try again." };
}

function fail(e: unknown, kind: UpdateErrorKind) {
  const d = describeError(e, kind);
  errorKind.value = d.kind;
  errorMessage.value = d.message;
  status.value = "error";
  console.error(`[update] ${kind} failed`, e);
}

async function checkAndroid(): Promise<void> {
  const currentVersion = useRuntimeConfig().public.version as string;
  const res = await fetch(LATEST_RELEASE_API, {
    headers: { Accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout?.(15_000),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const data = (await res.json()) as {
    tag_name: string;
    body?: string;
    assets: Array<{ name: string; browser_download_url: string }>;
  };

  const tag = data.tag_name;
  if (!isNewer(tag, currentVersion)) {
    status.value = "uptodate";
    return;
  }

  // Prefer a universal/arm64 release APK; fall back to any .apk.
  const apk =
    data.assets.find((a) => /\.apk$/i.test(a.name) && !/unsigned/i.test(a.name)) ??
    data.assets.find((a) => /\.apk$/i.test(a.name));
  if (!apk) {
    // Release published but the APK isn't attached yet (CI still uploading) — not an error.
    status.value = "uptodate";
    return;
  }

  pendingApkUrl = apk.browser_download_url;
  latestVersion.value = normalizeVersion(tag);
  releaseNotes.value = data.body ?? null;
  status.value = "available";
}

async function checkDesktop(): Promise<void> {
  const update = await check({ timeout: 15_000 });
  if (!update) {
    status.value = "uptodate";
    return;
  }
  pendingUpdate = update;
  latestVersion.value = update.version;
  releaseNotes.value = update.body ?? null;
  status.value = "available";
}

/**
 * Check for an available update. Never throws.
 *
 * `silent` (launch / background re-checks): a failure — usually just being
 * offline — leaves the previous state alone instead of showing an error.
 */
async function checkForUpdate({ silent = false }: { silent?: boolean } = {}): Promise<void> {
  const sim = simScenario();
  if (!sim && getPlatform() === "web") return; // browser: updates come from deploys
  // Don't re-check over an update the user is already acting on.
  if (isBusy.value || status.value === "ready" || (silent && hasUpdate.value)) return;
  if (updatePlatform.value === "ios") return; // App Store only — nothing to offer in-app

  const before = status.value;
  status.value = "checking";
  errorMessage.value = null;
  errorKind.value = null;
  try {
    if (sim) await simCheck(sim);
    else if (updatePlatform.value === "android") await checkAndroid();
    else await checkDesktop();
    lastCheckedAt.value = Date.now();
  } catch (e) {
    if (silent) {
      status.value = before === "checking" ? "idle" : before;
      console.warn("[update] background check failed", e);
    } else {
      fail(e, "check");
    }
  }
}

function resetProgress() {
  downloadedBytes.value = 0;
  totalBytes.value = null;
}

/**
 * Download + install the pending update.
 *
 * Desktop: downloads, verifies the signature, installs, then relaunches.
 * Android: downloads the APK with progress, then opens the system install dialog.
 */
async function downloadAndInstall(): Promise<void> {
  const sim = simScenario();
  if ((!sim && getPlatform() === "web") || isBusy.value) return;
  errorMessage.value = null;
  errorKind.value = null;

  if (sim) return simInstall(sim);

  if (updatePlatform.value === "android") {
    try {
      if (!pendingApkUrl) throw new Error("No update to install. Check for updates again.");
      status.value = "downloading";
      resetProgress();
      const onProgress = new Channel<{ downloaded: number; total: number }>();
      onProgress.onmessage = ({ downloaded, total }) => {
        downloadedBytes.value = downloaded;
        totalBytes.value = total > 0 ? total : null;
      };
      await invoke("plugin:prayer-service|install_apk", { url: pendingApkUrl, onProgress });
      // The system dialog is up. If the user backs out, "ready" keeps an Install
      // button that reopens it from the already-downloaded file.
      status.value = "ready";
      cue("updateReady");
    } catch (e) {
      fail(e, "download");
    }
    return;
  }

  try {
    if (!pendingUpdate) throw new Error("No update to install. Check for updates again.");
    status.value = "downloading";
    resetProgress();
    await pendingUpdate.downloadAndInstall((event) => {
      switch (event.event) {
        case "Started":
          totalBytes.value = event.data.contentLength || null;
          break;
        case "Progress":
          downloadedBytes.value += event.data.chunkLength;
          break;
        case "Finished":
          if (totalBytes.value) downloadedBytes.value = totalBytes.value;
          status.value = "installing";
          break;
      }
    });
  } catch (e) {
    fail(e, "download");
    return;
  }

  // Installed. A very fast download can reach here in well under a frame, so hold
  // the "installing / restarting" state briefly so the user sees it happen.
  status.value = "installing";
  await new Promise((resolve) => setTimeout(resolve, 900));
  try {
    await relaunch();
  } catch (e) {
    // The new version is installed; only the automatic restart failed.
    errorKind.value = "download";
    errorMessage.value = "The update is installed. Quit and reopen Meeqat to finish.";
    status.value = "error";
    console.error("[update] relaunch failed", e);
  }
}

/**
 * Check on launch, then again every few hours and whenever the app comes back to
 * the foreground after that long (Android resumes, the desktop window reopens).
 * Idempotent — call it from the root page.
 */
let scheduled = false;
function startUpdateChecks(): void {
  if (scheduled || typeof window === "undefined") return;
  scheduled = true;
  checkForUpdate({ silent: true });
  const due = () => !lastCheckedAt.value || Date.now() - lastCheckedAt.value >= RECHECK_MS;
  setInterval(() => due() && checkForUpdate({ silent: true }), 30 * 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && due()) checkForUpdate({ silent: true });
  });
}

/**
 * True the first time it's asked about a given version, so the update modal
 * opens by itself once per release; afterwards the footer pill is the reminder.
 */
function shouldPromptFor(version: string): boolean {
  try {
    if (localStorage.getItem(PROMPTED_KEY) === version) return false;
    localStorage.setItem(PROMPTED_KEY, version);
  } catch {
    // storage unavailable — prompting again is harmless
  }
  return true;
}

// ---------------------------------------------------------------------------
// Dev-only simulator: `bun dev`, then open /?update-sim=<scenario> in a browser
// to walk the whole UI flow without a release. Stripped from production builds.
//   desktop     · update found, download with a known size, install + restart
//   nosize      · update found, download with no size (indeterminate bar)
//   android     · update found, APK download, system installer opens
//   permission  · Android without the "install unknown apps" grant
//   fail        · download drops at 40%, then a retry succeeds
//   offline     · the check can't reach GitHub
//   uptodate    · already on the latest version
// ---------------------------------------------------------------------------
type SimScenario = "desktop" | "nosize" | "android" | "permission" | "fail" | "offline" | "uptodate";
let simFailedOnce = false;

function simScenario(): SimScenario | null {
  if (!import.meta.dev || typeof window === "undefined" || getPlatform() !== "web") return null;
  return (new URLSearchParams(window.location.search).get("update-sim") as SimScenario) || null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function simCheck(s: SimScenario) {
  await sleep(900);
  if (s === "offline") throw new TypeError("Failed to fetch");
  if (s === "uptodate") {
    status.value = "uptodate";
    return;
  }
  latestVersion.value = "3.4.0";
  releaseNotes.value = "• Widget caption no longer overlaps\n• Download progress on Android\n• Clearer update errors";
  status.value = "available";
}

async function simInstall(s: SimScenario) {
  if (s === "permission" && !simFailedOnce) {
    simFailedOnce = true;
    return fail(`Plugin invoke error: ${ERR_INSTALL_PERMISSION} Allow Meeqat to install apps, then tap Install again.`, "download");
  }
  status.value = "downloading";
  resetProgress();
  const total = 31_400_000;
  totalBytes.value = s === "nosize" ? null : total;
  for (let d = 0; d <= total; d += 1_300_000) {
    await sleep(120);
    downloadedBytes.value = d;
    if (s === "fail" && !simFailedOnce && d > total * 0.4) {
      simFailedOnce = true;
      return fail(new Error("error sending request for url"), "download");
    }
  }
  downloadedBytes.value = total;
  if (s === "android" || s === "permission") {
    status.value = "ready";
    cue("updateReady");
    return;
  }
  status.value = "installing"; // a real build relaunches here
}

export function useAppUpdate() {
  return {
    status: readonly(status),
    latestVersion: readonly(latestVersion),
    releaseNotes: readonly(releaseNotes),
    downloadProgress,
    progressKnown,
    downloadedBytes: readonly(downloadedBytes),
    totalBytes: readonly(totalBytes),
    errorMessage: readonly(errorMessage),
    errorKind: readonly(errorKind),
    updatePlatform,
    isUpdateAvailable,
    isBusy,
    checkForUpdate,
    downloadAndInstall,
    startUpdateChecks,
    shouldPromptFor,
  };
}
