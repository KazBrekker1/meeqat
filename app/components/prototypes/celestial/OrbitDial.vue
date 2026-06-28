<template>
  <!-- The dial is now the spring "blooming bumps" orbit with a pure-moon centre. -->
  <PrototypesOrbitBumps :prayers="prayers" :time="time" :moon-phase="moonPhase" :size="size" />
</template>

<script lang="ts" setup>
import type { BumpPrayer } from "../orbit/bump";

withDefaults(
  defineProps<{
    prayers: BumpPrayer[];
    time: string;
    moonPhase: number;
    size?: number;
    /** kept for call-site compatibility; entrance is hover-driven now */
    animateIn?: boolean;
  }>(),
  { size: 248, animateIn: true }
);
</script>
