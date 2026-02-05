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

        console.log("[TrayPopover] Cursor position:", cursor);
        console.log("[TrayPopover] Monitors:", monitors.map(m => ({
          name: m.name,
          position: m.position,
          size: m.size,
          scaleFactor: m.scaleFactor
        })));

        // Find the monitor containing the cursor
        // cursor position is in physical pixels, monitor positions/sizes are also physical
        const targetMonitor = monitors.find(m =>
          cursor.x >= m.position.x &&
          cursor.x < m.position.x + m.size.width &&
          cursor.y >= m.position.y &&
          cursor.y < m.position.y + m.size.height
        );

        console.log("[TrayPopover] Target monitor:", targetMonitor?.name);

        if (targetMonitor) {
          // Center on target monitor
          // Convert physical to logical coordinates for setPosition
          const scaleFactor = targetMonitor.scaleFactor;
          const popoverWidth = 280;
          const popoverHeight = 350;

          // Calculate center in physical coords, then convert to logical
          const physicalX = targetMonitor.position.x + (targetMonitor.size.width - popoverWidth * scaleFactor) / 2;
          const physicalY = targetMonitor.position.y + (targetMonitor.size.height - popoverHeight * scaleFactor) / 2;

          // Convert to logical position
          const x = physicalX / scaleFactor;
          const y = physicalY / scaleFactor;

          console.log(`[TrayPopover] Centering on monitor at logical (${x}, ${y}), scaleFactor: ${scaleFactor}`);
          await trayWindow.setPosition(new LogicalPosition(x, y));
        } else {
          // Fallback: use first monitor
          console.log("[TrayPopover] No target monitor found, using first monitor");
          if (monitors.length > 0) {
            const m = monitors[0];
            const scaleFactor = m.scaleFactor;
            const popoverWidth = 280;
            const popoverHeight = 350;
            const physicalX = m.position.x + (m.size.width - popoverWidth * scaleFactor) / 2;
            const physicalY = m.position.y + (m.size.height - popoverHeight * scaleFactor) / 2;
            const x = physicalX / scaleFactor;
            const y = physicalY / scaleFactor;
            await trayWindow.setPosition(new LogicalPosition(x, y));
          } else {
            await emit("meeqat:tray:show");
          }
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
