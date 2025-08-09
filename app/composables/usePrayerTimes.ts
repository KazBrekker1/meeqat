export interface PrayerTimingsResponse {
  code: number;
  status: string;
  data: {
    timings: Record<string, string>;
    date: {
      readable: string;
      timestamp: string;
      gregorian: { date: string };
      hijri: { date: string };
    };
    meta: {
      timezone: string;
      method: { id: number; name: string };
      latitude: number;
      longitude: number;
    };
  };
}

export interface PrayerTimingItem {
  key: string;
  label: string;
  time: string;
  minutes?: number;
  isPast?: boolean;
  isNext?: boolean;
  altTime?: string;
}

export function usePrayerTimes() {
  const fetchError = ref<string | null>(null);
  const isFetchingTimings = ref(false);
  const timings = ref<Record<string, string> | null>(null);
  const dateReadable = ref<string | null>(null);
  const timezone = ref<string | null>(null);
  const methodName = ref<string | null>(null);
  const selectedMethodId = ref<number>(4);
  const selectedCity = ref<string>("");
  const selectedCountry = ref<string>("");
  const selectedExtraTimezone = ref<string>("");

  // Track current time to compute upcoming/past
  const now = ref<Date>(new Date());
  let intervalId: ReturnType<typeof setInterval> | null = null;
  onMounted(() => {
    intervalId = setInterval(() => {
      now.value = new Date();
    }, 1000);
  });
  onBeforeUnmount(() => {
    if (intervalId) clearInterval(intervalId);
  });
  const currentTimeString = computed(() =>
    now.value.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  );

  // --- Athan audio (simple Web Audio tone sequence) ---
  let audioContext: AudioContext | null = null;
  const playedKeysForDate = new Set<string>();
  let lastPlayedDateKey = "";
  let athanIntervalId: number | null = null;
  let masterGain: GainNode | null = null;
  const isAthanActive = ref(false);

  function getDateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function ensureAudioContext(): AudioContext {
    const Ctor: any =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) {
      throw new Error("Web Audio API not supported");
    }
    if (!audioContext) {
      audioContext = new Ctor();
    }
    if (audioContext!.state === "suspended") void audioContext!.resume();
    return audioContext!;
  }

  function playAthanPattern(ctx: AudioContext, targetGain: GainNode): number {
    const startAt = ctx.currentTime + 0.01;
    const notes = [523.25, 659.25, 783.99, 659.25, 523.25];
    const tone = 0.4; // seconds per note
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, startAt + i * tone);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, startAt + i * tone);
      g.gain.exponentialRampToValueAtTime(0.25, startAt + i * tone + 0.05);
      g.gain.exponentialRampToValueAtTime(
        0.01,
        startAt + (i + 1) * tone - 0.05
      );
      osc.connect(g);
      g.connect(targetGain);
      osc.start(startAt + i * tone);
      osc.stop(startAt + (i + 1) * tone);
    });
    return notes.length * tone; // seconds for one loop
  }

  function startAthan(): void {
    try {
      if (isAthanActive.value) return;
      const ctx = ensureAudioContext();
      masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.0001, ctx.currentTime);
      masterGain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.2);
      masterGain.connect(ctx.destination);
      const loopSeconds = playAthanPattern(ctx, masterGain);
      athanIntervalId = window.setInterval(() => {
        if (!masterGain) return;
        playAthanPattern(ctx, masterGain);
      }, Math.max(250, Math.floor(loopSeconds * 1000)));
      isAthanActive.value = true;
    } catch {
      // ignore
    }
  }

  function dismissAthan(): void {
    const ctx = audioContext;
    if (athanIntervalId != null) {
      clearInterval(athanIntervalId);
      athanIntervalId = null;
    }
    if (ctx && masterGain) {
      try {
        const t = ctx.currentTime;
        masterGain.gain.setTargetAtTime(0.0001, t, 0.05);
        setTimeout(() => {
          try {
            masterGain && masterGain.disconnect();
          } catch {}
          masterGain = null;
        }, 300);
      } catch {}
    }
    isAthanActive.value = false;
  }

  function testPlayAthan(): void {
    startAthan();
  }

  const hijriDateVerbose = computed<string | null>(() => {
    try {
      return new Intl.DateTimeFormat("en-US", {
        calendar: "islamic-umalqura",
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(now.value);
    } catch {
      return null;
    }
  });

  const gregorianDateVerbose = computed<string | null>(() => {
    try {
      return new Intl.DateTimeFormat("en-US", {
        calendar: "gregory",
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(now.value);
    } catch {
      return null;
    }
  });

  // Persistence using Tauri Store (auto-imported helper from nuxt module)
  type TauriStore = {
    get<T>(key: string): Promise<T | undefined>;
    set(key: string, value: unknown): Promise<void>;
    clear: () => Promise<void>;
    save?: () => Promise<void>;
  };
  let storePromise: Promise<TauriStore> | null = null;

  function isTauriAvailable(): boolean {
    if (typeof window === "undefined") return false;
    const w = window as any;
    return Boolean(w.__TAURI__?.core?.invoke || w.__TAURI_INTERNALS__?.invoke);
  }

  function createWebFallbackStore(localKey = "settings.bin"): TauriStore {
    const storageKey = `localStore:${localKey}`;
    function readAll(): Record<string, unknown> {
      if (typeof window === "undefined") return {};
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object")
          return parsed as Record<string, unknown>;
      } catch {}
      return {};
    }
    async function writeAll(obj: Record<string, unknown>): Promise<void> {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(obj));
      } catch {}
    }
    return {
      async get<T>(key: string): Promise<T | undefined> {
        const all = readAll();
        return all[key] as T | undefined;
      },
      async set(key: string, value: unknown): Promise<void> {
        const all = readAll();
        all[key] = value;
        await writeAll(all);
      },
      async save() {
        // no-op since we persist on set
      },
      async clear() {
        window.localStorage.removeItem(storageKey);
      },
    } as TauriStore;
  }

  function getStore(): Promise<TauriStore> {
    if (!storePromise) {
      if (!isTauriAvailable()) {
        storePromise = Promise.resolve(createWebFallbackStore("settings.bin"));
      } else {
        storePromise = useTauriStoreLoad("settings.bin", { autoSave: true });
      }
    }
    return storePromise;
  }

  type CachedDay = {
    timings: Record<string, string>;
    dateReadable: string;
    timezone: string;
    methodName: string | null;
    savedAt: number;
  };

  type CacheMap = Record<string, CachedDay>; // key: YYYY-MM-DD

  function normalizeKeyPart(s: string): string {
    return s.trim().toLowerCase();
  }

  function buildOptionsKey(params: {
    city: string;
    country: string;
    methodId: number;
    tz: string;
    shafaq: string;
    calendarMethod: string;
  }): string {
    // Stable, human-readable compound key
    const city = normalizeKeyPart(params.city);
    const country = normalizeKeyPart(params.country);
    const method = String(params.methodId);
    const tz = params.tz;
    const sh = params.shafaq;
    const cal = params.calendarMethod;
    return `v1|${country}|${city}|m=${method}|tz=${tz}|sh=${sh}|cal=${cal}`;
  }

  async function getCacheForOptions(optionsKey: string): Promise<CacheMap> {
    const store = await getStore();
    const key = `prayerCache:${optionsKey}`;
    const existing = (await store.get<CacheMap>(key)) ?? {};
    return existing;
  }

  async function setCacheForOptions(
    optionsKey: string,
    cache: CacheMap
  ): Promise<void> {
    const store = await getStore();
    const key = `prayerCache:${optionsKey}`;
    await store.set(key, cache);
    if (store.save) await store.save();
  }

  // Removed calendarByCity types and fetch; we fetch per-day using timingsByCity

  function ddmmyyyyToYyyymmdd(ddmmyyyy: string): string | null {
    const m = ddmmyyyy.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (!m) return null;
    const [_, dd, mm, yyyy] = m;
    return `${yyyy}-${mm}-${dd}`;
  }

  function formatDdMmYyyy(d: Date): string {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = String(d.getFullYear());
    return `${dd}-${mm}-${yyyy}`;
  }

  function parseYyyyMmDd(
    yyyyMmDd: string
  ): { year: number; month: number; day: number } | null {
    const m = yyyyMmDd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      !Number.isFinite(day)
    ) {
      return null;
    }
    return { year, month, day };
  }

  function addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  // Removed calendarByCity helpers. We will fill cache day-by-day using timingsByCity.

  async function ensureCacheForRange(params: {
    city: string;
    country: string;
    methodId: number;
    tz: string;
    shafaq: string;
    calendarMethod: string;
    startDate: Date;
    numDays: number; // e.g., 35
  }): Promise<void> {
    const optionsKey = buildOptionsKey(params);
    const existing = await getCacheForOptions(optionsKey);

    // Fetch per day using timingsByCity for the requested range
    for (let i = 0; i < params.numDays; i++) {
      const dateObj = addDays(params.startDate, i);
      const dateKey = getDateKey(dateObj);
      if (existing[dateKey]) continue;
      try {
        const dateParam = formatDdMmYyyy(dateObj);
        const url = `https://api.aladhan.com/v1/timingsByCity/${encodeURIComponent(
          dateParam
        )}?city=${encodeURIComponent(params.city)}&country=${encodeURIComponent(
          params.country
        )}&method=${encodeURIComponent(
          String(params.methodId)
        )}&shafaq=${encodeURIComponent(
          params.shafaq
        )}&timezonestring=${encodeURIComponent(
          params.tz
        )}&calendarMethod=${encodeURIComponent(params.calendarMethod)}`;
        const res = await $fetch<PrayerTimingsResponse>(url, { method: "GET" });
        if (!res || res.code !== 200) continue;
        existing[dateKey] = {
          timings: res.data.timings,
          dateReadable: res.data.date.readable,
          timezone: res.data.meta.timezone,
          methodName: res.data.meta.method?.name ?? null,
          savedAt: Date.now(),
        };
      } catch {
        // ignore per-day errors
      }
    }

    await setCacheForOptions(optionsKey, existing);
  }

  async function loadPreferences() {
    try {
      const store = await getStore();
      const method = await store.get<number>("methodId");
      const city = await store.get<string>("city");
      const country = await store.get<string>("country");
      const extraTz = await store.get<string>("extraTimezone");
      if (typeof method === "number") selectedMethodId.value = method;
      if (typeof city === "string") selectedCity.value = city;
      if (typeof country === "string" && country)
        selectedCountry.value = country;
      if (typeof extraTz === "string" && extraTz) {
        selectedExtraTimezone.value = extraTz;
      }
    } catch {
      // ignore
    }
  }

  async function savePreferences() {
    try {
      const store = await getStore();
      await store.set("methodId", selectedMethodId.value);
      await store.set("city", selectedCity.value);
      await store.set("country", selectedCountry.value ?? "");
      await store.set("extraTimezone", selectedExtraTimezone.value ?? "");
      if (store.save) await store.save();
    } catch {
      // ignore
    }
  }

  async function clearCache() {
    const store = await getStore();
    await store.clear();
  }

  watch(
    [selectedMethodId, selectedCity, selectedCountry, selectedExtraTimezone],
    () => {
      void savePreferences();
    }
  );

  // Geolocation-based fetching removed; rely on user-provided city and country

  async function fetchPrayerTimingsByCity(
    city: string,
    country: string,
    options?: {
      methodId?: number;
      shafaq?: string;
      calendarMethod?: string;
      date?: string; // dd-mm-yyyy
    }
  ) {
    isFetchingTimings.value = true;
    fetchError.value = null;
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const methodId = options?.methodId ?? selectedMethodId.value;
      const shafaq = options?.shafaq ?? "general";
      const calendarMethod = options?.calendarMethod ?? "UAQ";

      // Determine target date key (YYYY-MM-DD)
      let targetDateKey: string;
      if (options?.date) {
        targetDateKey =
          ddmmyyyyToYyyymmdd(options.date) ?? getDateKey(new Date());
      } else {
        targetDateKey = getDateKey(new Date());
      }

      const optionsKey = buildOptionsKey({
        city,
        country,
        methodId,
        tz,
        shafaq,
        calendarMethod,
      });

      // 1) Try cache first
      const cache = await getCacheForOptions(optionsKey);

      const cached = cache[targetDateKey];
      if (cached) {
        timings.value = cached.timings;
        dateReadable.value = cached.dateReadable;
        timezone.value = cached.timezone;
        methodName.value = cached.methodName;
        // Proactively ensure the next 5 weeks are cached (non-blocking) if online
        try {
          let needsFill = false;
          const parsed = parseYyyyMmDd(targetDateKey);
          const horizonStart = parsed
            ? new Date(parsed.year, parsed.month - 1, parsed.day)
            : new Date();
          for (let i = 0; i < 35; i++) {
            const dk = getDateKey(addDays(horizonStart, i));
            if (!cache[dk]) {
              needsFill = true;
              break;
            }
          }
          if (
            needsFill &&
            (typeof navigator === "undefined" || navigator.onLine !== false)
          ) {
            void ensureCacheForRange({
              city,
              country,
              methodId,
              tz,
              shafaq,
              calendarMethod,
              startDate: horizonStart,
              numDays: 10,
            });
          }
        } catch {
          // ignore background prefill errors
        }
        return; // cache hit → done
      }

      // 2) On miss: if offline, bail with friendly error
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        throw new Error("Offline: no cached prayer times available for today.");
      }

      // 3) Fetch and cache 5 more weeks starting from the target date
      const parsedTarget = parseYyyyMmDd(targetDateKey);
      const startDate = parsedTarget
        ? new Date(parsedTarget.year, parsedTarget.month - 1, parsedTarget.day)
        : new Date();
      await ensureCacheForRange({
        city,
        country,
        methodId,
        tz,
        shafaq,
        calendarMethod,
        startDate,
        numDays: 10,
      });

      // Reload cache and apply today's timings
      const refreshed = await getCacheForOptions(optionsKey);
      const todayCached = refreshed[targetDateKey];
      if (todayCached) {
        timings.value = todayCached.timings;
        dateReadable.value = todayCached.dateReadable;
        timezone.value = todayCached.timezone;
        methodName.value = todayCached.methodName;
        return;
      }

      // 4) Safety fallback: fetch single day if monthly failed
      const today = new Date();
      const dd = String(today.getDate()).padStart(2, "0");
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const yyyy = String(today.getFullYear());
      const dateParam = `${dd}-${mm}-${yyyy}`;
      const url = `https://api.aladhan.com/v1/timingsByCity/${encodeURIComponent(
        dateParam
      )}?city=${encodeURIComponent(city)}&country=${encodeURIComponent(
        country
      )}&method=${encodeURIComponent(
        String(methodId)
      )}&shafaq=${encodeURIComponent(
        shafaq
      )}&timezonestring=${encodeURIComponent(
        tz
      )}&calendarMethod=${encodeURIComponent(calendarMethod)}`;
      const res = await $fetch<PrayerTimingsResponse>(url, { method: "GET" });
      console.log("res", { res });
      if (!res || res.code !== 200) {
        throw new Error(res?.status || "Failed to fetch prayer times");
      }

      // Update state
      timings.value = res.data.timings;
      dateReadable.value = res.data.date.readable;
      timezone.value = res.data.meta.timezone;
      methodName.value = res.data.meta.method?.name || null;

      // Also persist to cache
      const map = await getCacheForOptions(optionsKey);
      map[targetDateKey] = {
        timings: res.data.timings,
        dateReadable: res.data.date.readable,
        timezone: res.data.meta.timezone,
        methodName: res.data.meta.method?.name || null,
        savedAt: Date.now(),
      };
      await setCacheForOptions(optionsKey, map);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      fetchError.value = message;
      timings.value = null;
    } finally {
      isFetchingTimings.value = false;
    }
  }

  // requestLocationAndFetch removed

  const isLoading = computed(() => isFetchingTimings.value);

  function clearTimings(): void {
    timings.value = null;
    dateReadable.value = null;
    timezone.value = null;
    methodName.value = null;
    fetchError.value = null;
  }

  function parseTimeToMinutes(raw: string | undefined): number | null {
    if (!raw) return null;
    // Handle possible formats like "05:23" or "5:23" or with suffixes
    const cleaned = raw.trim();
    // 12h with AM/PM
    const ampmMatch = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (ampmMatch) {
      let hours = Number(ampmMatch[1]);
      const minutes = Number(ampmMatch[2]);
      const isPM = ampmMatch[3]?.toUpperCase() === "PM";
      if (hours === 12) hours = 0; // 12AM -> 0, 12PM handled by +12
      const total = (isPM ? hours + 12 : hours) * 60 + minutes;
      return total;
    }
    // 24h
    const parts = cleaned.match(/^(\d{1,2}):(\d{2})/);
    if (!parts) return null;
    const h = Number(parts[1]);
    const m = Number(parts[2]);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  }

  const nowMinutes = computed(
    () => now.value.getHours() * 60 + now.value.getMinutes()
  );

  const userTimezone = computed(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone
  );

  function formatDateInTimezone(date: Date, tz: string): string {
    try {
      return new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: tz,
      }).format(date);
    } catch {
      // Fallback to local formatting if tz invalid
      return date
        .toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
        .replace(/^24:/, "00:");
    }
  }

  function computeAltTimeForTimezone(
    timeStr: string,
    targetTz: string | null
  ): string | undefined {
    if (!targetTz) return undefined;
    if (targetTz === userTimezone.value) return undefined;
    const mins = parseTimeToMinutes(timeStr);
    if (mins == null) return undefined;
    const base = new Date();
    base.setSeconds(0, 0);
    base.setHours(0, 0, 0, 0);
    base.setMinutes(mins);
    const formatted = formatDateInTimezone(base, targetTz);
    return formatted;
  }

  const timingsList = computed<PrayerTimingItem[]>(() => {
    if (!timings.value) return [];
    const order = [
      ["Fajr", "Fajr"],
      ["Sunrise", "Sunrise"],
      ["Dhuhr", "Dhuhr"],
      ["Asr", "Asr"],
      ["Maghrib", "Maghrib"],
      ["Isha", "Isha"],
    ] as Array<[string, string]>;
    const list = order
      .filter(([key]) => Boolean(timings.value?.[key]))
      .map(([key, label]) => {
        const timeStr = (timings.value?.[key] ?? "") as string;
        const minutes = parseTimeToMinutes(timeStr) ?? undefined;
        return {
          key,
          label,
          time: timeStr,
          minutes,
          altTime: computeAltTimeForTimezone(
            timeStr,
            selectedExtraTimezone.value
          ),
        } as PrayerTimingItem;
      });

    // Determine next upcoming prayer
    const nowM = nowMinutes.value;
    let nextIndex = list.findIndex((t) =>
      typeof t.minutes === "number" ? (t.minutes as number) >= nowM : false
    );
    if (nextIndex === -1) nextIndex = 0; // wrap to next day

    return list.map((t, idx) => ({
      ...t,
      isPast:
        typeof t.minutes === "number"
          ? (idx < nextIndex && nextIndex !== 0) ||
            (nextIndex === 0 && (t.minutes as number) < nowM)
          : false,
      isNext: idx === nextIndex,
    }));
  });

  const upcomingKey = computed(
    () => timingsList.value.find((t) => t.isNext)?.key ?? null
  );

  const nextPrayerLabel = computed<string | null>(() => {
    const next = timingsList.value.find((t) => t.isNext);
    return next?.label ?? null;
  });

  const countdownToNext = computed<string | null>(() => {
    const next = timingsList.value.find((t) => t.isNext);
    if (!next || typeof next.minutes !== "number") return null;
    const target = new Date(now.value);
    target.setHours(0, 0, 0, 0);
    target.setMinutes(next.minutes as number, 0, 0);
    if (target.getTime() <= now.value.getTime()) {
      target.setDate(target.getDate() + 1);
    }
    const diffMs = Math.max(0, target.getTime() - now.value.getTime());
    const totalSeconds = Math.floor(diffMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const hh = String(hours).padStart(2, "0");
    const mm = String(minutes).padStart(2, "0");
    const ss = String(seconds).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  });

  // Trigger Athan at exact minute of any listed time
  watch([now, timingsList], () => {
    if (!timingsList.value.length) return;
    const key = getDateKey(now.value);
    if (key !== lastPlayedDateKey) {
      playedKeysForDate.clear();
      lastPlayedDateKey = key;
    }
    if (now.value.getSeconds() !== 0) return; // only check once per minute
    const currentMins = now.value.getHours() * 60 + now.value.getMinutes();
    const match = timingsList.value.find(
      (t) =>
        typeof t.minutes === "number" && (t.minutes as number) === currentMins
    );
    if (match && !playedKeysForDate.has(match.key)) {
      playedKeysForDate.add(match.key);
      startAthan();
    }
  });

  return {
    // state
    isLoading,
    fetchError,
    timings,
    timingsList,
    timezone,
    methodName,
    currentTimeString,
    hijriDateVerbose,
    gregorianDateVerbose,
    selectedMethodId,
    selectedCity,
    selectedCountry,
    selectedExtraTimezone,

    // actions
    fetchPrayerTimingsByCity,
    loadPreferences,
    savePreferences,
    clearTimings,
    clearCache,

    // derived
    upcomingKey,
    userTimezone,
    nextPrayerLabel,
    countdownToNext,

    // audio
    testPlayAthan,
    isAthanActive,
    startAthan,
    dismissAthan,
  };
}
