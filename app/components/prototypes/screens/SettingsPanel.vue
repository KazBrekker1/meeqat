<template>
  <PrototypesCelestialSkyBackground class="h-full" :stars="40" :seed="3" :shooting="false" scrim="full">
    <div class="h-full flex flex-col">
      <header class="flex items-center gap-2 px-3 h-11 shrink-0 border-b border-white/10">
        <UButton icon="lucide:arrow-left" size="xs" variant="ghost" color="neutral" class="text-white/70" />
        <h1 class="text-sm font-semibold">Settings</h1>
      </header>

      <div class="flex-1 overflow-y-auto p-3 space-y-4">
        <!-- Location mode segmented -->
        <section>
          <p class="text-[11px] uppercase tracking-wider text-white/45 mb-1.5">Location</p>
          <div class="grid grid-cols-2 gap-1 p-1 rounded-lg bg-white/[0.06] border border-white/10">
            <button class="flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm bg-indigo-400/25 ring-1 ring-indigo-300/40 font-medium">
              <UIcon name="lucide:building-2" class="size-4" /> City
            </button>
            <button class="flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm text-white/65">
              <UIcon name="lucide:satellite" class="size-4" /> GPS
            </button>
          </div>
        </section>

        <!-- Toggles -->
        <section class="rounded-xl bg-white/[0.05] border border-white/10 divide-y divide-white/[0.07] overflow-hidden">
          <div v-for="row in toggles" :key="row.label" class="flex items-center gap-3 px-3 py-2">
            <UIcon :name="row.icon" class="size-4 text-white/55 shrink-0" />
            <div class="flex-1 min-w-0">
              <p class="text-sm">{{ row.label }}</p>
              <p class="text-[11px] text-white/45">{{ row.hint }}</p>
            </div>
            <span class="relative inline-flex h-5 w-9 items-center rounded-full transition" :class="row.on ? 'bg-indigo-400' : 'bg-white/15'">
              <span class="inline-block size-4 transform rounded-full bg-white transition" :class="row.on ? 'translate-x-4' : 'translate-x-0.5'" />
            </span>
          </div>
        </section>

        <!-- Calculation method (select look) -->
        <section>
          <p class="text-[11px] uppercase tracking-wider text-white/45 mb-1.5">Calculation method</p>
          <button class="w-full flex items-center justify-between rounded-lg bg-white/[0.06] border border-white/10 px-3 py-2 text-sm">
            <span>Egyptian General Authority</span>
            <UIcon name="lucide:chevrons-up-down" class="size-4 text-white/50" />
          </button>
        </section>

        <!-- Notifications -->
        <section>
          <p class="text-[11px] uppercase tracking-wider text-white/45 mb-1.5">Notifications</p>
          <div class="grid grid-cols-3 gap-1.5">
            <span v-for="t in ['At time','5 min','15 min']" :key="t" class="rounded-md bg-white/[0.06] border border-white/10 py-1.5 text-center text-xs">{{ t }}</span>
          </div>
          <UButton label="Send test notification" icon="lucide:bell" size="sm" color="neutral" variant="soft" block class="mt-2" />
        </section>

        <UButton label="Clear cache" icon="lucide:trash-2" size="sm" color="error" variant="soft" block />
      </div>
    </div>
  </PrototypesCelestialSkyBackground>
</template>

<script lang="ts" setup>
import type { CelestialData } from "../celestial/data";
defineProps<{ d: CelestialData }>();

const toggles = [
  { label: "24-hour time", hint: "Show times as 13:20 instead of 1:20 PM", icon: "lucide:clock", on: true },
  { label: "Additional times", hint: "Sunrise, Imsak, Midnight", icon: "lucide:sunrise", on: true },
  { label: "Prayer notifications", hint: "Alert before each prayer", icon: "lucide:bell-ring", on: false },
];
</script>
