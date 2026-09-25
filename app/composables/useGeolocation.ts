import { getPlatform } from "@/utils/platform";

export interface LocatedPosition {
  lat: number;
  lng: number;
  /** "Doha, Qatar" when the source already knows it (IP lookup), else resolve later. */
  label?: string;
}

/**
 * Cross-platform "where am I".
 *
 * City-level accuracy is all prayer times need, so this favours fast over precise:
 * - Desktop Tauri (macOS/Windows/Linux): the webview has no geolocation delegate,
 *   so navigator.geolocation only ever times out. Go straight to an IP lookup.
 * - Android / browser: coarse web geolocation (no high-accuracy GPS fix, which can
 *   take many seconds indoors), with the IP lookup already in flight as fallback.
 *
 * The IP lookup must be HTTPS: Android blocks cleartext and the desktop app runs on
 * a secure origin (the old http://ip-api.com fallback failed on both).
 */
export function useGeolocation() {
  const isLocating = ref(false);
  const error = ref<string | null>(null);

  /**
   * `precise`: device geolocation only, high accuracy, no IP fallback — for
   * Pray Together's 1 km room search, where a city-level guess is wrong.
   */
  async function getCurrentPosition(opts: { precise?: boolean } = {}): Promise<LocatedPosition | null> {
    if (!import.meta.client) return null;
    isLocating.value = true;
    error.value = null;
    try {
      if (opts.precise) {
        const result = hasWebGeolocation() ? await tryWebGeolocation(true) : null;
        if (!result) error.value = "Couldn't get your precise location. Allow location access for this site and retry.";
        return result;
      }
      const ip = tryIpGeolocation(); // start now; it's the fallback either way
      const web = hasWebGeolocation() ? await tryWebGeolocation() : null;
      const result = web ?? (await ip);
      if (!result) error.value = "Couldn't find your location. Check your connection, or pick it on the map.";
      return result;
    } finally {
      isLocating.value = false;
    }
  }

  function hasWebGeolocation(): boolean {
    if (!navigator.geolocation) return false;
    // Browser and Android only: desktop webviews have no geolocation delegate (it only
    // times out), and iOS isn't wired up yet.
    const p = getPlatform();
    return p === "web" || p === "android";
  }

  function tryWebGeolocation(precise = false): Promise<LocatedPosition | null> {
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude: lat, longitude: lng } = pos.coords;
          resolve(lat === 0 && lng === 0 ? null : { lat, lng });
        },
        () => resolve(null),
        precise
          ? { enableHighAccuracy: true, timeout: 15000, maximumAge: 60 * 1000 }
          : { enableHighAccuracy: false, timeout: 6000, maximumAge: 30 * 60 * 1000 }
      );
    });
  }

  async function tryIpGeolocation(): Promise<LocatedPosition | null> {
    try {
      const res = await $fetch<{ latitude?: string; longitude?: string; city?: string; country?: string }>(
        "https://get.geojs.io/v1/ip/geo.json",
        { timeout: 5000 }
      );
      const lat = Number(res.latitude);
      const lng = Number(res.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
      const label = [res.city, res.country].filter(Boolean).join(", ") || undefined;
      return { lat, lng, label };
    } catch {
      return null;
    }
  }

  async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
    try {
      const res = await $fetch<{
        address?: { city?: string; town?: string; village?: string; state?: string; country?: string };
      }>("https://nominatim.openstreetmap.org/reverse", {
        params: { format: "json", lat, lon: lng, zoom: 10, "accept-language": "en" },
        headers: { "User-Agent": "Meeqat (prayer-times-app)" },
        timeout: 5000,
      });
      const addr = res.address;
      if (!addr) return null;
      const city = addr.city || addr.town || addr.village || addr.state || null;
      const country = addr.country || null;
      if (city && country) return `${city}, ${country}`;
      return city || country;
    } catch {
      return null;
    }
  }

  return { getCurrentPosition, reverseGeocode, isLocating, error };
}
