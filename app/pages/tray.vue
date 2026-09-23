<template>
  <!-- Height follows the content: fitWindowToContent() resizes the popover window, so
       nothing ever scrolls (Tauri has no native fit-to-content window option). -->
  <div ref="rootEl" class="w-full">
    <PrototypesCelestialSkyBackground :stars="34" :seed="11" :shooting="false" scrim="top">
      <div class="flex flex-col gap-2 p-3 text-white">
        <!-- Header (draggable): place · Hijri date, close -->
        <div class="flex items-center gap-1.5 cursor-move select-none" @mousedown="startDrag">
          <UIcon name="lucide:map-pin" class="size-3 text-amber-300 shrink-0" />
          <span v-if="city" dir="auto" class="text-xs font-semibold truncate">{{ city }}</span>
          <span v-if="hijriDate" class="text-[11px] text-white/50 truncate">· {{ hijriDate }}</span>
          <UButton icon="lucide:x" variant="ghost" color="neutral" size="xs" class="ms-auto -me-1 text-white/50" aria-label="Close" @click="closeOverlay" @mousedown.stop />
        </div>

        <!-- Orbit (unchanged component) -->
        <div class="flex justify-center">
          <PrototypesOrbitBumps
            v-if="orbitPrayers.length"
            :prayers="orbitPrayers"
            :time="nowHHMM"
            :now-seconds="nowSec"
            :moon-phase="moonPhase"
            :size="180"
            :sonar-intensity="0.25"
          />
          <PrototypesCelestialMoonPhase v-else :phase="moonPhase" :size="72" halo halo-color="#cdd6ff" />
        </div>

        <!-- Every prayer at once in one row, instead of a scrolling list -->
        <div v-if="decoratedPrayers.length" class="grid gap-1" :style="{ gridTemplateColumns: `repeat(${decoratedPrayers.length}, minmax(0, 1fr))` }">
          <div
            v-for="prayer in decoratedPrayers"
            :key="prayer.key"
            class="rounded-lg py-1 text-center"
            :class="prayer.isNext ? 'bg-amber-300/15 ring-1 ring-inset ring-amber-300/40' : prayer.isPast ? 'bg-white/[0.04] opacity-45' : 'bg-white/[0.05]'"
          >
            <div class="text-[10px] leading-tight" :class="prayer.isNext ? 'text-amber-300' : 'text-white/55'">{{ prayer.label }}</div>
            <div class="text-[13px] font-semibold tabular-nums leading-snug" :class="prayer.isNext && 'text-amber-300'">{{ prayer.time }}</div>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex items-center gap-1.5">
          <UButton label="Open Meeqat" size="sm" color="neutral" variant="soft" class="flex-1 justify-center" @click="openApp" />
          <UButton icon="lucide:power" size="sm" color="neutral" variant="ghost" class="text-white/55" aria-label="Quit Meeqat" @click="quitApp" />
        </div>
      </div>
    </PrototypesCelestialSkyBackground>
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
import { LogicalSize } from "@tauri-apps/api/dpi";
import { currentMonitor } from "@tauri-apps/api/window";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { MAIN_PRAYER_KEYS_SET } from "@/constants/prayers";
import { pad2 } from "@/utils/time";
import { hidePopover } from "@/composables/useTrayPopover";
import type { PrayerTimingItem, TrayUpdatePayload } from "@/utils/types";

const hijriDate = ref<string>("");
const receivedMoonPhase = ref<number | null>(null);
const city = ref<string>("");
const countryCode = ref<string>("");
const prayers = ref<PrayerTimingItem[]>([]);

// --- Local clock ---------------------------------------------------------
// The tray derives countdown / next-prayer / since LOCALLY from a ticking clock
// rather than from a per-second push by the main window. The main window's timer
// is throttled/paused while it's hidden (exactly when the tray is in use), which
// previously froze the tray until the app was reopened. The tray webview is live
// whenever it's shown, so its own interval keeps everything current.
const localNow = ref<Date>(new Date());
let clockId: ReturnType<typeof setInterval> | null = null;
const nowSec = computed(() => {
  const d = localNow.value;
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
});

const hhmm = (min: number) => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;

// Prefer the accurate astronomical phase sent by the main window; fall back to
// a rough hijri-day estimate only until the first payload arrives.
const moonPhase = computed(() => {
  if (receivedMoonPhase.value != null) return receivedMoonPhase.value;
  const day = parseInt((hijriDate.value || "").trim(), 10) || 1;
  return ((day - 1) / 29.53) % 1;
});

// Prayers decorated with LOCAL next/past flags (overriding any stale pushed flags).
const decoratedPrayers = computed(() => {
  const list = prayers.value.filter((p) => typeof p.minutes === "number");
  const ns = nowSec.value;
  let nextIdx = list.findIndex((p) => (p.minutes as number) * 60 > ns);
  if (nextIdx === -1) nextIdx = 0; // all passed → next is tomorrow's first
  return list.map((p, i) => ({
    ...p,
    isNext: i === nextIdx,
    isPast: i !== nextIdx && (p.minutes as number) * 60 <= ns,
  }));
});

const orbitPrayers = computed(() =>
  decoratedPrayers.value.map((p) => ({
    key: p.key.toLowerCase(),
    time: hhmm(p.minutes as number),
    isNext: p.isNext,
    isPast: p.isPast,
  }))
);

// "Now" position for the orbit, from the local clock.
const nowHHMM = computed(() => hhmm(Math.floor(nowSec.value / 60)));

// --- Fit the popover window to its content --------------------------------
// Tauri 2.11 still has no fit-to-content window option (tauri#12420), so measure the
// content and resize. Runs while hidden too: Rust (tray.rs) reads the window's size at
// show time, so placement under the tray icon always uses the current height.
const TRAY_WIDTH = 280;
const rootEl = ref<HTMLElement | null>(null);
let lastHeight = 0;
let resizeObserver: ResizeObserver | null = null;

async function fitWindowToContent() {
  const el = rootEl.value;
  if (!el) return;
  let height = Math.ceil(el.getBoundingClientRect().height);
  try {
    // Never taller than the screen's work area (menu bar / taskbar excluded).
    const monitor = await currentMonitor();
    if (monitor) height = Math.min(height, Math.floor(monitor.workArea.size.height / monitor.scaleFactor) - 16);
  } catch {
    // monitor info unavailable — use the measured height as-is
  }
  if (!height || Math.abs(height - lastHeight) < 1) return;
  lastHeight = height;
  try {
    await getCurrentWebviewWindow().setSize(new LogicalSize(TRAY_WIDTH, height));
  } catch (e) {
    console.error("[TrayPage] Failed to fit window to content:", e);
  }
}

let unlistenUpdate: UnlistenFn | null = null;
let unlistenSnapshot: UnlistenFn | null = null;
let unlistenShown: UnlistenFn | null = null;
let unlistenFocus: UnlistenFn | null = null;

onMounted(async () => {
  if (rootEl.value) {
    resizeObserver = new ResizeObserver(() => fitWindowToContent());
    resizeObserver.observe(rootEl.value);
  }

  // Local 1s clock — keeps countdown/next/since live whenever the popover is open,
  // independent of the main window's (throttled) push.
  localNow.value = new Date();
  clockId = setInterval(() => {
    localNow.value = new Date();
  }, 1000);

  // Resync the clock whenever the popover gains focus (throttled timers drift while hidden).
  unlistenFocus = await getCurrentWebviewWindow().onFocusChanged(({ payload: focused }) => {
    if (focused) {
      localNow.value = new Date(); // resync immediately on show
    }
  });

  // Data, fastest source first so the popover is never blank:
  // 1) the last snapshot this page saw (localStorage) paints immediately on launch;
  // 2) Rust's copy of the main window's latest snapshot (always current in-session);
  // 3) live pushes: full snapshots when data changes, 1s updates for moon phase.
  try {
    const cached = localStorage.getItem(SNAPSHOT_KEY);
    if (cached) applyPayload(JSON.parse(cached));
  } catch {
    // ignore a corrupt cache
  }
  unlistenSnapshot = await listen<TrayUpdatePayload>("meeqat:tray:snapshot", ({ payload }) => {
    applyPayload(payload);
    saveSnapshot(payload);
  });
  unlistenUpdate = await listen<TrayUpdatePayload>("meeqat:tray:update", ({ payload }) => applyPayload(payload));
  unlistenShown = await listen("meeqat:tray:shown", () => {
    localNow.value = new Date();
  });
  try {
    const snapshot = await invoke<TrayUpdatePayload | null>("get_tray_snapshot");
    if (snapshot) {
      applyPayload(snapshot);
      saveSnapshot(snapshot);
    }
  } catch {
    // not in Tauri
  }
});

const SNAPSHOT_KEY = "meeqat:tray-snapshot";

function saveSnapshot(payload: TrayUpdatePayload) {
  if (!payload?.timingsList?.length) return; // keep the last complete snapshot cached
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(payload));
  } catch {
    // storage full / unavailable
  }
}

// We only consume the slowly-changing data (prayer times, dates, place, moon phase);
// countdown/next/since are derived locally from the tray's own clock.
function applyPayload(payload: TrayUpdatePayload) {
  if (!payload) return;
  if (payload.hijriDate) hijriDate.value = payload.hijriDate;
  if (typeof payload.moonPhase === "number") receivedMoonPhase.value = payload.moonPhase;
  if (payload.city) city.value = payload.city;
  if (payload.countryCode !== undefined) countryCode.value = payload.countryCode;
  // An empty list means "not loaded yet" (the main window can report the place and
  // date before the times arrive) — never let it wipe the times already shown.
  const incoming = payload.timingsList?.filter((p) => MAIN_PRAYER_KEYS_SET.has(p.key));
  if (incoming?.length) prayers.value = incoming;
  // Fallback: parse Hijri date from dateLine if individual field not provided
  if (payload.dateLine && !payload.hijriDate) {
    for (const part of payload.dateLine.split(" | ")) {
      if (part.startsWith("Hijri: ")) hijriDate.value = part.replace("Hijri: ", "");
    }
  }
}

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  if (clockId) clearInterval(clockId);
  if (unlistenUpdate) {
    unlistenUpdate();
  }
  unlistenSnapshot?.();
  unlistenShown?.();
  if (unlistenFocus) {
    unlistenFocus();
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
  background: #0a0e22 !important;
  margin: 0 !important;
  padding: 0 !important;
}
</style>
