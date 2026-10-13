<template>
  <div>
    <h2 class="text-[11px] uppercase tracking-wider text-white/45 mb-1.5 px-1">Today's prayers</h2>
    <!-- Only when the chosen city's UTC offset differs from this device's -->
    <p v-if="timezoneNote && timingsList.length" class="text-[10px] text-white/35 -mt-1 mb-1.5 px-1">{{ timezoneNote }}</p>
    <PrayerSkeleton v-if="isLoading && !timingsList.length" :count="6" />
    <ul v-else-if="timingsList.length" class="rounded-xl bg-white/[0.06] border border-white/10 divide-y divide-white/[0.07] overflow-hidden">
      <li
        v-for="t in timingsList"
        :key="t.key"
        class="flex items-center gap-2.5 px-3 py-2"
        :class="[t.isPast ? 'opacity-45' : '', t.isNext ? 'bg-white/[0.08]' : '']"
      >
        <UIcon :name="t.isNext ? 'lucide:star' : iconFor(t.key.toLowerCase())" class="size-4 shrink-0" :class="t.isNext ? 'text-amber-300 fill-amber-300' : 'text-white/45'" />
        <span class="text-sm flex-1 truncate" :class="t.isNext ? 'font-semibold' : ''">{{ t.label }}</span>
        <span v-if="t.isNext && shortCountdown" class="text-[10px] text-amber-300/80 tabular-nums shrink-0">in {{ shortCountdown }}</span>
        <span v-else-if="t.altTime" class="text-xs tabular-nums text-white/40">{{ t.altTime }}</span>
        <span class="text-sm tabular-nums font-mono" :class="t.isNext ? 'text-indigo-100' : 'text-white/65'">{{ t.time }}</span>
      </li>
    </ul>
    <div v-else class="text-center py-8 text-white/55">
      <UIcon name="lucide:map-pin" class="size-8 mx-auto mb-2 text-white/30" />
      <p class="text-sm mb-3">Choose where you are to see prayer times</p>
      <UButton icon="lucide:map-pin" label="Choose location" @click="emit('choose-location')" />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { iconFor } from "@/constants/prayerIcons";

/** "Today's prayers": the list, its loading skeleton, or the prompt to choose a place. */
const emit = defineEmits<{ "choose-location": [] }>();

const { isLoading, timingsList, countdownToNext, timezoneNote } = usePrayerRuntime();

// Short "in MM:SS"/"in HH:MM" badge next to the next prayer in the list.
const shortCountdown = computed(() => (countdownToNext.value || "").split(":").slice(0, 2).join(":"));
</script>
