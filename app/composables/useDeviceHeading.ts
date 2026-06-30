import { tryOnScopeDispose } from "@vueuse/core";

/**
 * Live device compass heading (degrees clockwise from true north), for the Qibla
 * compass. Degrades gracefully:
 *
 * - iOS (Safari/WKWebView) exposes `webkitCompassHeading` — already a true
 *   compass heading — but requires a user-gesture permission grant on iOS 13+.
 * - Android/Chromium expose absolute `deviceorientationabsolute` with `alpha`
 *   measured counter-clockwise from north, so heading = (360 - alpha).
 * - Desktops have no magnetometer: `heading` stays null and the UI shows a
 *   static, north-up bearing instead.
 */
export function useDeviceHeading() {
  const heading = ref<number | null>(null);
  const active = ref(false);
  const error = ref<string | null>(null);

  const isSupported =
    import.meta.client && typeof window.DeviceOrientationEvent !== "undefined";

  // iOS 13+ gates orientation behind an explicit permission request.
  const needsPermission =
    isSupported &&
    typeof (
      window.DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<PermissionState>;
      }
    ).requestPermission === "function";

  function onOrientation(event: DeviceOrientationEvent): void {
    const webkitHeading = (
      event as DeviceOrientationEvent & { webkitCompassHeading?: number }
    ).webkitCompassHeading;

    if (typeof webkitHeading === "number" && !Number.isNaN(webkitHeading)) {
      heading.value = (webkitHeading + 360) % 360;
      return;
    }

    if (event.absolute && event.alpha != null) {
      heading.value = (360 - event.alpha) % 360;
    }
  }

  function attach(): void {
    // `deviceorientationabsolute` gives true-north readings on Chromium; plain
    // `deviceorientation` is the iOS/webkit path.
    window.addEventListener(
      "deviceorientationabsolute",
      onOrientation as EventListener,
    );
    window.addEventListener("deviceorientation", onOrientation);
    active.value = true;
  }

  function stop(): void {
    if (!import.meta.client) return;
    window.removeEventListener(
      "deviceorientationabsolute",
      onOrientation as EventListener,
    );
    window.removeEventListener("deviceorientation", onOrientation);
    active.value = false;
  }

  /** Begin listening. On iOS this must be called from a user gesture. */
  async function start(): Promise<void> {
    if (!isSupported) {
      error.value = "Compass not available on this device";
      return;
    }
    error.value = null;
    try {
      if (needsPermission) {
        const req = (
          window.DeviceOrientationEvent as unknown as {
            requestPermission: () => Promise<PermissionState>;
          }
        ).requestPermission;
        const state = await req();
        if (state !== "granted") {
          error.value = "Compass permission denied";
          return;
        }
      }
      attach();
    } catch {
      error.value = "Could not start the compass";
    }
  }

  tryOnScopeDispose(stop);

  return { heading, active, error, isSupported, needsPermission, start, stop };
}
