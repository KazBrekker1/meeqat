/**
 * Cross-platform geolocation composable.
 *
 * Strategy (in order):
 * 1. navigator.geolocation (Web API) — works on Android via wry's WebChromeClient,
 *    and in browser dev mode. Fails on macOS/Windows WKWebView (no delegate).
 * 2. IP-based geolocation via ip-api.com — works everywhere with internet access,
 *    gives city-level accuracy (~1-5km). User can fine-tune on the map.
 */
export function useGeolocation() {
  const isLocating = ref(false);
  const error = ref<string | null>(null);

  async function getCurrentPosition(): Promise<{ lat: number; lng: number } | null> {
    if (!import.meta.client) {
      error.value = 'Geolocation not supported';
      return null;
    }
    isLocating.value = true;
    error.value = null;

    // Strategy 1: Web Geolocation API (works on Android WebView + browser)
    const webResult = await tryWebGeolocation();
    if (webResult) {
      isLocating.value = false;
      return webResult;
    }

    // Strategy 2: IP-based geolocation (works everywhere, approximate)
    const ipResult = await tryIpGeolocation();
    if (ipResult) {
      isLocating.value = false;
      return ipResult;
    }

    if (!error.value) {
      error.value = 'Could not determine location';
    }
    isLocating.value = false;
    return null;
  }

  async function tryWebGeolocation(): Promise<{ lat: number; lng: number } | null> {
    if (!navigator.geolocation) return null;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 300000,
        });
      });
      if (pos.coords.latitude === 0 && pos.coords.longitude === 0) return null;
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch {
      return null;
    }
  }

  async function tryIpGeolocation(): Promise<{ lat: number; lng: number } | null> {
    try {
      const res = await $fetch<{ status: string; lat: number; lon: number }>(
        'http://ip-api.com/json/?fields=status,lat,lon',
        { timeout: 5000 }
      );
      if (res.status === 'success' && (res.lat !== 0 || res.lon !== 0)) {
        return { lat: res.lat, lng: res.lon };
      }
      return null;
    } catch {
      error.value = 'Could not determine location from network';
      return null;
    }
  }

  async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
    try {
      const res = await $fetch<{
        address?: { city?: string; town?: string; village?: string; state?: string; country?: string };
      }>('https://nominatim.openstreetmap.org/reverse', {
        params: { format: 'json', lat, lon: lng, zoom: 10, 'accept-language': 'en' },
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
