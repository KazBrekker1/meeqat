<!-- PROTOTYPE — slim always-visible daily times strip for the orbit-hero hybrid.
     Six equal columns (label over time), next prayer highlighted amber, past dimmed.
     Replaces hover/tap-to-reveal (which a home-screen widget can't do) so every
     prayer time stays glanceable without opening the app. Maps to a fixed RemoteViews
     row of weighted TextView columns. -->
<script setup lang="ts">
import type { WidgetPrayer } from "./data";
defineProps<{ prayers: WidgetPrayer[] }>();
</script>

<template>
  <div class="flex w-full items-stretch gap-1">
    <div
      v-for="p in prayers" :key="p.label"
      class="flex min-w-0 flex-1 flex-col items-center rounded-md px-0.5 py-1"
      :class="p.next ? 'bg-[#fcd34d]/15 ring-1 ring-[#fcd34d]/30' : ''"
    >
      <span
        class="w-full whitespace-nowrap text-center text-[9px] font-medium leading-tight"
        :class="p.next ? 'text-[#fde68a]' : p.past ? 'text-white/35' : 'text-white/55'"
      >{{ p.label }}</span>
      <span
        class="font-mono text-[11px] tabular-nums leading-tight"
        :class="p.next ? 'font-semibold text-[#fde68a]' : p.past ? 'text-white/40' : 'text-white/80'"
      >{{ p.time }}</span>
    </div>
  </div>
</template>
