<template>
  <div
    v-if="showRamadanMode && ramadanInfo.isActive"
    class="rounded-xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 p-4 space-y-3"
  >
    <!-- Ramadan Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <UIcon name="lucide:moon-star" class="text-emerald-500 w-5 h-5" />
        <span class="font-semibold text-emerald-600 dark:text-emerald-400">Ramadan Mubarak</span>
      </div>
      <UBadge color="emerald" variant="soft" size="sm">
        Day {{ ramadanInfo.dayNumber }} of 30
      </UBadge>
    </div>

    <!-- Suhoor/Iftar Times -->
    <div class="grid grid-cols-2 gap-3">
      <!-- Suhoor -->
      <div class="bg-[var(--ui-bg)] rounded-lg p-3 text-center">
        <p class="text-xs text-muted uppercase tracking-wider mb-1">Suhoor Ends</p>
        <p class="text-lg font-bold">{{ suhoorIftarTimes.suhoorEnd || '--:--' }}</p>
        <p
          v-if="suhoorIftarTimes.suhoorCountdown && !suhoorIftarTimes.isFasting"
          class="text-xs text-emerald-600 dark:text-emerald-400 mt-1"
        >
          in {{ suhoorIftarTimes.suhoorCountdown }}
        </p>
      </div>

      <!-- Iftar -->
      <div class="bg-[var(--ui-bg)] rounded-lg p-3 text-center">
        <p class="text-xs text-muted uppercase tracking-wider mb-1">Iftar Time</p>
        <p class="text-lg font-bold">{{ suhoorIftarTimes.iftarTime || '--:--' }}</p>
        <p
          v-if="suhoorIftarTimes.iftarCountdown && suhoorIftarTimes.isFasting"
          class="text-xs text-emerald-600 dark:text-emerald-400 mt-1"
        >
          in {{ suhoorIftarTimes.iftarCountdown }}
        </p>
      </div>
    </div>

    <!-- Fasting Status -->
    <div class="flex items-center justify-center gap-2 text-sm">
      <UIcon
        :name="suhoorIftarTimes.isFasting ? 'lucide:sunrise' : 'lucide:moon'"
        class="w-4 h-4"
        :class="suhoorIftarTimes.isFasting ? 'text-amber-500' : 'text-indigo-500'"
      />
      <span class="text-muted">
        {{ suhoorIftarTimes.isFasting ? 'Fasting in progress' : 'Not fasting time' }}
      </span>
    </div>
  </div>
</template>

<script lang="ts" setup>
import type { RamadanInfo, SuhoorIftarTimes } from '@/composables/useIslamicCalendar';

defineProps<{
  showRamadanMode: boolean;
  ramadanInfo: RamadanInfo;
  suhoorIftarTimes: SuhoorIftarTimes;
}>();
</script>
