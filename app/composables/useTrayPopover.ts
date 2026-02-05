import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { cursorPosition, availableMonitors } from "@tauri-apps/api/window";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { platform } from "@tauri-apps/plugin-os";

let focusUnlisten: UnlistenFn | null = null;

export async function getTrayWindow(): Promise<WebviewWindow | null> {
  try {
    return await WebviewWindow.getByLabel("tray");
  } catch (e) {
    console.error("[TrayPopover] Failed to get tray window:", e);
    return null;
  }
}

export async function showPopover(): Promise<void> {
  console.log("[TrayPopover] showPopover called");
  const trayWindow = await getTrayWindow();
  if (!trayWindow) {
    console.warn("[TrayPopover] Tray window not found");
    return;
  }

  try {
    // Get current platform
    let currentPlatform = "unknown";
    try {
      currentPlatform = await platform();
    } catch {
      console.log("[TrayPopover] Could not detect platform");
    }

    // On macOS, center on the monitor where the cursor is
    if (currentPlatform === "macos") {
      try {
        const cursor = await cursorPosition();
        const monitors = await availableMonitors();

        // Find the monitor containing the cursor
        const targetMonitor = monitors.find(m =>
          cursor.x >= m.position.x &&
          cursor.x < m.position.x + m.size.width &&
          cursor.y >= m.position.y &&
          cursor.y < m.position.y + m.size.height
        );

        if (targetMonitor) {
          // Center on target monitor (popover size is 280x350 from tauri.conf.json)
          const popoverWidth = 280;
          const popoverHeight = 350;
          const x = targetMonitor.position.x + (targetMonitor.size.width - popoverWidth) / 2;
          const y = targetMonitor.position.y + (targetMonitor.size.height - popoverHeight) / 2;

          console.log(`[TrayPopover] Centering on monitor at (${x}, ${y})`);
          await trayWindow.setPosition(new LogicalPosition(x, y));
        } else {
          // Fallback: emit show event for default positioning
          console.log("[TrayPopover] No target monitor found, using default positioning");
          await emit("meeqat:tray:show");
        }
      } catch (e) {
        console.error("[TrayPopover] Multi-monitor positioning failed, using fallback:", e);
        await emit("meeqat:tray:show");
      }
    } else {
      // Non-macOS: use default tray positioning
      await emit("meeqat:tray:show");
    }

    // Show the window
    console.log("[TrayPopover] Showing window...");
    await trayWindow.show();
    console.log("[TrayPopover] Window shown");

    // Focus the window
    console.log("[TrayPopover] Setting focus...");
    await trayWindow.setFocus();

    // Setup focus listener to auto-hide when clicking outside
    if (focusUnlisten) {
      focusUnlisten();
      focusUnlisten = null;
    }

    focusUnlisten = await trayWindow.onFocusChanged(({ payload: focused }) => {
      console.log("[TrayPopover] Focus changed:", focused);
      if (!focused) {
        hidePopover();
      }
    });
    console.log("[TrayPopover] showPopover completed");
  } catch (e) {
    console.error("[TrayPopover] Failed to show popover:", e);
  }
}

export async function hidePopover(): Promise<void> {
  const trayWindow = await getTrayWindow();
  if (!trayWindow) return;

  try {
    await trayWindow.hide();
  } catch (e) {
    console.error("[TrayPopover] Failed to hide popover:", e);
  }

  if (focusUnlisten) {
    focusUnlisten();
    focusUnlisten = null;
  }
}

export async function togglePopover(): Promise<void> {
  console.log("[TrayPopover] togglePopover called");
  const trayWindow = await getTrayWindow();
  if (!trayWindow) {
    console.warn("[TrayPopover] Tray window not found for toggle");
    return;
  }

  try {
    const visible = await trayWindow.isVisible();
    console.log("[TrayPopover] Window visible:", visible);
    if (visible) {
      await hidePopover();
    } else {
      await showPopover();
    }
  } catch (e) {
    console.error("[TrayPopover] Failed to toggle popover:", e);
  }
}

export function useTrayPopover() {
  return {
    showPopover,
    hidePopover,
    togglePopover,
    getTrayWindow,
  };
}
