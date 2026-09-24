import { getPlatform } from "@/utils/platform";

// Pages that only exist inside the desktop app (the tray popover). Redirecting in
// middleware, before the page mounts, avoids interrupting the page transition —
// an in-page `await navigateTo()` left the web app on a blank/half-rendered screen.
export default defineNuxtRouteMiddleware(() => {
  if (getPlatform() !== "desktop") return navigateTo("/", { replace: true });
});
