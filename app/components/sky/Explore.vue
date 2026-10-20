<template>
  <!-- Explore mode's controls over the real sky (the sky itself is RealSky behind the page).
       Open while the route has ?sky=1, so Android back, Esc and × all close it the same way. -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0"
    >
      <div v-if="isOpen" class="pointer-events-none fixed inset-0 z-40 flex flex-col pt-safe pb-safe text-white">
        <div class="flex items-start gap-2 p-3">
          <SkySearch v-if="index.length" :index="index" class="pointer-events-auto" @choose="goTo" />
          <UButton icon="lucide:x" color="neutral" variant="soft" class="pointer-events-auto ms-auto" aria-label="Close the sky" @click="requestClose" />
        </div>
        <div class="flex-1" />
        <div class="flex flex-col gap-2 px-3 sm:flex-row sm:items-end">
          <SkyInfoCard v-if="info" :info="info" class="pointer-events-auto w-full sm:w-80" @close="selection = null" />
          <UButton icon="lucide:moon" label="Back to the Moon" color="neutral" variant="soft" size="sm" class="pointer-events-auto self-start sm:self-end" @click="backToMoon" />
        </div>
        <div class="p-3">
          <SkyTimeSlider v-model="sliderMinutes" :stops="stops" :now-minutes="nowMinutes" class="pointer-events-auto" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script lang="ts" setup>
import { skyAt } from "@/utils/sky/astro";
import { loadSkyCatalog, type SkyCatalog } from "@/utils/sky/catalog";
import { describePick, directionOf, pickForTarget } from "@/utils/sky/describe";
import { buildSearchIndex, type SearchItem, type SearchTarget } from "@/utils/sky/search";
import { FOV_MAX, FOV_MIN, pan } from "@/utils/sky/view";
import { altAzOf } from "@/utils/sky/vec";

const props = defineProps<{
  lat: number;
  lng: number;
  /** Prayer times the slider snaps to (minutes of the day). */
  stops: { key: string; label: string; minutes: number }[];
}>();

const route = useRoute();
const router = useRouter();
const { getNow } = useMockTime();
const { nowHHMM } = usePrayerRuntime();
const explore = useSkyExplore();
const { isOpen, available, selection, time } = explore;

const cat = shallowRef<SkyCatalog | null>(null);
const index = shallowRef<SearchItem[]>([]);
watch(
  available,
  async (ok) => {
    if (!ok || cat.value) return;
    cat.value = await loadSkyCatalog();
    index.value = buildSearchIndex(cat.value);
  },
  { immediate: true },
);

const skyNow = () => skyAt(time.value ?? getNow(), props.lat, props.lng);

// ── Open / close, following ?sky=1 ─────────────────────────────────────────
const wantOpen = computed(() => route.query.sky === "1");
watch(
  [wantOpen, available],
  ([want, ok]) => {
    if (want && ok && !isOpen.value) open();
    else if (!want && isOpen.value) close();
  },
  { immediate: true },
);
watch(explore.closeRequests, () => {
  if (isOpen.value) requestClose();
});

// Explore opens on exactly the home sky, so nothing is redrawn while the page fades and the
// Moon shrinks to its sky size; closing cross-fades the sky back. RealSky runs both (on the GPU).
function open() {
  const b = explore.backdrop;
  explore.stopGlide();
  explore.view.value = { alt: b.alt, az: b.az, fovDeg: b.fovDeg };
  time.value = null;
  selection.value = null;
  explore.moonHidden.value = true;
  isOpen.value = true;
}

function close() {
  explore.stopGlide();
  selection.value = null;
  explore.hoverFigure.value = -1;
  explore.leaving.value = true;
  isOpen.value = false;
  time.value = null;
}

/** Leaves through the router, so the history entry that opened explore is consumed. */
function requestClose() {
  if (window.history.state?.back) router.back();
  else void navigateTo({ query: { ...route.query, sky: undefined } }, { replace: true });
}

onBeforeUnmount(() => {
  if (!isOpen.value) return;
  explore.stopGlide();
  isOpen.value = false;
  time.value = null;
  selection.value = null;
  explore.moonHidden.value = false;
  explore.leaving.value = false;
});

// ── Time slider ────────────────────────────────────────────────────────────
const dayStart = () => {
  const d = getNow();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const nowMinutes = computed(() => {
  const [h, m] = nowHHMM.value.split(":").map(Number);
  return h! * 60 + m!;
});
const sliderMinutes = computed<number | null>({
  get: () => (time.value ? Math.round((time.value.getTime() - dayStart()) / 60_000) : null),
  set: (m) => {
    time.value = m == null ? null : new Date(dayStart() + m * 60_000);
  },
});

// ── Info card, search, Back to the Moon ────────────────────────────────────
const info = computed(() => {
  const p = selection.value, c = cat.value;
  return p && c ? describePick(p, skyNow(), c, props.lat, props.lng) : null;
});

function goTo(target: SearchTarget) {
  const c = cat.value;
  if (!c) return;
  const p = pickForTarget(target);
  const { alt, az } = altAzOf(directionOf(p, skyNow(), c, props.lat, props.lng));
  selection.value = p;
  explore.glide({ alt, az, fovDeg: Math.min(explore.view.value.fovDeg, p.kind === "figure" ? 80 : 60) });
}

function backToMoon() {
  const { alt, az } = altAzOf(skyNow().moon.dir);
  explore.glide({ alt, az });
}

// ── Keyboard: Esc closes, arrows look around, + and − zoom ──────────────────
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] };
useEventListener(window, "keydown", (e: KeyboardEvent) => {
  if (!isOpen.value || e.target instanceof HTMLInputElement) return;
  const v = explore.view.value, step = ARROWS[e.key];
  if (e.key === "Escape") requestClose();
  else if (step) {
    explore.stopGlide();
    explore.view.value = pan(v, step[0], step[1], window.innerWidth);
  } else if (e.key === "+" || e.key === "=") explore.view.value = { ...v, fovDeg: Math.max(FOV_MIN, v.fovDeg * 0.8) };
  else if (e.key === "-" || e.key === "_") explore.view.value = { ...v, fovDeg: Math.min(Math.max(FOV_MAX, v.fovDeg), v.fovDeg * 1.25) };
  else return;
  e.preventDefault();
});
</script>
