export function usePrayerState() {
  // --- Core prayer data ---
  const timings = useState<Record<string, string> | null>(
    "prayer:timings",
    () => null,
  );
  const dateReadable = useState<string | null>(
    "prayer:dateReadable",
    () => null,
  );
  const timezone = useState<string | null>("prayer:timezone", () => null);
  const methodName = useState<string | null>("prayer:methodName", () => null);
  const fetchError = useState<string | null>("prayer:fetchError", () => null);
  const isFetching = useState("prayer:isFetching", () => false);
  const isStale = useState("prayer:isStale", () => false);
  const isOffline = useState("prayer:isOffline", () => false);

  // --- Preferences ---
  const selectedMethodId = useState("prayer:methodId", () => 4);
  const selectedCity = useState("prayer:city", () => "");
  const selectedCountry = useState("prayer:country", () => "");
  const selectedExtraTimezone = useState("prayer:extraTimezone", () => "");
  const timeFormat = useState<"24h" | "12h">("prayer:timeFormat", () => "24h");
  const showAdditionalTimes = useState(
    "prayer:showAdditionalTimes",
    () => false,
  );

  // --- GPS location ---
  const locationMode = useState<"city" | "gps">(
    "prayer:locationMode",
    () => "city",
  );
  const gpsLat = useState<number | null>("prayer:gpsLat", () => null);
  const gpsLng = useState<number | null>("prayer:gpsLng", () => null);
  const gpsCity = useState<string | null>("prayer:gpsCity", () => null);

  // --- Derived ---
  const is24Hour = computed(() => timeFormat.value === "24h");

  return {
    // core
    timings,
    dateReadable,
    timezone,
    methodName,
    fetchError,
    isFetching,
    isStale,
    isOffline,
    // preferences
    selectedMethodId,
    selectedCity,
    selectedCountry,
    selectedExtraTimezone,
    timeFormat,
    showAdditionalTimes,
    // GPS
    locationMode,
    gpsLat,
    gpsLng,
    gpsCity,
    // derived
    is24Hour,
  };
}
