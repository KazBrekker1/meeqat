import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { listen } from "@tauri-apps/api/event";
import { getPlatform } from "@/utils/platform";
import { pushSessionToRust } from "@/utils/togetherNative";

/**
 * Desktop: keep the Rust call listener (src-tauri/src/together.rs) on the same
 * Together session as the main window — started on sign-in and every token
 * refresh, stopped on sign-out. The session is restored at launch, so alerts
 * work while Meeqat only sits in the menu bar. When the listener reports that the
 * server stopped accepting the session, it is renewed or cleared from here.
 */
export default defineNuxtPlugin(() => {
  if (getPlatform() !== "desktop" || getCurrentWebviewWindow().label !== "main") return;
  const { pb, ensureSession, onSessionChange, recoverExpiredSession } = useTogether();
  onSessionChange((s) => {
    const userId = pb().authStore.record?.id;
    void pushSessionToRust(s && userId ? { url: s.url, token: s.token, userId } : null);
  });
  void listen<{ userId?: string } | null>("together:session-expired", ({ payload }) => {
    void recoverExpiredSession(payload?.userId);
  }).catch((err) => console.warn("[together] can't listen for session expiry", err));
  onNuxtReady(() => void ensureSession());
});
