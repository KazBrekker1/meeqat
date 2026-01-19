import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";

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
    // Show the window first
    console.log("[TrayPopover] Showing window...");
    await trayWindow.show();
    console.log("[TrayPopover] Window shown");

    // Tell the tray window to position itself at tray (it will use positioner plugin from its own context)
    console.log("[TrayPopover] Emitting show event for positioning...");
    await emit("meeqat:tray:show");

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
