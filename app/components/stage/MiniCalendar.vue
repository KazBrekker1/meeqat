<template>
  <div>
    <div class="flex items-center justify-between mb-1.5">
      <div class="flex p-0.5 rounded-lg bg-white/[0.06] border border-white/10 text-xs">
        <button
          class="px-2.5 py-0.5 rounded-md transition-colors cursor-pointer"
          :class="calendarSystem === 'islamic' ? 'bg-indigo-400/25 ring-1 ring-indigo-300/40 font-medium' : 'text-white/60 hover:text-white'"
          @click="calendarSystem !== 'islamic' && emit('toggle-calendar-system')"
        >Hijri</button>
        <button
          class="px-2.5 py-0.5 rounded-md transition-colors cursor-pointer"
          :class="calendarSystem === 'gregorian' ? 'bg-indigo-400/25 ring-1 ring-indigo-300/40 font-medium' : 'text-white/60 hover:text-white'"
          @click="calendarSystem !== 'gregorian' && emit('toggle-calendar-system')"
        >Gregorian</button>
      </div>
      <UButton icon="lucide:calendar-check" size="xs" variant="ghost" color="neutral" class="text-white/60" aria-label="Jump to today" @click="emit('select-today')" />
    </div>
    <UCalendar
      v-model="calendarDate"
      v-model:placeholder="calendarPlaceholder"
      size="sm"
      class="rounded-xl bg-white/[0.04] border border-white/10 p-2"
    >
      <template #heading>
        <span class="text-sm font-semibold">{{ calendarHeading }}</span>
      </template>
      <template #day="{ day }">
        <span class="relative grid place-items-center w-full h-full">
          {{ day.day }}
          <CelestialMoonPhase
            :phase="lunarPhaseOfDay(day)"
            :size="10"
            :glow="false"
            :craters="false"
            dark-color="#0a1024"
            class="absolute bottom-0 right-0"
          />
        </span>
      </template>
    </UCalendar>
    <!-- Times for the picked date; today's stay in the list above -->
    <div v-if="selectedDayTimes.length" class="mt-2 rounded-xl bg-white/[0.04] border border-white/10 px-2 py-1.5">
      <p class="text-[11px] text-white/45 mb-1 px-1">Prayer times · {{ selectedDayLabel }}</p>
      <div class="grid grid-cols-3 gap-1 text-center">
        <div v-for="t in selectedDayTimes" :key="t.key">
          <div class="text-[10px] text-white/45">{{ t.label }}</div>
          <div class="text-xs tabular-nums font-mono text-white/80">{{ t.time }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import type { CalendarDate } from "@internationalized/date";
import { lunarPhaseOfDay } from "@/composables/useHijriCalendar";

/** The side panel's month view (wide windows); same calendar state as the drawer. */
const calendarDate = defineModel<CalendarDate>("calendarDate", { required: true });
const calendarPlaceholder = defineModel<CalendarDate>("calendarPlaceholder", { required: true });

defineProps<{
  calendarSystem: "islamic" | "gregorian";
  calendarHeading: string;
  selectedDayLabel: string;
  selectedDayTimes: { key: string; label: string; time: string }[];
}>();

const emit = defineEmits<{
  "toggle-calendar-system": [];
  "select-today": [];
}>();
</script>
