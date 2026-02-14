import { TrayIcon } from "@tauri-apps/api/tray";
import { Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { WebviewWindow, getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { resolveResource } from "@tauri-apps/api/path";
import { platform } from "@tauri-apps/plugin-os";
import { handleIconState } from "@tauri-apps/plugin-positioner";
import { togglePopover } from "@/composables/useTrayPopover";

declare global {
  interface Window {
    __MEEQAT_TRAY__?: {
      tray: TrayIcon | null;
      unlisten?: UnlistenFn | null;
      initialized: boolean;
    };
  }
}

function isTauriAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as any;
  return Boolean(w.__TAURI__?.core?.invoke || w.__TAURI_INTERNALS__?.invoke);
}

async function openMainWindow() {
  const main =
    (await WebviewWindow.getByLabel("main")) || WebviewWindow.getCurrent();
  await main.show();
  await main.setFocus();
}

export default defineNuxtPlugin(async () => {
  if (import.meta.server) return;
  if (!isTauriAvailable()) return;
  // The Tray API is not available on mobile (Android/iOS). Bail out early.
  const currentPlatform = platform();
  if (currentPlatform === "android" || currentPlatform === "ios") {
    return;
  }

  // Only initialize tray from the main window to prevent duplicate tray icons
  // when both main and tray windows load the Nuxt app simultaneously
  const currentWindow = getCurrentWebviewWindow();
  if (currentWindow.label !== "main") {
    console.log("[Tray] Skipping initialization - not main window");
    return;
  }

  // Check if tray already exists using Tauri API to prevent HMR duplication
  const existingTray = await TrayIcon.getById("meeqat-tray");
  if (existingTray) {
    console.log("[Tray] Skipping initialization - tray already exists");
    if (!window.__MEEQAT_TRAY__) {
      window.__MEEQAT_TRAY__ = {
        tray: existingTray,
        unlisten: null,
        initialized: true,
      };
    }
    return;
  }

  // Initialize the global tracker
  if (!window.__MEEQAT_TRAY__) {
    window.__MEEQAT_TRAY__ = { tray: null, unlisten: null, initialized: false };
  }

  // Build right-click menu with only Open and Quit items
  const openItem = await MenuItem.new({
    id: "meeqat-open",
    text: "Open Meeqat",
    action: async () => {
      try {
        await openMainWindow();
      } catch (error) {
        console.error(error);
        console.error("Failed to open Meeqat");
      }
    },
  });

  const quitItem = await MenuItem.new({
    id: "meeqat-quit",
    text: "Quit Meeqat",
    action: async () => {
      try {
        await invoke("quit_app");
      } catch (error) {
        console.error(error);
        console.error("Failed to quit Meeqat");
      }
    },
  });

  const separatorItem = await PredefinedMenuItem.new({
    text: "separator",
    item: "Separator",
  });

  const menu = await Menu.new({
    items: [openItem, separatorItem, quitItem],
  });

  const isMac = platform() === "macos";
  const isWindows = platform() === "windows";
  // Get icon path for non-macOS platforms (macOS uses text-only menu bar item)
  const iconPath = !isMac
    ? await resolveResource(
        isWindows ? "icons/icon.ico" : "icons/icon.png"
      ).catch(() => null)
    : null;

  const tray = await TrayIcon.new({
    id: "meeqat-tray",
    menu,
    menuOnLeftClick: false, // Disable menu on left click - we'll show popover instead
    tooltip: "Meeqat",
    ...(isMac ? { title: "Meeqat" } : {}),
    ...(iconPath ? { icon: iconPath } : {}),
    action: async (event) => {
      console.log("[Tray] Action event:", JSON.stringify(event));
      // Track tray icon state for Position.TrayCenter fallback
      try {
        await handleIconState(event);
      } catch (e) {
        console.warn("[Tray] handleIconState failed:", e);
      }
      // Handle left-click only to toggle popover (right-click shows context menu)
      if (event.type === "Click" && event.button === "Left" && event.buttonState === "Up") {
        console.log("[Tray] Left click detected - toggling popover");
        try {
          await togglePopover();
        } catch (e) {
          console.error("[Tray] Failed to toggle popover:", e);
          // Fallback: show main window if popover fails
          await openMainWindow();
        }
      }
    },
  });
  window.__MEEQAT_TRAY__!.tray = tray;

  // Listen for events from the UI to update the tray title
  const unlisten = await listen<{
    dateLine?: string;
    title?: string | null;
    nextLine?: string;
    sinceLine?: string;
  }>("meeqat:tray:update", async (evt) => {
    try {
      const payload = evt.payload || {};
      // Update tray title (shown in menu bar on macOS)
      if (window.__MEEQAT_TRAY__?.tray && "title" in payload) {
        await window.__MEEQAT_TRAY__!.tray!.setTitle(
          payload.title == null || payload.title === ""
            ? "Meeqat"
            : payload.title
        );
      }
    } catch {
      // ignore update errors
    }
  });
  window.__MEEQAT_TRAY__!.unlisten = unlisten;

  // Mark as initialized to prevent HMR from reinitializing
  window.__MEEQAT_TRAY__!.initialized = true;
});
