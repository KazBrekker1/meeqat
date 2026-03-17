<template>
  <UDrawer
    :open="open"
    @update:open="$emit('update:open', $event)"
    title="Calendar"
    description="View prayer times for a specific date"
  >
    <template #body>
      <div class="space-y-4 pb-4">
        <!-- Date display -->
        <div class="text-center space-y-0.5">
          <p v-if="hijriDateVerbose" class="text-sm font-medium">
            {{ hijriDateVerbose }}
          </p>
          <p v-if="gregorianDateVerbose" class="text-xs text-muted">
            {{ gregorianDateVerbose }}
          </p>
        </div>

        <!-- Calendar controls -->
        <div class="flex items-center justify-center gap-2">
          <UFieldGroup size="xs">
            <UButton
              :variant="calendarSystem === 'islamic' ? 'solid' : 'outline'"
              @click="calendarSystem !== 'islamic' && $emit('toggle-calendar-system')"
              label="Hijri"
              icon="lucide:moon"
            />
            <UButton
              :variant="calendarSystem === 'gregorian' ? 'solid' : 'outline'"
              @click="calendarSystem !== 'gregorian' && $emit('toggle-calendar-system')"
              label="Gregorian"
              icon="lucide:sun"
            />
          </UFieldGroup>
          <UButton
            v-if="showTodayButton"
            @click="$emit('select-today')"
            label="Today"
            size="xs"
            variant="soft"
            icon="lucide:calendar-check"
          />
        </div>

        <!-- Calendar -->
        <UCalendar
          :model-value="calendarDate"
          @update:model-value="onCalendarDateUpdate"
          :placeholder="calendarPlaceholder"
          @update:placeholder="onPlaceholderUpdate"
        >
          <template #heading>
            <span class="text-sm font-semibold">{{ calendarHeading }}</span>
          </template>
          <template #day="{ day }">
            <UTooltip :text="formatTooltip(day)" :delay-duration="0">
              <span>{{ day.day }}</span>
            </UTooltip>
          </template>
        </UCalendar>
      </div>
    </template>
  </UDrawer>
</template>

<script lang="ts" setup>
import type { DateValue, CalendarDate } from "@internationalized/date";

const props = defineProps<{
  open: boolean;
  calendarDate: CalendarDate;
  calendarPlaceholder: CalendarDate;
  calendarSystem: "islamic" | "gregorian";
  calendarHeading: string;
  isToday: boolean;
  hijriDateVerbose?: string;
  gregorianDateVerbose?: string;
  formatTooltip: (day: DateValue) => string;
}>();

const showTodayButton = computed(() => {
  if (!props.isToday) return true;
  // Also show if the visible month differs from the selected date's month
  const p = props.calendarPlaceholder;
  const d = props.calendarDate;
  return p.month !== d.month || p.year !== d.year;
});

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "update:calendarDate", value: CalendarDate): void;
  (e: "update:calendarPlaceholder", value: CalendarDate): void;
  (e: "toggle-calendar-system"): void;
  (e: "select-today"): void;
}>();

function onCalendarDateUpdate(val: unknown) {
  if (val) emit('update:calendarDate', val as CalendarDate);
}

function onPlaceholderUpdate(val: unknown) {
  if (val) emit('update:calendarPlaceholder', val as CalendarDate);
}
</script>
