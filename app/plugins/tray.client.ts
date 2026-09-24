import { TrayIcon } from "@tauri-apps/api/tray";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { listen } from "@tauri-apps/api/event";
import { getPlatform } from "@/utils/platform";
import type { TrayUpdatePayload } from "@/utils/types";

/**
 * The tray icon, its menu and the popover are created and driven in Rust
 * (src-tauri/src/tray.rs). This plugin only keeps the menu-bar title ("Asr in 2:14")
 * in sync with the main window's countdown.
 */
export default defineNuxtPlugin(async () => {
  if (import.meta.server || getPlatform() !== "desktop") return;
  if (getCurrentWebviewWindow().label !== "main") return;

  const tray = await TrayIcon.getById("meeqat-tray");
  if (!tray) return;

  let lastTitle = "";
  await listen<TrayUpdatePayload>("meeqat:tray:update", async ({ payload }) => {
    if (!payload || !("title" in payload)) return;
    const title = payload.title || "Meeqat";
    if (title === lastTitle) return;
    lastTitle = title;
    try {
      await tray.setTitle(title);
    } catch {
      // ignore
    }
  });
});
