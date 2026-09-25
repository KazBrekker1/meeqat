import { getPlatform } from "@/utils/platform";

// Pages that only make sense in a browser (the native apps' sign-in hand-off).
// Redirecting in middleware, before the page mounts, mirrors desktop-only.ts.
export default defineNuxtRouteMiddleware(() => {
  if (getPlatform() !== "web") return navigateTo("/", { replace: true });
});
