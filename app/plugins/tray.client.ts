import { TrayIcon } from "@tauri-apps/api/tray";
import { Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { resolveResource } from "@tauri-apps/api/path";
import { platform } from "@tauri-apps/plugin-os";

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

  // Build tray menu with two dynamic info items
  const dateItem = await MenuItem.new({
    id: "meeqat-date",
    text: "Dates loading…",
    action: async () => {
      // open the main window
      await openMainWindow();
    },
  });

  const nextItem = await MenuItem.new({
    id: "meeqat-next",
    text: "Next: loading…",
    action: async () => {
      await openMainWindow();
    },
  });

  const sinceItem = await MenuItem.new({
    id: "meeqat-since",
    text: "Last: loading…",
    action: async () => {
      await openMainWindow();
    },
  });

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
    items: [dateItem, nextItem, sinceItem, separatorItem, openItem, quitItem],
  });

  const isMac = platform() === "macos";
  const isWindows = platform() === "windows";
  const iconPath = !isMac
    ? await resolveResource(
        isWindows ? "icons/icon.ico" : "icons/icon.png"
      ).catch(() => null)
    : null;

  const tray = await TrayIcon.new({
    id: "meeqat-tray",
    menu,
    tooltip: "Meeqat",
    ...(isMac ? { title: "Meeqat" } : {}),
    ...(iconPath ? { icon: iconPath } : {}),
  });
  window.__MEEQAT_TRAY__!.tray = tray;

  // Listen for events from the UI to update the tray/menu contents
  const unlisten = await listen<{
    dateLine?: string;
    title?: string | null;
    nextLine?: string;
    sinceLine?: string;
  }>("meeqat:tray:update", async (evt) => {
    try {
      const payload = evt.payload || {};
      if (typeof payload.dateLine === "string") {
        await dateItem.setText(payload.dateLine);
      }
      if (typeof payload.nextLine === "string") {
        await nextItem.setText(payload.nextLine);
      }
      if (typeof payload.sinceLine === "string") {
        await sinceItem.setText(payload.sinceLine);
      }
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
