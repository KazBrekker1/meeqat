import { COUNTRY_OPTIONS } from "@/constants/countries";
import { COUNTRY_TO_CITIES_DATA } from "@/constants/cities";

export interface PlaceResult {
  id: string;
  name: string;
  /** Country (or "Region, Country") shown under the name. */
  detail: string;
  flag: string;
  lat: number;
  lng: number;
  /** Set for the curated cities, which keep their own "city" location mode. */
  countryCode?: string;
  source: "local" | "remote";
}

// Built once: the curated cities are static.
const LOCAL: PlaceResult[] = COUNTRY_OPTIONS.flatMap((country) =>
  (COUNTRY_TO_CITIES_DATA[country.code] ?? []).map((c) => ({
    id: `${country.code}-${c.name}`,
    name: c.name,
    detail: country.name,
    flag: country.flag,
    lat: c.lat,
    lng: c.lng,
    countryCode: country.code,
    source: "local" as const,
  }))
);

function flagOf(countryCode?: string): string {
  if (!countryCode || countryCode.length !== 2) return "📍";
  return String.fromCodePoint(...[...countryCode.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

function normalise(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: { osm_id: number; name?: string; country?: string; countrycode?: string; state?: string };
};

/**
 * City search: the curated cities match instantly as you type; any other place on
 * earth comes from Photon (OpenStreetMap autocomplete, HTTPS + CORS, Arabic works)
 * after a short pause. Stale requests are aborted so results never arrive out of order.
 */
export function usePlaceSearch() {
  const query = ref("");
  const remote = shallowRef<PlaceResult[]>([]);
  const isSearching = ref(false);
  const remoteFailed = ref(false);

  const local = computed<PlaceResult[]>(() => {
    const q = normalise(query.value.trim());
    if (!q) return LOCAL;
    return LOCAL.filter((p) => normalise(p.name).includes(q) || normalise(p.detail).includes(q) || p.countryCode?.toLowerCase() === q);
  });

  // Remote results minus anything the curated list already shows (~same place).
  const more = computed<PlaceResult[]>(() =>
    remote.value.filter((r) => !local.value.some((l) => Math.abs(l.lat - r.lat) < 0.15 && Math.abs(l.lng - r.lng) < 0.15))
  );

  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  watch(query, (q) => {
    if (timer) clearTimeout(timer);
    controller?.abort();
    remoteFailed.value = false;
    const term = q.trim();
    if (term.length < 2) {
      remote.value = [];
      isSearching.value = false;
      return;
    }
    isSearching.value = true;
    timer = setTimeout(() => searchRemote(term), 280);
  });

  async function searchRemote(term: string) {
    controller = new AbortController();
    const signal = controller.signal;
    try {
      const res = await $fetch<{ features: PhotonFeature[] }>("https://photon.komoot.io/api/", {
        params: { q: term, limit: 8, layer: "city", lang: "en" },
        signal,
        timeout: 6000,
      });
      if (signal.aborted) return;
      remote.value = res.features
        .filter((f) => f.properties.name)
        .map((f) => ({
          id: `osm-${f.properties.osm_id}`,
          name: f.properties.name!,
          detail: [f.properties.state, f.properties.country].filter(Boolean).join(", "),
          flag: flagOf(f.properties.countrycode),
          lat: f.geometry.coordinates[1],
          lng: f.geometry.coordinates[0],
          source: "remote" as const,
        }));
    } catch {
      if (!signal.aborted) {
        remote.value = [];
        remoteFailed.value = true;
      }
    } finally {
      if (!signal.aborted) isSearching.value = false;
    }
  }

  onScopeDispose(() => {
    if (timer) clearTimeout(timer);
    controller?.abort();
  });

  return { query, local, more, isSearching, remoteFailed };
}
