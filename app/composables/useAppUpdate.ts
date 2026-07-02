import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { platform } from "@tauri-apps/plugin-os";
import { invoke } from "@tauri-apps/api/core";
import { isTauriAvailable } from "@/utils/store";

const REPO = "KazBrekker1/meeqat";
const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "installing"
  | "uptodate"
  | "error";

/**
 * Cross-platform in-app updater.
 *
 * Desktop (macOS/Windows/Linux): uses Tauri's `updater` plugin, which checks the
 * signed `latest.json` published to GitHub Releases, downloads + verifies the
 * signature, installs, and relaunches.
 *
 * Android: the Tauri updater plugin does not support mobile. Instead we do a
 * Telegram-style flow — detect a newer release via the GitHub API, then hand the
 * signed APK to the OS package installer via the prayer-service plugin's
 * `install_apk` native command (which fires Android's install intent).
 *
 * Module-level singleton state so the footer badge and the settings modal share
 * one source of truth.
 */
const status = ref<UpdateStatus>("idle");
const latestVersion = ref<string | null>(null);
const releaseNotes = ref<string | null>(null);
const downloadProgress = ref(0); // 0..100, desktop only (Android install is handed off to the OS)
// True once we know the download's total size, so the UI can show a real % bar;
// while false (server sent no Content-Length) the UI shows an indeterminate bar
// instead of a bar pinned at 0% that looks frozen.
const progressKnown = ref(false);
const errorMessage = ref<string | null>(null);

// Desktop: hold the resolved Update handle between check and install.
let pendingUpdate: Update | null = null;
// Android: the APK asset URL to install.
let pendingApkUrl: string | null = null;

const isUpdateAvailable = computed(() => status.value === "available");

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

async function checkAndroid(): Promise<void> {
  const currentVersion = useRuntimeConfig().public.version as string;
  const res = await fetch(LATEST_RELEASE_API, {
    headers: { Accept: "application/vnd.github+json" },
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
    throw new Error("No APK asset on the latest release");
  }

  pendingApkUrl = apk.browser_download_url;
  latestVersion.value = normalizeVersion(tag);
  releaseNotes.value = data.body ?? null;
  status.value = "available";
}

async function checkDesktop(): Promise<void> {
  const update = await check();
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
 * Check for an available update. Safe to call on launch (silent) or from a
 * "Check for updates" button. Never throws — failures land in `errorMessage`.
 */
async function checkForUpdate(): Promise<void> {
  if (!isTauriAvailable()) return; // browser / prototype context: nothing to update
  if (status.value === "checking" || status.value === "downloading") return;

  status.value = "checking";
  errorMessage.value = null;
  try {
    const os = platform();
    if (os === "ios") {
      // iOS forbids self-install/sideload; updates only via App Store/TestFlight.
      // Nothing we can offer in-app — stay silent.
      status.value = "idle";
      return;
    }
    if (os === "android") {
      await checkAndroid();
    } else {
      await checkDesktop();
    }
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : String(e);
    status.value = "error";
    console.error("[update] check failed", e);
  }
}

/**
 * Download + install the pending update.
 *
 * Desktop: downloads, verifies the signature, installs, then relaunches.
 * Android: hands the APK URL to the native installer, which downloads it and
 * fires the system install prompt (the user confirms in the OS dialog).
 */
async function downloadAndInstall(): Promise<void> {
  if (!isTauriAvailable()) return;
  errorMessage.value = null;

  try {
    const os = platform();
    if (os === "ios") return; // unreachable in practice — iOS never reaches "available"
    if (os === "android") {
      if (!pendingApkUrl) throw new Error("No pending APK to install");
      // The native command downloads the APK off the main thread, then fires the OS
      // install intent. There's no byte-progress callback, so show an indeterminate
      // "Downloading…" bar for the whole native download — far more visible than the
      // near-instant "installing" spinner it showed before.
      status.value = "downloading";
      progressKnown.value = false;
      downloadProgress.value = 0;
      await invoke("plugin:prayer-service|install_apk", { url: pendingApkUrl });
      // The OS installer is now in charge; drop back to the install affordance so a
      // cancelled install leaves a retryable button rather than a stuck spinner.
      status.value = "available";
      return;
    }

    if (!pendingUpdate) throw new Error("No pending update to install");
    status.value = "downloading";
    downloadProgress.value = 0;
    progressKnown.value = false;

    let downloaded = 0;
    let contentLength = 0;
    await pendingUpdate.downloadAndInstall((event) => {
      switch (event.event) {
        case "Started":
          contentLength = event.data.contentLength ?? 0;
          progressKnown.value = contentLength > 0;
          break;
        case "Progress":
          downloaded += event.data.chunkLength;
          if (contentLength) {
            downloadProgress.value = Math.round((downloaded / contentLength) * 100);
          }
          break;
        case "Finished":
          downloadProgress.value = 100;
          progressKnown.value = true;
          status.value = "installing";
          break;
      }
    });

    // Installed. A very fast download can reach here in well under a frame, so
    // hold the "installing / restarting" state briefly — otherwise the whole
    // flow flashes past and the user sees no feedback before the relaunch.
    status.value = "installing";
    await new Promise((resolve) => setTimeout(resolve, 700));

    // Relaunch into the new version.
    await relaunch();
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : String(e);
    status.value = "error";
    console.error("[update] install failed", e);
  }
}

export function useAppUpdate() {
  return {
    status: readonly(status),
    latestVersion: readonly(latestVersion),
    releaseNotes: readonly(releaseNotes),
    downloadProgress: readonly(downloadProgress),
    progressKnown: readonly(progressKnown),
    errorMessage: readonly(errorMessage),
    isUpdateAvailable,
    checkForUpdate,
    downloadAndInstall,
  };
}
