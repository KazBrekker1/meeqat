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

  // Persistence using Tauri Store (auto-imported helper from nuxt module)
  type TauriStore = {
    get<T>(key: string): Promise<T | undefined>;
    set(key: string, value: unknown): Promise<void>;
    save?: () => Promise<void>;
  };
  let storePromise: Promise<TauriStore> | null = null;
  function getStore(): Promise<TauriStore> {
    if (!storePromise) {
      // @ts-ignore -- auto-imported by nuxt-tauri module
      storePromise = (
        useTauriStoreLoad as unknown as (
          file: string,
          options?: { autoSave?: boolean }
        ) => Promise<TauriStore>
      )("settings.bin", { autoSave: true });
    }
    return storePromise;
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
      date?: string;
    }
  ) {
    isFetchingTimings.value = true;
    fetchError.value = null;
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const today = new Date();
      const dd = String(today.getDate()).padStart(2, "0");
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const yyyy = String(today.getFullYear());
      const dateParam = options?.date ?? `${dd}-${mm}-${yyyy}`;
      const methodId = options?.methodId ?? selectedMethodId.value; // default to selected
      const shafaq = options?.shafaq ?? "general";
      const calendarMethod = options?.calendarMethod ?? "UAQ";
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

      console.log({ url });

      const res = await $fetch<PrayerTimingsResponse>(url, { method: "GET" });
      if (!res || res.code !== 200) {
        throw new Error(res?.status || "Failed to fetch prayer times");
      }
      timings.value = res.data.timings;
      dateReadable.value = res.data.date.readable;
      timezone.value = res.data.meta.timezone;
      methodName.value = res.data.meta.method?.name || null;
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
    dateReadable,
    timezone,
    methodName,
    currentTimeString,
    hijriDateVerbose,
    selectedMethodId,
    selectedCity,
    selectedCountry,
    selectedExtraTimezone,

    // actions
    fetchPrayerTimingsByCity,
    loadPreferences,
    savePreferences,
    clearTimings,

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
