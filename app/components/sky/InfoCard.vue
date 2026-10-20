<template>
  <div class="rounded-2xl border border-white/12 bg-[#0b1230]/90 px-4 py-3 shadow-xl backdrop-blur" role="dialog" :aria-label="info.title">
    <div class="flex items-baseline gap-2">
      <span class="font-semibold">{{ info.title }}</span>
      <span v-if="info.ar" class="text-amber-200" dir="rtl">{{ info.ar }}</span>
      <UButton icon="lucide:x" size="xs" color="neutral" variant="ghost" class="-me-2 ms-auto text-white/50" aria-label="Close" @click="emit('close')" />
    </div>
    <p class="text-xs text-white/50">{{ info.kind }}</p>
    <p v-for="d in info.details" :key="d" class="mt-0.5 text-sm tabular-nums text-white/80">{{ d }}</p>
  </div>
</template>

<script lang="ts" setup>
import type { SkyInfo } from "@/utils/sky/describe";

defineProps<{ info: SkyInfo }>();
const emit = defineEmits<{ close: [] }>();
</script>
