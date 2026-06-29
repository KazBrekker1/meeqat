<template>
  <div class="h-screen w-full relative overflow-hidden">
    <PrototypesCelestialSkyBackground class="h-full" :stars="34" :seed="11" :shooting="false" scrim="top">
      <div class="h-full flex flex-col p-3 text-white">
        <!-- Header (draggable) + close -->
        <div class="flex items-center justify-between cursor-move select-none" @mousedown="startDrag">
          <div class="flex items-center gap-1 min-w-0">
            <UIcon name="lucide:map-pin" class="size-3 text-white/55 shrink-0" />
            <span v-if="city" class="text-xs font-medium truncate">{{ city }}<span v-if="countryCode" class="text-white/45">, {{ countryCode }}</span></span>
          </div>
          <UButton icon="lucide:x" variant="ghost" color="neutral" size="xs" class="text-white/50 -mr-1" @click="closeOverlay" @mousedown.stop />
        </div>

        <!-- Compact orbit + countdown -->
        <div class="flex flex-col items-center mt-1 shrink-0">
          <PrototypesOrbitBumps
            v-if="orbitPrayers.length"
            :prayers="orbitPrayers"
            :time="nowHHMM"
            :now-seconds="nowSec"
            :moon-phase="moonPhase"
            :size="150"
          />
          <PrototypesCelestialMoonPhase v-else :phase="moonPhase" :size="72" halo halo-color="#cdd6ff" />

          <p v-if="nextPrayerLabel" class="text-[10px] uppercase tracking-[0.18em] text-white/55 -mt-1">Until {{ nextPrayerLabel }}</p>
          <p v-if="countdown" class="text-2xl font-mono font-bold tabular-nums text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">{{ countdown }}</p>
          <p v-if="hijriDate" class="text-[10px] text-white/50">{{ hijriDate }}</p>
          <p v-if="sincePrayerLabel && sinceTime" class="text-[10px] text-white/50">
            <UIcon name="lucide:moon" class="size-2.5 inline -mt-0.5" /> {{ sinceTime }} since {{ sincePrayerLabel }}
          </p>
        </div>

        <!-- Prayer list -->
        <ul
          v-if="decoratedPrayers.length"
          ref="listEl"
          class="mt-2 flex-1 min-h-0 rounded-xl bg-white/[0.06] border border-white/10 divide-y divide-white/[0.07] overflow-y-auto scroll-celestial"
        >
          <li
            v-for="prayer in decoratedPrayers"
            :key="prayer.key"
            :data-next="prayer.isNext ? 'true' : undefined"
            class="flex items-center gap-2 px-3 py-1"
            :class="[prayer.isPast ? 'opacity-45' : '', prayer.isNext ? 'bg-white/[0.08]' : '']"
          >
            <span class="size-1.5 rounded-full shrink-0" :class="prayer.isNext ? 'bg-amber-300' : 'bg-white/35'" />
            <span class="text-xs flex-1 min-w-0 truncate" :class="prayer.isNext ? 'font-semibold' : ''">{{ prayer.label }}</span>
            <span class="text-xs tabular-nums font-mono text-white/70">{{ prayer.time }}</span>
          </li>
        </ul>

        <!-- Actions -->
        <div class="flex gap-2 pt-2 mt-auto">
          <UButton label="Open Meeqat" size="xs" color="neutral" variant="soft" class="flex-1 justify-center" @click="openApp" />
          <UButton label="Quit" size="xs" color="neutral" variant="ghost" class="flex-1 justify-center text-white/60" @click="quitApp" />
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
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { moveWindowConstrained, Position } from "@tauri-apps/plugin-positioner";
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

const nextPrayer = computed(() => decoratedPrayers.value.find((p) => p.isNext) ?? null);
const nextPrayerLabel = computed(() => nextPrayer.value?.label ?? "");

const countdown = computed(() => {
  const next = nextPrayer.value;
  if (!next || typeof next.minutes !== "number") return "";
  let diff = next.minutes * 60 - nowSec.value;
  if (diff <= 0) diff += 86400; // next prayer is tomorrow's first
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
});

// Most recent prayer that has passed today (else yesterday's last prayer).
const sinceInfo = computed(() => {
  const list = decoratedPrayers.value;
  const ns = nowSec.value;
  let prev: (typeof list)[number] | null = null;
  for (const p of list) {
    if ((p.minutes as number) * 60 <= ns) prev = p;
  }
  let elapsed: number;
  if (prev) {
    elapsed = ns - (prev.minutes as number) * 60;
  } else if (list.length) {
    prev = list[list.length - 1]!; // yesterday's last (e.g. Isha)
    elapsed = ns + (86400 - (prev.minutes as number) * 60);
  } else {
    return null;
  }
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  return { label: prev.label, time: h > 0 ? `${h}h ${m}m` : `${m}m` };
});
const sincePrayerLabel = computed(() => sinceInfo.value?.label ?? "");
const sinceTime = computed(() => sinceInfo.value?.time ?? "");

// Centre the prayer list on the active/next prayer when the popover opens.
const listEl = ref<HTMLElement | null>(null);
function scrollActiveIntoView() {
  const ul = listEl.value;
  if (!ul) return;
  const target = ul.querySelector<HTMLElement>('[data-next="true"]');
  if (!target) return;
  const delta =
    target.getBoundingClientRect().top -
    ul.getBoundingClientRect().top -
    (ul.clientHeight - target.clientHeight) / 2;
  ul.scrollTop += delta;
}

// On show, WKWebView can leave the freshly-updated list unpainted until the first
// manual scroll, and the layout isn't ready for an immediate scroll-to-active.
// Nudge a compositor repaint, then centre once layout has settled (double rAF).
function revealAndCenter() {
  const ul = listEl.value;
  if (!ul) return;
  ul.style.transform = "translateZ(0)";
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const el = listEl.value;
      if (!el) return;
      el.style.transform = "";
      scrollActiveIntoView();
    })
  );
}

// Re-centre whenever the next/active prayer changes — this also fires on the
// initial data arrival (undefined → first key), which both paints the list and
// scrolls it to the active prayer.
watch(() => nextPrayer.value?.key, () => revealAndCenter());

let unlistenUpdate: UnlistenFn | null = null;
let unlistenShow: UnlistenFn | null = null;
let unlistenFocus: UnlistenFn | null = null;

onMounted(async () => {
  // Local 1s clock — keeps countdown/next/since live whenever the popover is open,
  // independent of the main window's (throttled) push.
  localNow.value = new Date();
  clockId = setInterval(() => {
    localNow.value = new Date();
  }, 1000);

  // When the popover gains focus (i.e. it was just shown), centre on the next prayer.
  unlistenFocus = await getCurrentWebviewWindow().onFocusChanged(({ payload: focused }) => {
    if (focused) {
      localNow.value = new Date(); // resync immediately on show
      revealAndCenter();
    }
  });

  // Listen for show event to position window at tray (fallback)
  unlistenShow = await listen("meeqat:tray:show", async () => {
    try {
      await moveWindowConstrained(Position.TrayCenter);
    } catch (e) {
      console.error("[TrayPage] Failed to position window:", e);
    }
  });

  // Listen for updates from main window. We only consume the slowly-changing data
  // (prayer times, dates, location, moon phase) — countdown/next/since are derived
  // locally from the tray's own clock so they stay live while the main window sleeps.
  unlistenUpdate = await listen<TrayUpdatePayload>("meeqat:tray:update", (event) => {
    const payload = event.payload;

    if (payload.hijriDate) hijriDate.value = payload.hijriDate;
    if (typeof payload.moonPhase === "number") receivedMoonPhase.value = payload.moonPhase;
    if (payload.city) city.value = payload.city;
    if (payload.countryCode) countryCode.value = payload.countryCode;
    if (payload.timingsList) {
      prayers.value = payload.timingsList.filter((p) => MAIN_PRAYER_KEYS_SET.has(p.key));
    }

    // Fallback: parse Hijri date from dateLine if individual field not provided
    if (payload.dateLine && !payload.hijriDate) {
      for (const part of payload.dateLine.split(" | ")) {
        if (part.startsWith("Hijri: ")) hijriDate.value = part.replace("Hijri: ", "");
      }
    }
  });
});

onBeforeUnmount(() => {
  if (clockId) clearInterval(clockId);
  if (unlistenUpdate) {
    unlistenUpdate();
  }
  if (unlistenShow) {
    unlistenShow();
  }
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
  background: var(--ui-bg) !important;
  margin: 0 !important;
  padding: 0 !important;
}
</style>
