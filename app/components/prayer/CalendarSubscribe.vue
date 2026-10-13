<template>
  <section>
    <p class="text-[11px] uppercase tracking-wider text-muted mb-1.5">Add to calendar</p>
    <div class="rounded-xl bg-elevated border border-default p-3 space-y-3">
      <p class="text-xs text-muted">
        Each prayer appears in your calendar as a 30-minute block starting 10 minutes after the athan, with a reminder 10 minutes before the athan, and stays up to date.
      </p>
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
        Your calendar refreshes this every few hours; Google can take up to a day.
      </p>
    </div>
  </section>
</template>

<script lang="ts" setup>
import { openUrl } from "@tauri-apps/plugin-opener";
import { getPlatform } from "@/utils/platform";
import { cue } from "@/utils/sounds";

const props = defineProps<{
  lat: number;
  lng: number;
  methodId: number;
  name?: string | null;
}>();

const toast = useToast();
const config = useRuntimeConfig();

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// Digits, dots and slashes only, ending in .ics: calendar services re-encode or
// refuse links with a query string. The service works out the place's timezone.
const feedUrl = computed(() => {
  const togetherUrl = config.public.togetherUrl as string;
  const path = `/cal/${round3(props.lat)}/${round3(props.lng)}/${props.methodId}/prayers.ics`;
  return new URL(path, togetherUrl).toString();
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
