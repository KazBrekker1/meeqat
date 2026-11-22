<template>
  <section>
    <p class="text-[11px] uppercase tracking-wider text-muted mb-1.5">Add to calendar</p>
    <div class="rounded-xl bg-elevated border border-default p-3 space-y-3">
      <p class="text-xs text-muted">
        Each prayer appears in your calendar as a 30-minute block starting 10 minutes after the athan, with a reminder 10 minutes before the athan, and stays up to date.
      </p>
      <div class="flex items-center justify-between gap-3">
        <p class="text-sm">Days to include</p>
        <div class="flex items-center gap-2">
          <UInput
            v-if="isCustom"
            v-model="customDays"
            type="text"
            inputmode="numeric"
            maxlength="2"
            size="sm"
            class="w-20"
            :ui="{ base: 'tabular-nums', trailing: 'pointer-events-none' }"
            :aria-label="`Number of days, ${CALENDAR_DAYS_MIN} to ${CALENDAR_DAYS_MAX}`"
            @blur="tidyCustomDays"
            @keydown.enter="tidyCustomDays"
          >
            <template #trailing>
              <span class="text-xs text-muted">days</span>
            </template>
          </UInput>
          <USelect v-model="selectedRange" :items="rangeOptions" size="sm" class="w-32" aria-label="Days to include" />
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton size="sm" variant="soft" icon="i-lucide-calendar-plus" @click="openApple">
          Apple Calendar
        </UButton>
        <UButton size="sm" variant="soft" icon="i-lucide-calendar-plus" @click="openGoogle">
          Google Calendar
        </UButton>
        <UButton size="sm" variant="soft" icon="i-lucide-calendar-plus" @click="openOutlook">
          Outlook / Teams
        </UButton>
        <UButton size="sm" variant="soft" color="neutral" icon="i-lucide-link" @click="copyLink">
          Copy link
        </UButton>
      </div>
      <p class="text-[11px] text-muted">
        {{ rangeSummary }} Your calendar refreshes this every few hours; Google can take up to a day.
        <template v-if="days < 7">A range this short can run out before the next refresh.</template>
      </p>
    </div>
  </section>
</template>

<script lang="ts" setup>
import { openUrl } from "@tauri-apps/plugin-opener";
import { getPlatform } from "@/utils/platform";
import { cue } from "@/utils/sounds";
import { getSettingsStore } from "@/utils/store";
import {
  CALENDAR_DAYS_DEFAULT,
  CALENDAR_DAYS_MAX,
  CALENDAR_DAYS_MIN,
  CALENDAR_RANGE_PRESETS,
  calendarFeedPath,
  clampCalendarDays,
  isCalendarRangePreset,
} from "@/utils/calendarRange";

const props = defineProps<{
  lat: number;
  lng: number;
  methodId: number;
  name?: string | null;
}>();

const toast = useToast();
const config = useRuntimeConfig();

// How many days the calendar covers, counting today. Remembered between visits.
const PREF_KEY = "calendarDays";
const CUSTOM = "custom";
const days = ref(CALENDAR_DAYS_DEFAULT);
const isCustom = ref(false);
// What is typed in the custom box; `days` follows it whenever it is a usable number.
const customDays = ref(String(CALENDAR_DAYS_DEFAULT));

const rangeOptions = [
  ...CALENDAR_RANGE_PRESETS.map((p) => ({ label: p.label, value: p.days as number | string })),
  { label: "Custom…", value: CUSTOM },
];

const selectedRange = computed<number | string>({
  get: () => (isCustom.value ? CUSTOM : days.value),
  set: (value) => {
    isCustom.value = value === CUSTOM;
    if (typeof value === "number") setDays(value);
    else customDays.value = String(days.value);
  },
});

function setDays(value: number): void {
  const next = clampCalendarDays(value);
  if (next === days.value) return;
  days.value = next;
  void saveDays(next);
}

// A plain text box (digits only): a number input's stepper arrows sit on top of the "days" label.
watch(customDays, (value) => {
  const digits = String(value).replace(/\D/g, "");
  if (digits !== value) {
    customDays.value = digits;
    return;
  }
  if (isCustom.value && digits !== "") setDays(Number(digits));
});

/** Leaving the box: show the number actually in use (an empty or out-of-range entry snaps to it). */
function tidyCustomDays(): void {
  customDays.value = String(days.value);
}

async function saveDays(value: number): Promise<void> {
  try {
    const store = await getSettingsStore();
    await store.set(PREF_KEY, value);
    if (store.save) await store.save();
  } catch (e) {
    console.warn("[calendar] Failed to save the range:", e);
  }
}

onMounted(async () => {
  try {
    const saved = await (await getSettingsStore()).get<number>(PREF_KEY);
    if (saved == null) return;
    days.value = clampCalendarDays(saved);
    customDays.value = String(days.value);
    isCustom.value = !isCalendarRangePreset(days.value);
  } catch (e) {
    console.warn("[calendar] Failed to load the range:", e);
  }
});

const rangeSummary = computed(() => {
  if (days.value === 1) return "Covers today only.";
  if (days.value === 2) return "Covers today and tomorrow.";
  return `Covers today and the ${days.value - 1} days after it.`;
});

// The service works out the place's timezone.
const feedUrl = computed(() => {
  const togetherUrl = config.public.togetherUrl as string;
  return new URL(calendarFeedPath(props.lat, props.lng, props.methodId, days.value), togetherUrl).toString();
});

const calendarName = computed(() => (props.name ? `Prayer times · ${props.name.slice(0, 40)}` : "Prayer times"));

const webcalUrl = computed(() => feedUrl.value.replace(/^https?:/, "webcal:"));

const googleUrl = computed(
  () => `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl.value)}`,
);

// Outlook on the web (also what the Teams calendar uses) subscribes through its own page.
const outlookUrl = computed(
  () =>
    `https://outlook.office.com/calendar/0/addfromweb?url=${encodeURIComponent(feedUrl.value)}&name=${encodeURIComponent(calendarName.value)}`,
);

async function openExternal(url: string): Promise<void> {
  try {
    if (getPlatform() !== "web") {
      await openUrl(url);
    } else {
      window.open(url, "_blank");
    }
  } catch {
    // No app registered for webcal: (common on Android) — hand over the link instead.
    await navigator.clipboard.writeText(feedUrl.value).catch(() => {});
    toast.add({
      title: "Couldn't open a calendar app",
      description: "Link copied — paste it into your calendar's “subscribe” option.",
      color: "warning",
    });
  }
}

function openApple(): void {
  void openExternal(webcalUrl.value);
}

function openOutlook(): void {
  void openExternal(outlookUrl.value);
}

function openGoogle(): void {
  void openExternal(googleUrl.value);
}

async function copyLink(): Promise<void> {
  try {
    await navigator.clipboard.writeText(feedUrl.value);
    cue("copied");
    toast.add({
      title: "Link copied",
      color: "success",
      icon: "heroicons:check-circle-20-solid",
    });
  } catch {
    toast.add({ title: "Couldn't copy the link", description: feedUrl.value, color: "error" });
  }
}
</script>
