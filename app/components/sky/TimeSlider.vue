<template>
  <div class="flex items-center gap-3 rounded-2xl border border-white/12 bg-[#0b1230]/85 px-4 pt-2 pb-8 backdrop-blur">
    <span class="w-11 shrink-0 text-sm tabular-nums">{{ hhmm(shown) }}</span>
    <div class="relative flex-1">
      <input type="range" min="0" max="1439" step="1" :value="shown" class="w-full accent-amber-300" aria-label="Time of day" @input="onInput" />
      <!-- Prayer stops, alternating between two rows so neighbours never overlap -->
      <button
        v-for="(s, i) in stops"
        :key="s.key"
        type="button"
        class="absolute -translate-x-1/2 text-[10px] leading-none"
        :class="s.minutes === modelValue ? 'text-amber-300' : 'text-white/50 hover:text-white/80'"
        :style="{ left: `${(s.minutes / 1439) * 100}%`, top: i % 2 ? '30px' : '18px' }"
        @click="emit('update:modelValue', s.minutes)"
      >
        {{ s.label }}
      </button>
    </div>
    <UButton label="Now" size="xs" color="neutral" variant="soft" :disabled="modelValue == null" @click="emit('update:modelValue', null)" />
  </div>
</template>

<script lang="ts" setup>
import { pad2 } from "@/utils/time";

const props = defineProps<{
  /** Minutes of the day; null = now. */
  modelValue: number | null;
  nowMinutes: number;
  stops: { key: string; label: string; minutes: number }[];
}>();
const emit = defineEmits<{ "update:modelValue": [minutes: number | null] }>();

/** Within this many minutes of a prayer, the slider snaps to it. */
const SNAP = 8;

const shown = computed(() => props.modelValue ?? props.nowMinutes);
const hhmm = (m: number) => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;

function onInput(e: Event) {
  const m = Number((e.target as HTMLInputElement).value);
  const stop = props.stops.find((s) => Math.abs(s.minutes - m) <= SNAP);
  emit("update:modelValue", stop ? stop.minutes : m);
}
</script>
