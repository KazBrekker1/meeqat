import { watchMoonStylePreference } from "@/utils/moonStyle";

/** Applies the saved "Moon style" in every window (main and tray) and follows later changes. */
export default defineNuxtPlugin(() => {
  void watchMoonStylePreference();
});
