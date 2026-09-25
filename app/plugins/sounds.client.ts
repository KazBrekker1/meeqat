import { loadSoundsPreference } from "@/utils/sounds";

/** Applies the saved "Sounds" preference at startup, in every window. */
export default defineNuxtPlugin(() => {
  void loadSoundsPreference();
});
