import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { cursorPosition, availableMonitors } from "@tauri-apps/api/window";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { platform } from "@tauri-apps/plugin-os";

let focusUnlisten: UnlistenFn | null = null;
let focusGraceTimer: ReturnType<typeof setTimeout> | null = null;
let focusGraceActive = false;

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
          const popoverHeight = 370;

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
            const popoverHeight = 370;
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
    } else if (currentPlatform === "windows") {
      // Windows: position popover above the cursor (near tray icon)
      try {
        const cursor = await cursorPosition();
        const monitors = await availableMonitors();

        console.log("[TrayPopover] Windows cursor position:", cursor);

        const popoverWidth = 280;
        const popoverHeight = 370;

        // Find the monitor containing the cursor
        const targetMonitor = monitors.find(m =>
          cursor.x >= m.position.x &&
          cursor.x < m.position.x + m.size.width &&
          cursor.y >= m.position.y &&
          cursor.y < m.position.y + m.size.height
        ) || monitors[0];

        if (targetMonitor) {
          const scaleFactor = targetMonitor.scaleFactor;
          const monLeft = targetMonitor.position.x / scaleFactor;
          const monTop = targetMonitor.position.y / scaleFactor;
          const monWidth = targetMonitor.size.width / scaleFactor;
          const monHeight = targetMonitor.size.height / scaleFactor;

          // Center horizontally on cursor, position above cursor
          let x = (cursor.x / scaleFactor) - (popoverWidth / 2);
          let y = (cursor.y / scaleFactor) - popoverHeight - 12; // 12px gap above cursor

          // Clamp horizontal to monitor bounds
          x = Math.max(monLeft, Math.min(x, monLeft + monWidth - popoverWidth));

          // If no room above, position below cursor
          if (y < monTop) {
            y = (cursor.y / scaleFactor) + 12;
          }
          // Clamp vertical to monitor bounds
          y = Math.min(y, monTop + monHeight - popoverHeight);

          console.log(`[TrayPopover] Windows positioning at logical (${x}, ${y})`);
          await trayWindow.setPosition(new LogicalPosition(x, y));
        } else {
          // No monitors found, fall back to event-based
          await emit("meeqat:tray:show");
        }
      } catch (e) {
        console.error("[TrayPopover] Windows direct positioning failed, using fallback:", e);
        await emit("meeqat:tray:show");
      }
    } else {
      // Other platforms: use default tray positioning
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

    // Start a grace period so Windows doesn't immediately dismiss the popover
    // due to spurious focus-lost events right after showing an undecorated alwaysOnTop window
    focusGraceActive = true;
    if (focusGraceTimer) clearTimeout(focusGraceTimer);
    focusGraceTimer = setTimeout(() => {
      focusGraceActive = false;
      focusGraceTimer = null;
    }, 300);

    focusUnlisten = await trayWindow.onFocusChanged(({ payload: focused }) => {
      console.log("[TrayPopover] Focus changed:", focused, "grace:", focusGraceActive);
      if (!focused && !focusGraceActive) {
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

  if (focusGraceTimer) {
    clearTimeout(focusGraceTimer);
    focusGraceTimer = null;
  }
  focusGraceActive = false;
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
