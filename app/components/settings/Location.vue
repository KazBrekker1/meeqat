<template>
  <section>
    <p class="text-[11px] uppercase tracking-wider text-muted mb-1.5">Location</p>
    <div class="grid grid-cols-2 gap-1 p-1 rounded-xl bg-elevated border border-default">
      <button
        class="flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm cursor-pointer transition-colors"
        :class="locationMode !== 'gps' ? 'bg-primary/15 ring-1 ring-primary/40 font-medium' : 'text-muted hover:text-default'"
        @click="setLocationMode('city')"
      >
        <UIcon name="i-lucide-building-2" class="size-4" /> City
      </button>
      <button
        class="flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm cursor-pointer transition-colors"
        :class="locationMode === 'gps' ? 'bg-primary/15 ring-1 ring-primary/40 font-medium' : 'text-muted hover:text-default'"
        @click="setLocationMode('gps')"
      >
        <UIcon name="i-lucide-satellite" class="size-4" /> GPS
      </button>
    </div>

    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <LazyPrayerLocationMapPicker
        v-if="locationMode === 'gps'"
        class="mt-3"
        :lat="gpsLat"
        :lng="gpsLng"
        @update:location="setGpsLocation"
      />
    </Transition>
  </section>
</template>

<script lang="ts" setup>
const { locationMode, gpsLat, gpsLng } = usePrayerRuntime();
const { setLocationMode, setGpsLocation } = useLocationActions();
</script>
