<template>
  <!-- Scrubber playground for the COMET · SONAR cue, now living inside the real
       OrbitBumps (so this renders exactly what the app/tray/widget show). -->
  <div class="h-screen w-screen overflow-hidden bg-[#05070f] text-white relative grid place-items-center select-none">
    <div class="absolute inset-0 opacity-70" style="background: radial-gradient(circle at 50% 42%, #131b40, #04060f 70%);" />

    <div class="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-4 py-3 text-xs">
      <div class="flex items-center gap-2">
        <UIcon name="lucide:orbit" class="size-4 text-indigo-300" />
        <span class="font-semibold">Orbit cue — Comet · Sonar</span>
        <span class="text-white/40 hidden sm:inline">— live in OrbitBumps (app · tray · widget)</span>
      </div>
      <label class="flex items-center gap-1.5 text-white/55 cursor-pointer">
        <input type="checkbox" v-model="showTruth" class="accent-indigo-400" /> truth panel
      </label>
    </div>

    <Transition enter-active-class="transition duration-200" enter-from-class="opacity-0 translate-x-2">
      <div v-if="showTruth" class="absolute top-14 right-4 z-20 w-52 rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-md p-3 text-xs space-y-2">
        <div class="flex items-center justify-between"><span class="text-white/45">Now</span><span class="tabular-nums font-semibold">{{ clock(nowMin) }}</span></div>
        <div class="flex items-center justify-between text-amber-200"><span>since {{ prevLabel }}</span><span class="tabular-nums">{{ dur(b.sinceMin) }}</span></div>
        <div class="flex items-center justify-between text-sky-200"><span>until {{ nextLabel }}</span><span class="tabular-nums">{{ dur(b.untilMin) }}</span></div>
      </div>
    </Transition>

    <div class="relative z-10">
      <OrbitBumps :prayers="flagged" :time="clock(nowMin)" :moon-phase="moonPhase" :size="420" />
    </div>

    <div class="absolute z-20 bottom-5 inset-x-0 flex justify-center px-4">
      <div class="flex items-center gap-3 rounded-full border border-white/12 bg-[#0b1130]/85 backdrop-blur-md px-3 py-2 text-xs shadow-xl w-full max-w-md">
        <button class="grid place-items-center size-7 rounded-full bg-white/10 hover:bg-white/20" @click="playing = !playing">
          <UIcon :name="playing ? 'lucide:pause' : 'lucide:play'" class="size-3.5" />
        </button>
        <input type="range" min="0" max="1439" step="1" v-model.number="nowMin" class="flex-1 accent-indigo-400" @input="playing = false" />
        <span class="tabular-nums text-white/70 w-10 text-right">{{ clock(nowMin) }}</span>
        <select v-model.number="minPerSec" class="bg-white/10 rounded px-1.5 py-1 outline-none">
          <option :value="30">slow</option>
          <option :value="120">1×</option>
          <option :value="360">fast</option>
        </select>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { createTimer } from "animejs";
import OrbitBumps from "@/components/prototypes/orbit/OrbitBumps.vue";
import { bracket, type BumpPrayer } from "@/components/prototypes/orbit/bump";

definePageMeta({ layout: false });

const LABELS: Record<string, string> = { fajr: "Fajr", sunrise: "Sunrise", dhuhr: "Dhuhr", asr: "ʿAṣr", maghrib: "Maghrib", isha: "ʿIshāʾ" };
const prayers: BumpPrayer[] = [
  { key: "fajr", time: "04:02" }, { key: "sunrise", time: "05:38" }, { key: "dhuhr", time: "13:20" },
  { key: "asr", time: "15:48" }, { key: "maghrib", time: "20:02" }, { key: "isha", time: "21:34" },
];

const moonPhase = 0.406;
const nowMin = ref(14 * 60 + 32);
const playing = ref(false);
const minPerSec = ref(120);
const showTruth = ref(true);

const pad = (n: number) => n.toString().padStart(2, "0");
// Round the total minutes FIRST, then split — otherwise a minute carry (e.g. 119.6
// → "01:00" instead of "02:00") makes the comet jump backwards for a frame.
const clock = (m: number) => {
  const t = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
};
const dur = (m: number) => { const x = Math.max(0, Math.round(m)); const h = Math.floor(x / 60); return h ? `${h}h ${pad(x % 60)}m` : `${x}m`; };

const b = computed(() => bracket(prayers, nowMin.value));
const prevLabel = computed(() => LABELS[nearest(b.value.prevMin)] ?? "");
const nextLabel = computed(() => LABELS[nearest(b.value.nextMin)] ?? "");
function nearest(min: number) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return prayers.reduce((best, p) => {
    const pm = parseInt(p.time.slice(0, 2)) * 60 + parseInt(p.time.slice(3));
    return Math.abs(pm - m) < Math.abs((parseInt(best.time.slice(0, 2)) * 60 + parseInt(best.time.slice(3))) - m) ? p : best;
  }, prayers[0]!).key;
}
const flagged = computed<BumpPrayer[]>(() =>
  prayers.map((p) => ({ ...p, isNext: p.key === nextLabelKey.value, isPast: p.time <= clock(nowMin.value) && p.key !== nextLabelKey.value }))
);
const nextLabelKey = computed(() => nearest(b.value.nextMin));

let timer: ReturnType<typeof createTimer> | null = null;
let last = 0;
onMounted(() => {
  timer = createTimer({
    duration: 1e12,
    loop: true,
    onUpdate: (self: any) => {
      const t = self.currentTime as number;
      const dt = t - last;
      last = t;
      if (playing.value && dt > 0) nowMin.value = (nowMin.value + (dt / 1000) * minPerSec.value) % 1440;
    },
  });
  timer.play?.();
});
onBeforeUnmount(() => timer?.pause?.());
</script>
