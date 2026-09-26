import { ref } from "vue";
import { getSettingsStore } from "@/utils/store";
import { isNative } from "@/utils/platform";
import { isMoonStyle, type MoonStyle } from "@/utils/moon/styles";

export type { MoonStyle };

const PREF_KEY = "moonStyle";
/** Tauri event carrying the new style to every window (the tray popover is its own webview). */
const CHANGED_EVENT = "meeqat:moon-style";
const DEFAULT: MoonStyle = "glass";

/** Names for the Settings picker, in picker order. */
export const MOON_STYLE_OPTIONS: { value: MoonStyle; label: string }[] = [
  { value: "glass", label: "Soft glass" },
  { value: "photo", label: "Photo" },
  { value: "engraved", label: "Engraved" },
  { value: "duotone", label: "Duotone" },
  { value: "stipple", label: "Stipple" },
  { value: "manuscript", label: "Manuscript" },
];

/** The "Moon style" preference (default soft glass); every MoonSphere follows it. */
export const moonStyle = ref<MoonStyle>(DEFAULT);

/** Reads the preference from the settings store (shared by every window). */
export async function loadMoonStylePreference(): Promise<void> {
  try {
    const v = await (await getSettingsStore()).get<string>(PREF_KEY);
    moonStyle.value = isMoonStyle(v) ? v : DEFAULT;
  } catch (e) {
    console.warn("[moon] Failed to load style preference:", e);
  }
}

export async function saveMoonStylePreference(style: MoonStyle): Promise<void> {
  moonStyle.value = style;
  try {
    const store = await getSettingsStore();
    await store.set(PREF_KEY, style);
    if (store.save) await store.save();
    if (isNative()) {
      const { emit } = await import("@tauri-apps/api/event");
      await emit(CHANGED_EVENT, style);
    }
  } catch (e) {
    console.warn("[moon] Failed to save style preference:", e);
  }
}

/**
 * Loads the preference and keeps this window in step with changes made in another one:
 * a Tauri event in the apps (main window → tray popover), the storage event on the web (other tabs).
 */
export async function watchMoonStylePreference(): Promise<void> {
  await loadMoonStylePreference();
  if (isNative()) {
    try {
      const { listen } = await import("@tauri-apps/api/event");
      await listen<string>(CHANGED_EVENT, ({ payload }) => {
        if (isMoonStyle(payload)) moonStyle.value = payload;
      });
    } catch (e) {
      console.warn("[moon] Failed to listen for style changes:", e);
    }
  } else {
    window.addEventListener("storage", (e) => {
      if (e.key === null || e.key === "localStore:settings.bin") void loadMoonStylePreference();
    });
  }
}
