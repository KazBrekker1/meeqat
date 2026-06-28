<template>
  <UDrawer
    v-model:open="open"
    title="Calendar"
    description="View prayer times for a specific date"
  >
    <template #body>
      <div class="space-y-3 pb-4">
        <!-- Hijri / Gregorian segmented -->
        <div class="grid grid-cols-2 gap-1 p-1 rounded-xl bg-elevated border border-default">
          <button
            class="flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm cursor-pointer transition-colors"
            :class="calendarSystem === 'islamic' ? 'bg-primary/15 ring-1 ring-primary/40 font-medium' : 'text-muted hover:text-default'"
            @click="calendarSystem !== 'islamic' && $emit('toggle-calendar-system')"
          >
            <UIcon name="lucide:moon" class="size-4" /> Hijri
          </button>
          <button
            class="flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm cursor-pointer transition-colors"
            :class="calendarSystem === 'gregorian' ? 'bg-primary/15 ring-1 ring-primary/40 font-medium' : 'text-muted hover:text-default'"
            @click="calendarSystem !== 'gregorian' && $emit('toggle-calendar-system')"
          >
            <UIcon name="lucide:sun" class="size-4" /> Gregorian
          </button>
        </div>

        <!-- Calendar grid -->
        <UCalendar
          v-model="calendarDate"
          v-model:placeholder="calendarPlaceholder"
          class="rounded-xl bg-elevated border border-default p-2"
        >
          <template #heading>
            <span class="text-sm font-semibold">{{ calendarHeading }}</span>
          </template>
          <template #day="{ day }">
            <UTooltip :text="formatTooltip(day)" :delay-duration="0">
              <span class="relative grid place-items-center w-full h-full">
                {{ day.day }}
                <PrototypesCelestialMoonPhase
                  :phase="lunarPhaseOfDay(day)"
                  :size="10"
                  :glow="false"
                  :craters="false"
                  dark-color="#0a1024"
                  class="absolute bottom-0 right-0"
                />
              </span>
            </UTooltip>
          </template>
        </UCalendar>

        <!-- Selected day detail -->
        <div class="rounded-xl bg-elevated border border-default p-3 flex items-center gap-3">
          <PrototypesCelestialMoonPhase :phase="selectedPhase" :size="52" halo halo-color="#cdd6ff" />
          <div class="leading-tight min-w-0">
            <p v-if="hijriDateVerbose" class="text-sm font-semibold truncate">{{ hijriDateVerbose }}</p>
            <p v-if="gregorianDateVerbose" class="text-xs text-muted truncate">{{ gregorianDateVerbose }}</p>
            <p class="text-xs text-muted mt-0.5">{{ selectedPhaseName }} · {{ selectedIllum }}% illuminated</p>
          </div>
        </div>

        <!-- Jump to today -->
        <UButton
          block
          label="Jump to today"
          icon="lucide:calendar-check"
          color="neutral"
          variant="soft"
          @click="$emit('select-today')"
        />
      </div>
    </template>
  </UDrawer>
</template>

<script lang="ts" setup>
import type { DateValue, CalendarDate } from "@internationalized/date";
import { moonIllumination, moonPhaseName } from "@/components/prototypes/celestial/lunar";
import { lunarPhaseOfDay } from "@/composables/useHijriCalendar";

const open = defineModel<boolean>("open", { default: false });
const calendarDate = defineModel<CalendarDate>("calendarDate", { required: true });
const calendarPlaceholder = defineModel<CalendarDate>("calendarPlaceholder", { required: true });

defineProps<{
  calendarSystem: "islamic" | "gregorian";
  calendarHeading: string;
  hijriDateVerbose?: string;
  gregorianDateVerbose?: string;
  formatTooltip: (day: DateValue) => string;
}>();

defineEmits<{
  "toggle-calendar-system": [];
  "select-today": [];
}>();

// Selected-day moon detail.
const selectedPhase = computed(() => lunarPhaseOfDay(calendarDate.value));
const selectedIllum = computed(() => moonIllumination(selectedPhase.value));
const selectedPhaseName = computed(() => moonPhaseName(selectedPhase.value));
</script>
