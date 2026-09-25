import { ref } from "vue";
import { play, setEnabled, setVolume, type SoundName } from "cuelume";
import { getSettingsStore } from "@/utils/store";

/** App events → Cuelume sounds. Call sites name the event, never the sound. */
const CUES = {
  callStarted: "arrival",
  callJoined: "success",
  callLeft: "release",
  voted: "tick",
  callFinalized: "bloom",
  messageIn: "droplet",
  messageSent: "whisper",
  meetingReminder: "chime",
  prayerTime: "chime",
  copied: "sparkle",
  toggled: "toggle",
  error: "error",
  signedIn: "ready",
  updateReady: "ready",
  locationSet: "success",
} as const satisfies Record<string, SoundName>;

export type SoundEvent = keyof typeof CUES;

const PREF_KEY = "soundsEnabled";

/** The "Sounds" preference (default on), shared with Settings. */
export const soundsEnabled = ref(true);

setVolume(0.6);

/**
 * Plays the sound for an app event. Only while the page is visible: when it's
 * hidden, system notifications already make a sound. Cuelume itself is a no-op
 * without Web Audio.
 */
export function cue(event: SoundEvent): void {
  if (typeof document === "undefined" || document.visibilityState !== "visible") return;
  play(CUES[event]);
}

function apply(on: boolean): void {
  soundsEnabled.value = on;
  setEnabled(on);
}

/** Reads the preference from the settings store (shared by every window) and applies it. */
export async function loadSoundsPreference(): Promise<void> {
  try {
    apply((await (await getSettingsStore()).get<boolean>(PREF_KEY)) !== false);
  } catch (e) {
    console.warn("[sounds] Failed to load preference:", e);
  }
}

export async function saveSoundsPreference(on: boolean): Promise<void> {
  apply(on);
  try {
    const store = await getSettingsStore();
    await store.set(PREF_KEY, on);
    if (store.save) await store.save();
  } catch (e) {
    console.warn("[sounds] Failed to save preference:", e);
  }
}
