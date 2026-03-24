import { getSettingsStore } from "@/utils/store";

// --- Preferences as a single object for batch load/save ---
interface Preferences {
  methodId: number;
  city: string;
  country: string;
  extraTimezone: string;
  timeFormat: "24h" | "12h";
  showAdditionalTimes: boolean;
  locationMode: "city" | "gps";
  gpsLat: number | null;
  gpsLng: number | null;
  gpsCity: string | null;
}

const PREFERENCES_KEY = "preferences";

export function usePrayerTimes() {
  const state = usePrayerState();
  const display = usePrayerDisplay();
  const { fetchPrayerTimingsByCity, fetchByCoordinates, refreshInBackground } =
    usePrayerFetch();
  const { clearAllCache } = usePrayerCache();

  // --- Online/offline tracking ---
  function handleOnline() {
    state.isOffline.value = false;
    if (state.isStale.value) {
      refreshInBackground();
    }
  }

  function handleOffline() {
    state.isOffline.value = true;
  }

  onMounted(() => {
    state.isOffline.value =
      typeof navigator !== "undefined" && !navigator.onLine;
    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
    }
  });

  onBeforeUnmount(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    }
  });

  // --- Midnight rollover: auto-refetch when date changes ---
  watch(display.todayDateKey, () => {
    if (
      state.locationMode.value === "gps" &&
      state.gpsLat.value != null &&
      state.gpsLng.value != null
    ) {
      fetchByCoordinates(state.gpsLat.value, state.gpsLng.value);
    } else if (state.selectedCity.value && state.selectedCountry.value) {
      fetchPrayerTimingsByCity(
        state.selectedCity.value,
        state.selectedCountry.value,
        { methodId: state.selectedMethodId.value },
      );
    }
  });

  // --- Preferences load/save ---
  async function loadPreferences() {
    try {
      const store = await getSettingsStore();

      // Try new batch format first, fall back to individual keys
      const saved = await store.get<Preferences>(PREFERENCES_KEY);
      if (saved) {
        if (typeof saved.methodId === "number")
          state.selectedMethodId.value = saved.methodId;
        if (typeof saved.city === "string")
          state.selectedCity.value = saved.city;
        if (typeof saved.country === "string" && saved.country)
          state.selectedCountry.value = saved.country;
        if (typeof saved.extraTimezone === "string" && saved.extraTimezone)
          state.selectedExtraTimezone.value = saved.extraTimezone;
        if (saved.timeFormat === "24h" || saved.timeFormat === "12h")
          state.timeFormat.value = saved.timeFormat;
        if (typeof saved.showAdditionalTimes === "boolean")
          state.showAdditionalTimes.value = saved.showAdditionalTimes;
        if (saved.locationMode === "city" || saved.locationMode === "gps")
          state.locationMode.value = saved.locationMode;
        if (typeof saved.gpsLat === "number")
          state.gpsLat.value = saved.gpsLat;
        if (typeof saved.gpsLng === "number")
          state.gpsLng.value = saved.gpsLng;
        if (typeof saved.gpsCity === "string")
          state.gpsCity.value = saved.gpsCity;
        return;
      }

      // Migration: read individual keys from old format
      const method = await store.get<number>("methodId");
      const city = await store.get<string>("city");
      const country = await store.get<string>("country");
      const extraTz = await store.get<string>("extraTimezone");
      const fmt = await store.get<string>("timeFormat");
      const additionalTimes = await store.get<boolean>("showAdditionalTimes");
      const locMode = await store.get<string>("locationMode");
      const lat = await store.get<number>("gpsLat");
      const lng = await store.get<number>("gpsLng");
      const savedGpsCity = await store.get<string>("gpsCity");

      if (typeof method === "number") state.selectedMethodId.value = method;
      if (typeof city === "string") state.selectedCity.value = city;
      if (typeof country === "string" && country)
        state.selectedCountry.value = country;
      if (typeof extraTz === "string" && extraTz)
        state.selectedExtraTimezone.value = extraTz;
      if (fmt === "24h" || fmt === "12h") state.timeFormat.value = fmt;
      if (typeof additionalTimes === "boolean")
        state.showAdditionalTimes.value = additionalTimes;
      if (locMode === "city" || locMode === "gps")
        state.locationMode.value = locMode;
      if (typeof lat === "number") state.gpsLat.value = lat;
      if (typeof lng === "number") state.gpsLng.value = lng;
      if (typeof savedGpsCity === "string") state.gpsCity.value = savedGpsCity;

      // Save in new format for future loads
      await savePreferences();
    } catch (e) {
      console.warn("[usePrayerTimes] Failed to load preferences:", e);
    }
  }

  async function savePreferences() {
    try {
      const store = await getSettingsStore();
      const prefs: Preferences = {
        methodId: state.selectedMethodId.value,
        city: state.selectedCity.value,
        country: state.selectedCountry.value,
        extraTimezone: state.selectedExtraTimezone.value,
        timeFormat: state.timeFormat.value,
        showAdditionalTimes: state.showAdditionalTimes.value,
        locationMode: state.locationMode.value,
        gpsLat: state.gpsLat.value,
        gpsLng: state.gpsLng.value,
        gpsCity: state.gpsCity.value,
      };
      await store.set(PREFERENCES_KEY, prefs);
      if (store.save) await store.save();
    } catch (e) {
      console.warn("[usePrayerTimes] Failed to save preferences:", e);
    }
  }

  function clearTimings(): void {
    state.timings.value = null;
    state.dateReadable.value = null;
    state.timezone.value = null;
    state.methodName.value = null;
    state.fetchError.value = null;
    state.isStale.value = false;
  }

  // Auto-save preferences when any value changes
  watch(
    [
      state.selectedMethodId,
      state.selectedCity,
      state.selectedCountry,
      state.selectedExtraTimezone,
      state.timeFormat,
      state.showAdditionalTimes,
      state.locationMode,
      state.gpsLat,
      state.gpsLng,
      state.gpsCity,
    ],
    () => {
      void savePreferences();
    },
  );

  return {
    // state (from useState)
    isLoading: computed(() => state.isFetching.value),
    fetchError: state.fetchError,
    timings: state.timings,
    timezone: state.timezone,
    methodName: state.methodName,
    selectedMethodId: state.selectedMethodId,
    selectedCity: state.selectedCity,
    selectedCountry: state.selectedCountry,
    selectedExtraTimezone: state.selectedExtraTimezone,
    timeFormat: state.timeFormat,
    is24Hour: state.is24Hour,
    showAdditionalTimes: state.showAdditionalTimes,
    isStale: state.isStale,
    isOffline: state.isOffline,
    locationMode: state.locationMode,
    gpsLat: state.gpsLat,
    gpsLng: state.gpsLng,
    gpsCity: state.gpsCity,

    // display (from usePrayerDisplay)
    timingsList: display.timingsList,
    currentTimeString: display.currentTimeString,
    hijriDateVerbose: display.hijriDateVerbose,
    gregorianDateVerbose: display.gregorianDateVerbose,
    upcomingKey: display.upcomingKey,
    userTimezone: display.userTimezone,
    nextPrayerLabel: display.nextPrayerLabel,
    countdownToNext: display.countdownToNext,
    previousPrayerLabel: display.previousPrayerLabel,
    timeSincePrevious: display.timeSincePrevious,

    // actions
    fetchPrayerTimingsByCity,
    fetchByCoordinates,
    loadPreferences,
    savePreferences,
    clearTimings,
    clearCache: clearAllCache,
  };
}
