import { getPlatform } from "@/utils/platform";

// Rooms are web-only for Phase 3 (native sign-in lands in Phase 4). Redirecting
// in middleware, before the page mounts, mirrors desktop-only.ts.
export default defineNuxtRouteMiddleware(() => {
  if (getPlatform() !== "web") return navigateTo("/", { replace: true });
});
