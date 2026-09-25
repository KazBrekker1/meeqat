import { invoke } from "@tauri-apps/api/core";
import { getPlatform } from "@/utils/platform";

/** What the desktop listener (src-tauri/src/together.rs) needs to act for the user. */
export interface NativeTogetherSession {
  /** Together service base URL, e.g. https://together.sanad.ink */
  url: string;
  /** PocketBase auth token (sent raw in `Authorization`). */
  token: string;
  userId: string;
}

/** An active call as the desktop listener reports it (`together:calls`, `together_get_calls`). */
export interface NativeActiveCall {
  id: string;
  roomId: string;
  roomName: string;
  prayer: string;
  place: string;
  status: "open" | "finalized";
  meetAt: string | null;
  organizerId: string;
  organizerName: string;
  created: string;
  going: number;
  joined: boolean;
}

/**
 * Hand the Together session to the desktop app's Rust listener (call alerts,
 * meeting reminders, the tray card) — `null` on sign-out. No-op outside desktop.
 */
export async function pushSessionToRust(session: NativeTogetherSession | null): Promise<void> {
  if (getPlatform() !== "desktop") return;
  try {
    if (session) {
      await invoke("together_set_session", { url: session.url, token: session.token, userId: session.userId });
    } else {
      await invoke("together_clear_session");
    }
  } catch (e) {
    console.error("[together] couldn't update the desktop listener:", e);
  }
}
