<template>
  <div class="min-h-screen bg-[#1e1e1e]">
    <div class="p-6 flex flex-col gap-2">
      <!-- Header with dates -->
      <div class="text-center pb-2 border-b border-white/10">
        <div v-if="hijriDate" class="text-xs text-white/90 font-medium">{{ hijriDate }}</div>
        <div v-if="gregorianDate" class="text-xs text-white/70">{{ gregorianDate }}</div>
      </div>

      <!-- Next prayer highlight -->
      <div v-if="nextPrayerLabel && countdown" class="relative flex justify-between items-center px-4 py-3 bg-indigo-950 rounded-lg">
        <div class="absolute inset-0 rounded-lg border-t-[3px] border-l-[3px] border-indigo-500 pointer-events-none" />
        <span class="text-sm font-semibold text-indigo-300">{{ nextPrayerLabel }}</span>
        <span class="text-lg font-bold tabular-nums text-indigo-400">{{ countdown }}</span>
      </div>

      <!-- Prayer list -->
      <div class="flex flex-col gap-0.5">
        <div
          v-for="prayer in prayers"
          :key="prayer.key"
          class="relative flex justify-between items-center px-3 py-1.5 rounded-md"
          :class="{
            'bg-indigo-950': prayer.isNext,
            'opacity-50': prayer.isPast
          }"
        >
          <div v-if="prayer.isNext" class="absolute inset-0 rounded-md border-t-2 border-l-2 border-indigo-500 pointer-events-none" />
          <span class="text-xs font-medium" :class="prayer.isNext ? 'text-indigo-300' : 'text-white/90'">{{ prayer.label }}</span>
          <span class="text-xs font-semibold tabular-nums" :class="prayer.isNext ? 'text-indigo-400' : 'text-white/70'">{{ prayer.time }}</span>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex gap-2 pt-2 mt-auto border-t border-white/10">
        <button class="flex-1 py-2 px-3 rounded-md text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white" @click="openApp">Open Meeqat</button>
        <button class="flex-1 py-2 px-3 rounded-md text-xs font-medium bg-white/10 text-white/80 border border-white/10 hover:bg-white/15" @click="quitApp">Quit</button>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
definePageMeta({
  layout: false
});

import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { moveWindow, Position } from "@tauri-apps/plugin-positioner";
import { MAIN_PRAYER_KEYS_SET } from "@/constants/prayers";
import { hidePopover } from "@/composables/useTrayPopover";

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
}

const hijriDate = ref<string>("");
const gregorianDate = ref<string>("");
const nextPrayerLabel = ref<string>("");
const countdown = ref<string>("");
const prayers = ref<Array<{
  key: string;
  label: string;
  time: string;
  isNext?: boolean;
  isPast?: boolean;
}>>([]);

let unlistenUpdate: UnlistenFn | null = null;
let unlistenShow: UnlistenFn | null = null;

onMounted(async () => {
  // Listen for show event to position window at tray
  unlistenShow = await listen("meeqat:tray:show", async () => {
    try {
      await moveWindow(Position.TrayCenter);
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
    if (payload.timingsList) {
      prayers.value = payload.timingsList.filter(p => MAIN_PRAYER_KEYS_SET.has(p.key));
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
      if (match) {
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
  background: #1e1e1e !important;
  margin: 0 !important;
  padding: 0 !important;
}
</style>
