import { nextTick } from "vue";
import { cue } from "@/utils/sounds";

// Each new point takes the next number, so a slow place-name lookup for an
// earlier point can't overwrite the label of the current one.
let placeNameSeq = 0;

/**
 * Changing the place prayer times are shown for: a curated city, a picked point
 * (search, "Use my location", the map) or the City/GPS switch. Used by the
 * location dialog and by Settings; the state itself lives in usePrayerRuntime().
 */
export function useLocationActions() {
  const {
    fetchError,
    fetchPrayerTimingsByCity,
    fetchByCoordinates,
    selectedMethodId,
    selectedCity,
    selectedCountry,
    locationMode,
    gpsLat,
    gpsLng,
    gpsCity,
  } = usePrayerRuntime();
  const { reverseGeocode } = useGeolocation();

  function fetchByCity() {
    if (!selectedCity.value || !selectedCountry.value) return;
    return fetchPrayerTimingsByCity(selectedCity.value, selectedCountry.value, {
      methodId: selectedMethodId.value,
    });
  }

  function cueLocationSet() {
    if (!fetchError.value) cue("locationSet");
  }

  // Location selection handler (from unified LocationSelector)
  async function selectCity(city: string, countryCode: string) {
    selectedCity.value = city;
    selectedCountry.value = countryCode;
    await nextTick();
    await fetchByCity();
    cueLocationSet();
  }

  // GPS location handlers
  function setLocationMode(mode: 'city' | 'gps') {
    locationMode.value = mode;
    if (mode === 'gps' && gpsLat.value != null && gpsLng.value != null) {
      fetchByCoordinates(gpsLat.value, gpsLng.value);
    } else if (mode === 'city' && selectedCity.value && selectedCountry.value) {
      fetchByCity();
    }
  }

  /** Returns the fetch when one starts, so callers can react to it. */
  function setGpsLocation(coords: { lat: number; lng: number; label?: string } | null): Promise<void> | undefined {
    let fetching: Promise<void> | undefined;
    const seq = ++placeNameSeq;
    if (coords) {
      gpsLat.value = coords.lat;
      gpsLng.value = coords.lng;
      if (locationMode.value === 'gps') {
        fetching = fetchByCoordinates(coords.lat, coords.lng);
      }
      // Resolve the place name in the background unless the source already knew it.
      gpsCity.value = coords.label ?? null;
      if (!coords.label) {
        reverseGeocode(coords.lat, coords.lng).then((name) => {
          if (seq === placeNameSeq) gpsCity.value = name;
        });
      }
    } else {
      gpsLat.value = null;
      gpsLng.value = null;
      gpsCity.value = null;
    }
    return fetching;
  }

  // A place picked from search, "Use my location", or the map: coordinates mode.
  function selectPlace(place: { lat: number; lng: number; label?: string }) {
    locationMode.value = "gps";
    void setGpsLocation(place)?.then(cueLocationSet);
  }

  return { selectCity, selectPlace, setLocationMode, setGpsLocation };
}
