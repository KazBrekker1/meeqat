<template>
  <div class="min-h-screen bg-default">
    <div class="p-3 flex flex-col gap-2">
      <!-- Close button -->
      <UButton
        icon="lucide:x"
        variant="ghost"
        color="neutral"
        size="xs"
        class="absolute top-2 right-2"
        @click="closeOverlay"
      />

      <!-- Header with dates (draggable) -->
      <div class="text-center pb-2 border-b border-default cursor-move select-none" @mousedown="startDrag">
        <div v-if="hijriDate" class="text-xs font-medium text-default">{{ hijriDate }}</div>
        <div v-if="gregorianDate" class="text-xs text-muted">{{ gregorianDate }}</div>
        <div v-if="city" class="flex items-center justify-center gap-1 mt-0.5">
          <UIcon name="lucide:map-pin" class="size-2.5 text-dimmed" />
          <span class="text-[10px] text-dimmed">{{ city }}<span v-if="countryCode">, {{ countryCode }}</span></span>
        </div>
      </div>

      <!-- Next prayer highlight (HeroCard style) -->
      <div
        v-if="nextPrayerLabel && countdown"
        class="relative rounded-xl border border-[var(--ui-color-primary-500)]/20 bg-gradient-to-br from-[var(--ui-color-primary-500)]/10 via-[var(--ui-color-primary-500)]/5 to-transparent overflow-hidden"
      >
        <!-- Islamic pattern overlay -->
        <div class="absolute inset-0 pattern-islamic opacity-30 pointer-events-none" />

        <div class="relative px-3 py-2.5 space-y-1">
          <p class="text-[10px] uppercase tracking-wider text-muted font-medium">Next Prayer</p>
          <div class="flex items-baseline justify-between gap-2">
            <h2 class="text-base font-bold text-[var(--ui-color-primary-400)]">{{ nextPrayerLabel }}</h2>
            <span class="text-lg font-mono font-bold tabular-nums text-default">{{ countdown }}</span>
          </div>

          <!-- Since previous -->
          <div v-if="sincePrayerLabel && sinceTime" class="flex items-center gap-1.5 text-[10px] text-dimmed pt-1 border-t border-default">
            <UIcon name="lucide:clock" class="size-3 shrink-0" />
            <span>Since {{ sincePrayerLabel }}: {{ sinceTime }}</span>
          </div>
        </div>
      </div>

      <!-- Prayer list (RowList + Row style) -->
      <div
        v-if="prayers.length"
        class="rounded-xl border border-default bg-elevated overflow-hidden divide-y divide-default"
      >
        <div
          v-for="prayer in prayers"
          :key="prayer.key"
          class="flex items-center gap-2 px-3 py-1.5"
          :class="getRowClasses(prayer)"
        >
          <!-- Left accent bar -->
          <div class="w-1 self-stretch rounded-full shrink-0" :class="getAccentClasses(prayer)" />

          <!-- Prayer name -->
          <span class="text-xs font-medium flex-1 min-w-0 truncate" :class="getLabelClasses(prayer)">
            {{ prayer.label }}
          </span>

          <!-- Time -->
          <span class="text-xs font-semibold tabular-nums" :class="getTimeClasses(prayer)">
            {{ prayer.time }}
          </span>

          <!-- Status icon -->
          <UIcon
            v-if="prayer.isNext"
            name="lucide:chevron-right"
            class="size-3.5 shrink-0 text-[var(--ui-color-primary-500)]"
          />
          <UIcon
            v-else-if="prayer.isPast"
            name="lucide:check"
            class="size-3.5 shrink-0 text-muted"
          />
          <div v-else class="size-3.5 shrink-0" />
        </div>
      </div>

      <!-- Actions -->
      <div class="flex gap-2 pt-2 mt-auto border-t border-default">
        <UButton color="primary" size="xs" class="flex-1" @click="openApp">
          Open Meeqat
        </UButton>
        <UButton variant="outline" color="neutral" size="xs" class="flex-1" @click="quitApp">
          Quit
        </UButton>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
definePageMeta({
  layout: false
});

useHead({
  htmlAttrs: { class: 'dark' }
});

import { WebviewWindow, getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { moveWindowConstrained, Position } from "@tauri-apps/plugin-positioner";
import { MAIN_PRAYER_KEYS_SET } from "@/constants/prayers";
import { hidePopover } from "@/composables/useTrayPopover";
import type { PrayerTimingItem } from "@/utils/types";

interface TrayUpdatePayload {
  dateLine?: string;
  title?: string | null;
  nextLine?: string;
  sinceLine?: string;
  timingsList?: Array<{
    key: string;
    label: string;
    time: string;
    minutes?: number;
    isNext?: boolean;
    isPast?: boolean;
  }>;
  hijriDate?: string;
  gregorianDate?: string;
  nextPrayerLabel?: string;
  countdown?: string;
  sincePrayerLabel?: string;
  sinceTime?: string;
  city?: string;
  countryCode?: string;
}

const hijriDate = ref<string>("");
const gregorianDate = ref<string>("");
const nextPrayerLabel = ref<string>("");
const countdown = ref<string>("");
const sincePrayerLabel = ref<string>("");
const sinceTime = ref<string>("");
const city = ref<string>("");
const countryCode = ref<string>("");
const prayers = ref<PrayerTimingItem[]>([]);

function getRowClasses(prayer: PrayerTimingItem) {
  if (prayer.isNext) return 'bg-[var(--ui-color-primary-950)]';
  if (prayer.isPast) return 'opacity-50';
  return '';
}

function getAccentClasses(prayer: PrayerTimingItem) {
  if (prayer.isNext) return 'bg-[var(--ui-color-primary-500)]';
  if (prayer.isPast) return 'bg-[var(--ui-text-dimmed)]';
  return 'bg-transparent';
}

function getLabelClasses(prayer: PrayerTimingItem) {
  if (prayer.isNext) return 'text-[var(--ui-color-primary-300)]';
  if (prayer.isPast) return 'text-muted';
  return '';
}

function getTimeClasses(prayer: PrayerTimingItem) {
  if (prayer.isNext) return 'text-[var(--ui-color-primary-400)]';
  if (prayer.isPast) return 'text-muted';
  return '';
}

let unlistenUpdate: UnlistenFn | null = null;
let unlistenShow: UnlistenFn | null = null;

onMounted(async () => {
  // Listen for show event to position window at tray (fallback)
  unlistenShow = await listen("meeqat:tray:show", async () => {
    try {
      await moveWindowConstrained(Position.TrayCenter);
    } catch (e) {
      console.error("[TrayPage] Failed to position window:", e);
    }
  });

  // Listen for updates from main window
  unlistenUpdate = await listen<TrayUpdatePayload>("meeqat:tray:update", (event) => {
    const payload = event.payload;

    if (payload.hijriDate) {
      hijriDate.value = payload.hijriDate;
    }
    if (payload.gregorianDate) {
      gregorianDate.value = payload.gregorianDate;
    }
    if (payload.nextPrayerLabel) {
      nextPrayerLabel.value = payload.nextPrayerLabel;
    }
    if (payload.countdown) {
      countdown.value = payload.countdown;
    }
    if (payload.sincePrayerLabel) {
      sincePrayerLabel.value = payload.sincePrayerLabel;
    }
    if (payload.sinceTime) {
      sinceTime.value = payload.sinceTime;
    }
    if (payload.city) {
      city.value = payload.city;
    }
    if (payload.countryCode) {
      countryCode.value = payload.countryCode;
    }
    if (payload.timingsList) {
      prayers.value = payload.timingsList.filter(p => MAIN_PRAYER_KEYS_SET.has(p.key));
    }

    // Fallback: parse sinceLine if individual fields not provided
    if (payload.sinceLine && !payload.sincePrayerLabel) {
      const sinceMatch = payload.sinceLine.match(/^(.+?)\s+(?:since\s+)?(\d.*)$/i);
      if (sinceMatch?.[1] && sinceMatch[2]) {
        sincePrayerLabel.value = sinceMatch[1].trim();
        sinceTime.value = sinceMatch[2].trim().replace(/\s*ago$/i, "");
      }
    }

    // Fallback: parse from dateLine if individual fields not provided
    if (payload.dateLine && !payload.hijriDate && !payload.gregorianDate) {
      const parts = payload.dateLine.split(" | ");
      for (const part of parts) {
        if (part.startsWith("Hijri: ")) {
          hijriDate.value = part.replace("Hijri: ", "");
        } else if (part.startsWith("Gregorian: ")) {
          gregorianDate.value = part.replace("Gregorian: ", "");
        }
      }
    }

    // Fallback: parse nextLine for label and countdown
    if (payload.nextLine && !payload.nextPrayerLabel) {
      const match = payload.nextLine.match(/^(.+?)\s+in\s+(.+)$/);
      if (match?.[1] && match[2]) {
        nextPrayerLabel.value = match[1].trim();
        countdown.value = match[2].trim();
      }
    }
  });
});

onBeforeUnmount(() => {
  if (unlistenUpdate) {
    unlistenUpdate();
  }
  if (unlistenShow) {
    unlistenShow();
  }
});

async function startDrag() {
  try {
    await getCurrentWebviewWindow().startDragging();
  } catch (e) {
    console.error("[TrayPage] Failed to start dragging:", e);
  }
}

async function closeOverlay() {
  await hidePopover();
}

async function openApp() {
  await hidePopover();
  const main = await WebviewWindow.getByLabel("main") || WebviewWindow.getCurrent();
  await main.show();
  await main.setFocus();
}

async function quitApp() {
  try {
    await invoke("quit_app");
  } catch (error) {
    console.error("Failed to quit:", error);
  }
}
</script>

<style>
html, body, #__nuxt {
  background: var(--ui-bg) !important;
  margin: 0 !important;
  padding: 0 !important;
}
</style>
