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
