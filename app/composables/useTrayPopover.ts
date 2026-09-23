import { invoke } from "@tauri-apps/api/core";

/**
 * The tray popover is shown, placed and hidden in Rust (src-tauri/src/tray.rs) —
 * on macOS it's an NSPanel so it can appear over full-screen apps. The page only
 * needs to ask Rust to hide it (close button, "Open Meeqat").
 */
export async function hidePopover(): Promise<void> {
  try {
    await invoke("hide_tray_popover");
  } catch (e) {
    console.error("[TrayPopover] Failed to hide popover:", e);
  }
}
