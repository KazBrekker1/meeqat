import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { availableMonitors, cursorPosition, type Monitor } from "@tauri-apps/api/window";
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
    const currentPlatform = platform();
    const windowSize = await trayWindow.outerSize();
    const windowWidth = windowSize.width;
    const windowHeight = windowSize.height;

    const monitors = await availableMonitors();
    const within = (m: Monitor, px: number, py: number) =>
      px >= m.position.x &&
      px < m.position.x + m.size.width &&
      py >= m.position.y &&
      py < m.position.y + m.size.height;

    // The cursor is the reliable signal for *which display* the tray was clicked
    // on — the macOS menu-bar tray rect can be (0,0) or main-relative on secondary
    // displays, which previously made the popover always land on the main monitor.
    let cursor: { x: number; y: number } | null = null;
    try {
      cursor = await cursorPosition();
    } catch {
      // cursor position unavailable — fall back to the tray rect below
    }

    const trayX = trayRect?.position.x ?? 0;
    const trayY = trayRect?.position.y ?? 0;
    const trayW = trayRect?.size.width ?? 0;
    const trayH = trayRect?.size.height ?? 0;

    // Anchor monitor: prefer the one under the cursor, then the tray rect, then primary.
    const targetMonitor =
      (cursor && monitors.find((m) => within(m, cursor!.x, cursor!.y))) ||
      (trayRect && monitors.find((m) => within(m, trayX, trayY))) ||
      monitors[0];

    if (targetMonitor) {
      const monLeft = targetMonitor.position.x;
      const monTop = targetMonitor.position.y;
      const monRight = monLeft + targetMonitor.size.width;
      const monBottom = monTop + targetMonitor.size.height;
      const workTop = targetMonitor.workArea?.position.y ?? monTop;
      const workBottom =
        (targetMonitor.workArea?.position.y ?? monTop) +
        (targetMonitor.workArea?.size.height ?? targetMonitor.size.height);

      // Only trust the tray rect when it's non-empty AND on the chosen monitor.
      const rectUsable =
        !!trayRect && (trayX !== 0 || trayY !== 0) && within(targetMonitor, trayX, trayY);

      // Horizontal: under the icon if usable, else under the cursor, else monitor centre.
      const anchorX = rectUsable
        ? trayX + trayW / 2
        : cursor && within(targetMonitor, cursor.x, cursor.y)
          ? cursor.x
          : (monLeft + monRight) / 2;
      let x = Math.round(anchorX - windowWidth / 2);

      let y: number;
      if (currentPlatform === "windows") {
        // Taskbar usually at the bottom: place above the icon (or below if no room).
        y = rectUsable ? trayY - windowHeight : workBottom - windowHeight;
        if (y < workTop) y = rectUsable ? trayY + trayH : workTop;
      } else {
        // macOS menu bar at the top: drop just below it.
        y = rectUsable ? trayY + trayH : workTop;
      }

      // Clamp inside the chosen monitor.
      x = Math.max(monLeft, Math.min(x, monRight - windowWidth));
      y = Math.max(monTop, Math.min(y, monBottom - windowHeight));

      if (import.meta.dev)
        console.log("[TrayPopover] place", {
          monitor: targetMonitor.name,
          rectUsable,
          cursor,
          trayRect,
          x,
          y,
        });
      await trayWindow.setPosition(new PhysicalPosition(x, y));
    } else {
      // No monitor info at all — fall back to the positioner plugin (tray.vue handles it).
      await emit("meeqat:tray:show");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // macOS: let the popover appear over another app's native fullscreen Space.
    // A normal window (even alwaysOnTop) lacks NSWindowCollectionBehaviorCanJoinAllSpaces,
    // so show() would place it on the previous Space — invisible behind the fullscreen app.
    try {
      await trayWindow.setVisibleOnAllWorkspaces(true);
    } catch (e) {
      if (import.meta.dev) console.warn("[TrayPopover] setVisibleOnAllWorkspaces failed:", e);
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
