<template>
  <section>
    <p class="text-[11px] uppercase tracking-wider text-muted mb-1.5">Add to calendar</p>
    <div class="rounded-xl bg-elevated border border-default p-3 space-y-3">
      <p class="text-xs text-muted">
        Prayer times appear in your calendar with a reminder 10 minutes before each prayer, and stay up to date.
      </p>
      <div class="flex flex-wrap gap-2">
        <UButton size="sm" variant="soft" icon="i-lucide-calendar-plus" @click="openAppleOutlook">
          Apple / Outlook
        </UButton>
        <UButton size="sm" variant="soft" icon="i-lucide-calendar-plus" @click="openGoogle">
          Google Calendar
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
import { getUserTimezone } from "@/utils/time";
import { getPlatform } from "@/utils/platform";

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

const feedUrl = computed(() => {
  const togetherUrl = config.public.togetherUrl as string;
  const url = new URL("/cal/prayers.ics", togetherUrl);
  url.searchParams.set("lat", String(round3(props.lat)));
  url.searchParams.set("lng", String(round3(props.lng)));
  url.searchParams.set("method", String(props.methodId));
  url.searchParams.set("tz", getUserTimezone());
  if (props.name) url.searchParams.set("name", props.name.slice(0, 40));
  return url.toString();
});

const webcalUrl = computed(() => feedUrl.value.replace(/^https?:/, "webcal:"));

const googleUrl = computed(
  () => `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl.value)}`,
);

async function openExternal(url: string): Promise<void> {
  try {
    if (getPlatform() !== "web") {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
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

function openAppleOutlook(): void {
  void openExternal(webcalUrl.value);
}

function openGoogle(): void {
  void openExternal(googleUrl.value);
}

async function copyLink(): Promise<void> {
  await navigator.clipboard.writeText(feedUrl.value);
  toast.add({
    title: "Link copied",
    color: "success",
    icon: "heroicons:check-circle-20-solid",
  });
}
</script>
