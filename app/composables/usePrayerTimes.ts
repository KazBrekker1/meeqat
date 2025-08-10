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
  const timeFormat = ref<"24h" | "12h">("24h");

  const is24Hour = computed(() => timeFormat.value === "24h");

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
    formatTime(now.value, is24Hour, undefined, true)
  );

  // --- Athan audio ---
  const playedKeysForDate = new Set<string>();
  let lastPlayedDateKey = "";
  const isAthanActive = ref(false);
  const { startAthan, dismissAthan, testPlayAthan } =
    createAthanController(isAthanActive);

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

  function ddmmyyyyToYyyymmdd(ddmmyyyy: string): string | null {
    const m = ddmmyyyy.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (!m) return null;
    const [_, dd, mm, yyyy] = m;
    return `${yyyy}-${mm}-${dd}`;
  }

  async function ensureCacheForRange(params: {
    city: string;
    country: string;
    methodId: number;
    tz: string;
    shafaq: string;
    calendarMethod: string;
    startDate: Date;
    numDays: number;
  }): Promise<void> {
    const optionsKey = buildOptionsKey(params);
    const existing = await getCacheForOptions(optionsKey);

    for (let i = 0; i < params.numDays; i++) {
      const dateObj = addDays(params.startDate, i);
      const dateKey = getDateKey(dateObj);
      if (existing[dateKey]) continue;
      try {
        const dateParam = formatDdMmYyyy(dateObj);
        const url = buildTimingsByCityUrl(
          dateParam,
          params.city,
          params.country,
          params.methodId,
          params.shafaq,
          params.tz,
          params.calendarMethod
        );
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
      const fmt = await store.get<string>("timeFormat");
      if (typeof method === "number") selectedMethodId.value = method;
      if (typeof city === "string") selectedCity.value = city;
      if (typeof country === "string" && country)
        selectedCountry.value = country;
      if (typeof extraTz === "string" && extraTz) {
        selectedExtraTimezone.value = extraTz;
      }
      if (fmt === "24h" || fmt === "12h") {
        timeFormat.value = fmt;
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
      await store.set("timeFormat", timeFormat.value);
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
    [
      selectedMethodId,
      selectedCity,
      selectedCountry,
      selectedExtraTimezone,
      timeFormat,
    ],
    () => {
      void savePreferences();
    }
  );

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
      const url = buildTimingsByCityUrl(
        dateParam,
        city,
        country,
        methodId,
        shafaq,
        tz,
        calendarMethod
      );
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

  const { nowMinutes, nowSecondsOfDay } = buildCurrentTimeRefs(now);

  const userTimezone = computed(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone
  );

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
    const formatted = formatDateInTimezone(base, is24Hour, targetTz);
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
        const display =
          typeof minutes === "number"
            ? formatMinutesLocal(minutes as number, is24Hour)
            : timeStr;
        return {
          key,
          label,
          time: display,
          minutes,
          altTime: computeAltTimeForTimezone(
            timeStr,
            selectedExtraTimezone.value
          ),
        } as PrayerTimingItem;
      });

    const nowS = nowSecondsOfDay.value;
    let nextIndex = list.findIndex((t) =>
      typeof t.minutes === "number" ? (t.minutes as number) * 60 > nowS : false
    );
    if (nextIndex === -1) nextIndex = 0; // wrap to next day (tomorrow's first prayer)

    return list.map((t, idx) => ({
      ...t,
      isPast:
        typeof t.minutes === "number"
          ? (idx < nextIndex && nextIndex !== 0) ||
            (nextIndex === 0 && (t.minutes as number) * 60 < nowS)
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
    timeFormat,
    is24Hour,

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
