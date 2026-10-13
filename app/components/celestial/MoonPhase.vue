<template>
  <svg
    :width="size"
    :height="size"
    viewBox="-50 -50 100 100"
    class="overflow-visible block"
    role="img"
    :aria-label="`Moon phase ${Math.round(phase * 100)}%`"
  >
    <defs>
      <radialGradient :id="`lit-${uid}`" cx="38%" cy="30%" r="80%">
        <stop offset="0%" stop-color="#fffdf6" />
        <stop offset="55%" stop-color="#f1ede0" />
        <stop offset="100%" stop-color="#cfc7b4" />
      </radialGradient>
      <radialGradient :id="`halo-${uid}`" cx="50%" cy="50%" r="50%">
        <stop offset="55%" :stop-color="haloColor" stop-opacity="0.35" />
        <stop offset="100%" :stop-color="haloColor" stop-opacity="0" />
      </radialGradient>
      <clipPath :id="`clip-${uid}`">
        <path :d="litPath" />
      </clipPath>
    </defs>

    <!-- Glow halo -->
    <circle v-if="halo" cx="0" cy="0" :r="r * 1.6" :fill="`url(#halo-${uid})`" />

    <!-- Unlit disk -->
    <circle cx="0" cy="0" :r="r" :fill="darkColor" />

    <!-- Illuminated portion (physically-shaped terminator) -->
    <path
      :d="litPath"
      :fill="`url(#lit-${uid})`"
      :style="glow ? { filter: 'drop-shadow(0 0 5px rgba(255,250,235,0.55))' } : undefined"
    />

    <!-- Craters, clipped to the lit area -->
    <g v-if="craters" :clip-path="`url(#clip-${uid})`" fill="#a39a86" opacity="0.18">
      <circle cx="-9" cy="-12" r="6.5" />
      <circle cx="13" cy="7" r="9" />
      <circle cx="3" cy="20" r="4.5" />
      <circle cx="22" cy="-13" r="3.5" />
      <circle cx="-2" cy="-2" r="3" />
    </g>

    <!-- Rim -->
    <circle cx="0" cy="0" :r="r" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="0.75" />
  </svg>
</template>

<script lang="ts" setup>
import { useId } from "vue";

const props = withDefaults(
  defineProps<{
    /** 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter */
    phase: number;
    size?: number;
    glow?: boolean;
    craters?: boolean;
    halo?: boolean;
    haloColor?: string;
    darkColor?: string;
  }>(),
  { size: 96, glow: true, craters: true, halo: false, haloColor: "#cdd6ff", darkColor: "#0c1226" }
);

const uid = useId();
const r = 46;

/**
 * Lit-region path. The bright limb is the moon's true circular edge; the
 * terminator is an ellipse whose semi-minor axis shrinks to 0 at the quarters.
 */
const litPath = computed(() => {
  const p = ((props.phase % 1) + 1) % 1;
  const ang = 2 * Math.PI * p;
  const cos = Math.cos(ang);
  const a = Math.abs(cos) * r; // terminator semi-minor axis
  const waxing = p < 0.5; // lit on the right while waxing
  const gibbous = cos < 0; // illuminated fraction > 50%
  const limbSweep = waxing ? 1 : 0;
  // terminator bulges away from the lit limb; sweep matches when the disc is
  // gibbous vs crescent (inverting this shows the complement of the true phase).
  const termSweep = waxing === gibbous ? 1 : 0;
  return `M0,${-r} A${r},${r} 0 0 ${limbSweep} 0,${r} A${a.toFixed(2)},${r} 0 0 ${termSweep} 0,${-r} Z`;
});
</script>
