<template>
  <!-- Three quiet chips under the date: moon · sun · qibla -->
  <div
    v-if="compact"
    class="grid grid-cols-[1fr_1.22fr_1fr] gap-1.5 w-full"
  >
    <div :class="chip" class="px-2 py-[7px] gap-[7px]">
      <PrototypesCelestialMoonSphere :phase="moon.phase" :lat="lat" :lng="lng" :size="22" :disc="0.92" :glow="false" />
      <div class="min-w-0">
        <div :class="mainText" class="text-xs">{{ moonPercent }}%</div>
        <div :class="subText" class="text-[10px] truncate">{{ moonName.replace("Waxing ", "Wax. ").replace("Waning ", "Wan. ") }}</div>
      </div>
    </div>
    <div v-if="sunrise && sunset" :class="chip" class="px-2 py-[7px] gap-1.5">
      <UIcon name="lucide:sunrise" class="size-4 shrink-0 text-orange-300" />
      <div class="min-w-0">
        <div :class="mainText" class="text-xs whitespace-nowrap">{{ stripAmPm(sunrise) }}<span class="text-white/35"> → </span>{{ stripAmPm(sunset) }}</div>
        <div :class="subText" class="text-[10px]">Sunrise–Sunset</div>
      </div>
    </div>
    <button v-if="qibla != null" type="button" :class="chip" class="px-2 py-[7px] gap-[7px] text-left cursor-pointer" aria-label="Show Qibla direction" @click="emit('qibla')">
      <QiblaNeedle :bearing="qibla" />
      <div class="min-w-0">
        <div :class="mainText" class="text-xs whitespace-nowrap">{{ Math.round(qibla) }}° {{ compassPoint(qibla) }}</div>
        <div :class="subText" class="text-[10px]">Qibla</div>
      </div>
    </button>
  </div>

  <div v-else class="flex gap-2.5 justify-center flex-wrap">
    <div :class="chip" class="py-2 pl-2.5 pr-3.5 gap-2.5">
      <span class="size-7 grid place-items-center shrink-0">
        <PrototypesCelestialMoonSphere :phase="moon.phase" :lat="lat" :lng="lng" :size="24" :disc="0.92" :glow="false" />
      </span>
      <div>
        <div :class="mainText" class="text-[13px]">{{ moonName }}</div>
        <div :class="subText" class="text-[11px]">{{ moonPercent }}% illuminated</div>
      </div>
    </div>
    <div v-if="sunrise && sunset" :class="chip" class="py-2 pl-2.5 pr-3.5 gap-2.5">
      <span :class="tile"><UIcon name="lucide:sunrise" class="size-4 text-orange-300" /></span>
      <div>
        <div :class="mainText" class="text-[13px]">{{ sunrise }} <span class="text-white/30">→</span> {{ sunset }}</div>
        <div :class="subText" class="text-[11px]">Sunrise · sunset<template v-if="dayLength"> · {{ dayLength }} of day</template></div>
      </div>
    </div>
    <button v-if="qibla != null" type="button" :class="chip" class="py-2 pl-2.5 pr-3.5 gap-2.5 text-left cursor-pointer hover:bg-white/[0.07] transition-colors" aria-label="Show Qibla direction" @click="emit('qibla')">
      <span :class="tile"><QiblaNeedle :bearing="qibla" /></span>
      <div>
        <div :class="mainText" class="text-[13px]">{{ Math.round(qibla) }}° {{ compassPoint(qibla) }}</div>
        <div :class="subText" class="text-[11px]">Qibla<template v-if="place"> from {{ place }}</template></div>
      </div>
    </button>
  </div>
</template>

<script lang="ts" setup>
import { h, type FunctionalComponent } from "vue";
import { compassPoint } from "@/utils/qibla";
import { moonPhaseName } from "@/components/prototypes/celestial/lunar";

const props = defineProps<{
  /** From moonView: phase 0..1 and illuminated fraction 0..1. */
  moon: { phase: number; fraction: number };
  lat: number | null;
  lng: number | null;
  sunrise?: string;
  sunset?: string;
  dayLength?: string;
  qibla: number | null;
  place?: string | null;
  compact?: boolean;
}>();
const emit = defineEmits<{ qibla: [] }>();

const chip = "flex items-center rounded-[14px] bg-white/[0.045] border border-white/[0.08] backdrop-blur-md";
const tile = "size-7 rounded-[9px] grid place-items-center shrink-0 bg-white/5 text-white/70";
const mainText = "text-white/90 leading-tight tabular-nums";
const subText = "text-white/45 leading-tight";

const moonPercent = computed(() => Math.round(props.moon.fraction * 100));
const moonName = computed(() => moonPhaseName(props.moon.phase));
const stripAmPm = (t: string) => t.replace(/\s*[AP]M$/i, "");

/** Compass ring with a gold needle turned to the bearing (clockwise from north). */
const QiblaNeedle: FunctionalComponent<{ bearing: number }> = ({ bearing }) =>
  h("svg", { width: 20, height: 20, viewBox: "-10 -10 20 20", class: "shrink-0", "aria-hidden": "true" }, [
    h("circle", { r: 8.6, fill: "none", stroke: "rgba(255,255,255,.28)", "stroke-width": 1 }),
    h("text", { y: -4.6, "font-size": 4.2, "text-anchor": "middle", fill: "rgba(255,255,255,.45)" }, "N"),
    h("g", { transform: `rotate(${bearing})` }, [
      h("path", { d: "M0,-7 L2.1,0 L0,-1 L-2.1,0 Z", fill: "#fcd34d" }),
      h("path", { d: "M0,4.5 L1.3,0 L-1.3,0 Z", fill: "rgba(255,255,255,.3)" }),
    ]),
  ]);
QiblaNeedle.props = ["bearing"];
</script>
