<template>
  <div class="h-screen overflow-y-auto bg-muted scroll-celestial">
    <!-- Gallery header -->
    <header class="sticky top-0 z-20 backdrop-blur-md bg-default/80 border-b border-default">
      <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2 min-w-0">
          <UIcon name="lucide:moon-star" class="size-5 text-primary shrink-0" />
          <div class="min-w-0">
            <h1 class="text-sm font-semibold truncate">Meeqat — Celestial system</h1>
            <p class="text-xs text-muted truncate">animated orbit · all screens · desktop two-pane</p>
          </div>
        </div>
        <UButton
          :icon="isDark ? 'lucide:sun' : 'lucide:moon'"
          color="neutral" variant="subtle" size="sm"
          :label="isDark ? 'Light' : 'Dark'"
          @click="toggleDark()"
        />
      </div>
    </header>

    <main class="max-w-7xl mx-auto p-4 sm:p-6 space-y-12">
      <!-- Desktop -->
      <section>
        <SectionHead icon="lucide:monitor" title="Desktop — two-pane dashboard" note="orbit + countdown · schedule + calendar" />
        <div class="flex justify-center">
          <article class="w-full max-w-[920px] flex flex-col gap-3">
            <UBadge label="Desktop window" color="primary" variant="subtle" size="sm" class="self-start" />
            <div class="relative rounded-2xl border border-default shadow-2xl overflow-hidden ring-1 ring-black/10" style="aspect-ratio: 16 / 10;">
              <div class="absolute inset-0"><MainDesktop :d="mock" /></div>
            </div>
          </article>
        </div>
      </section>

      <!-- Phone screens -->
      <section>
        <SectionHead icon="lucide:smartphone" title="Mobile & menubar screens" note="nothing crops — fixed, fitted layouts" />
        <div class="grid gap-6 sm:gap-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 justify-items-center">
          <Frame v-for="s in phoneScreens" :key="s.id" :label="s.label" :ratio="s.ratio">
            <component :is="s.component" :d="mock" />
          </Frame>
        </div>
      </section>

      <!-- Components -->
      <section>
        <SectionHead icon="lucide:component" title="Components & design tokens" note="moon · dial · buttons · rows · controls" />
        <div class="grid gap-6 grid-cols-1 sm:grid-cols-2 justify-items-center">
          <Frame label="Component board" :ratio="360 / 640" class="max-w-[400px]">
            <ComponentsBoard :d="mock" />
          </Frame>
        </div>
      </section>

      <p class="text-center text-xs text-muted">
        anime.js drives the dial (sweep-in hand, staggered ticks, pulsing now-dot, floating moon).
        Reload to replay the entrance. Say the word and I'll wire these into the live app.
      </p>
    </main>
  </div>
</template>

<script lang="ts" setup>
import { useDark, useToggle } from "@vueuse/core";
import { h, resolveComponent } from "vue";
import MainMobile from "@/components/prototypes/screens/MainMobile.vue";
import MainDesktop from "@/components/prototypes/screens/MainDesktop.vue";
import TrayPopover from "@/components/prototypes/screens/TrayPopover.vue";
import SettingsPanel from "@/components/prototypes/screens/SettingsPanel.vue";
import CalendarPanel from "@/components/prototypes/screens/CalendarPanel.vue";
import LocationsPanel from "@/components/prototypes/screens/LocationsPanel.vue";
import ComponentsBoard from "@/components/prototypes/screens/ComponentsBoard.vue";
import type { CelestialData } from "@/components/prototypes/celestial/data";

definePageMeta({ layout: false });

const isDark = useDark();
const toggleDark = useToggle(isDark);

// Small inline helpers (section header + framed device).
const SectionHead = (props: { icon: string; title: string; note?: string }) =>
  h("div", { class: "flex items-center gap-2 mb-4 px-1" }, [
    h(resolveComponent("UIcon"), { name: props.icon, class: "size-4 text-primary" }),
    h("h2", { class: "text-sm font-semibold" }, props.title),
    h(resolveComponent("USeparator"), { class: "flex-1" }),
    props.note ? h("span", { class: "text-xs text-muted" }, props.note) : null,
  ]);

const Frame = (props: { label: string; ratio: number }, { slots }: any) =>
  h("article", { class: "w-full max-w-[340px] flex flex-col gap-2.5" }, [
    h(resolveComponent("UBadge"), { label: props.label, color: "neutral", variant: "subtle", size: "sm", class: "self-start" }),
    h(
      "div",
      {
        class: "relative rounded-[2rem] border border-default shadow-xl overflow-hidden ring-1 ring-black/5 w-full",
        style: `aspect-ratio: ${props.ratio};`,
      },
      [h("div", { class: "absolute inset-0" }, slots.default?.())]
    ),
  ]);

const mock: CelestialData = {
  city: "Cairo",
  country: "Egypt",
  time: "14:32",
  hijri: "12 Dhū al-Ḥijjah 1447",
  gregorian: "Friday, 27 June 2026",
  next: { label: "ʿAṣr", time: "15:48", countdown: "01:16:24" },
  since: { label: "Ẓuhr", ago: "1h 12m" },
  progress: 62,
  moonPhase: 0.406,
  moonPhaseName: "Waxing Gibbous",
  moonIllum: 92,
  lunarDay: 12,
  lunarTotal: 30,
  prayers: [
    { key: "fajr", label: "Fajr", time: "04:02", isPast: true },
    { key: "sunrise", label: "Sunrise", time: "05:38", isPast: true },
    { key: "dhuhr", label: "Dhuhr", time: "13:20", isPast: true },
    { key: "asr", label: "ʿAṣr", time: "15:48", isNext: true },
    { key: "maghrib", label: "Maghrib", time: "20:02" },
    { key: "isha", label: "ʿIshāʾ", time: "21:34" },
  ],
};

const phoneScreens = [
  { id: "main", label: "Main", component: MainMobile, ratio: 320 / 640 },
  { id: "tray", label: "Tray popover", component: TrayPopover, ratio: 300 / 460 },
  { id: "settings", label: "Settings", component: SettingsPanel, ratio: 320 / 640 },
  { id: "calendar", label: "Calendar", component: CalendarPanel, ratio: 320 / 640 },
  { id: "locations", label: "Location", component: LocationsPanel, ratio: 320 / 640 },
];
</script>
