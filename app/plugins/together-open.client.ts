import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { listen } from "@tauri-apps/api/event";
import { getPlatform } from "@/utils/platform";

/**
 * Desktop: the tray's call card ("Open") asks Rust to show the main window, and
 * Rust tells the main window which room to route to (src-tauri/src/together.rs).
 */
export default defineNuxtPlugin(async () => {
  if (import.meta.server || getPlatform() !== "desktop") return;
  if (getCurrentWebviewWindow().label !== "main") return;

  await listen<string>("together:open-room", ({ payload: roomId }) => {
    if (roomId) void navigateTo(`/rooms/${encodeURIComponent(roomId)}`);
  });
});
