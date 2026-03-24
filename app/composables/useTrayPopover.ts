import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { availableMonitors } from "@tauri-apps/api/window";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { platform } from "@tauri-apps/plugin-os";

interface TrayRect {
  position: { x: number; y: number };
  size: { width: number; height: number };
}

let focusUnlisten: UnlistenFn | null = null;
const graceState = {
  timer: null as ReturnType<typeof setTimeout> | null,
  active: false,
  clear() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.active = false;
  },
  start(durationMs: number) {
    this.clear();
    this.active = true;
    this.timer = setTimeout(() => {
      this.active = false;
      this.timer = null;
    }, durationMs);
  },
};

export async function getTrayWindow(): Promise<WebviewWindow | null> {
  try {
    return await WebviewWindow.getByLabel("tray");
  } catch (e) {
    console.error("[TrayPopover] Failed to get tray window:", e);
    return null;
  }
}

export async function showPopover(trayRect?: TrayRect): Promise<void> {
  if (import.meta.dev) console.log("[TrayPopover] showPopover called", trayRect);
  const trayWindow = await getTrayWindow();
  if (!trayWindow) {
    console.warn("[TrayPopover] Tray window not found");
    return;
  }

  try {
    if (trayRect) {
      // Position relative to the tray icon using its physical coordinates
      const trayX = trayRect.position.x;
      const trayY = trayRect.position.y;
      const trayWidth = trayRect.size.width;
      const trayHeight = trayRect.size.height;

      const [windowSize, monitors] = await Promise.all([
        trayWindow.outerSize(),
        availableMonitors(),
      ]);
      const windowWidth = windowSize.width;
      const windowHeight = windowSize.height;

      // Center horizontally on tray icon
      let x = trayX + Math.round(trayWidth / 2) - Math.round(windowWidth / 2);

      let y: number;
      const currentPlatform = platform();

      if (currentPlatform === "windows") {
        // Windows: tray is in taskbar (usually bottom). Position above the icon.
        y = trayY - windowHeight;
        if (y < 0) y = trayY + trayHeight;
      } else {
        // macOS: tray is in menu bar (top). Position below the icon.
        y = trayY + trayHeight;
      }

      // Clamp to monitor bounds
      const targetMonitor = monitors.find(m =>
        trayX >= m.position.x &&
        trayX < m.position.x + m.size.width &&
        trayY >= m.position.y &&
        trayY < m.position.y + m.size.height
      );
      if (targetMonitor) {
        const monLeft = targetMonitor.position.x;
        const monRight = targetMonitor.position.x + targetMonitor.size.width;
        const monBottom = targetMonitor.position.y + targetMonitor.size.height;
        x = Math.max(monLeft, Math.min(x, monRight - windowWidth));
        y = Math.min(y, monBottom - windowHeight);
      }

      if (import.meta.dev) console.log(`[TrayPopover] Positioning at physical (${x}, ${y})`);
      await trayWindow.setPosition(new PhysicalPosition(x, y));
    } else {
      // Fallback: use positioner plugin via event (tray.vue handles it)
      await emit("meeqat:tray:show");
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Show the window
    await trayWindow.show();
    await trayWindow.setFocus();

    // Setup focus listener to auto-hide when clicking outside
    if (focusUnlisten) {
      focusUnlisten();
      focusUnlisten = null;
    }

    // Grace period so Windows doesn't immediately dismiss the popover
    // due to spurious focus-lost events right after showing an undecorated alwaysOnTop window
    graceState.start(300);

    focusUnlisten = await trayWindow.onFocusChanged(({ payload: focused }) => {
      if (import.meta.dev) console.log("[TrayPopover] Focus changed:", focused, "grace:", graceState.active);
      if (!focused && !graceState.active) {
        hidePopover();
      }
    });
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

  graceState.clear();
}

export async function togglePopover(trayRect?: TrayRect): Promise<void> {
  if (import.meta.dev) console.log("[TrayPopover] togglePopover called");
  const trayWindow = await getTrayWindow();
  if (!trayWindow) {
    console.warn("[TrayPopover] Tray window not found for toggle");
    return;
  }

  try {
    const visible = await trayWindow.isVisible();
    if (import.meta.dev) console.log("[TrayPopover] Window visible:", visible);
    if (visible) {
      await hidePopover();
    } else {
      await showPopover(trayRect);
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
