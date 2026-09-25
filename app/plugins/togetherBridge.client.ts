import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getPlatform } from "@/utils/platform";
import { pushSessionToRust } from "@/utils/togetherNative";

/**
 * Desktop: keep the Rust call listener (src-tauri/src/together.rs) on the same
 * Together session as the main window — started on sign-in and every token
 * refresh, stopped on sign-out. The session is restored at launch, so alerts
 * work while Meeqat only sits in the menu bar.
 */
export default defineNuxtPlugin(() => {
  if (getPlatform() !== "desktop" || getCurrentWebviewWindow().label !== "main") return;
  const { pb, ensureSession, onSessionChange } = useTogether();
  onSessionChange((s) => {
    const userId = pb().authStore.record?.id;
    void pushSessionToRust(s && userId ? { url: s.url, token: s.token, userId } : null);
  });
  onNuxtReady(() => void ensureSession());
});
