<!-- PROTOTYPE chrome: a launcher-masked widget box at a fixed size + caption.
     Only provides the rounded clip the home screen applies; the widget design
     (background, content) lives in each variant. -->
<script setup lang="ts">
defineProps<{ label: string; w: number; h: number }>();
</script>

<template>
  <figure class="m-0 inline-block align-top">
    <div
      class="overflow-hidden rounded-[26px] shadow-2xl shadow-black/50 ring-1 ring-white/10"
      :style="{ width: w + 'px', height: h + 'px' }"
    >
      <slot />
    </div>
    <figcaption class="mt-1.5 text-center font-mono text-[11px] text-white/40">{{ label }}</figcaption>
  </figure>
</template>
