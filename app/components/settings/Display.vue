<template>
  <section>
    <p class="text-[11px] uppercase tracking-wider text-muted mb-1.5">Display</p>
    <div class="rounded-xl bg-elevated border border-default divide-y divide-default overflow-hidden">
      <div class="flex items-center justify-between gap-3 px-4 py-3">
        <div>
          <p class="text-sm font-medium">Time format</p>
          <p class="text-xs text-muted">12-hour or 24-hour</p>
        </div>
        <UButton size="sm" variant="soft" @click="toggleTimeFormat">
          {{ timeFormat === '24h' ? '24h' : '12h' }}
        </UButton>
      </div>
      <div class="flex items-center justify-between gap-3 px-4 py-3">
        <div>
          <p class="text-sm font-medium">Additional times</p>
          <p class="text-xs text-muted">Imsak, Midnight, night thirds</p>
        </div>
        <USwitch
          :model-value="showAdditionalTimes"
          @update:model-value="toggleAdditionalTimes"
        />
      </div>
      <div class="flex items-center justify-between gap-3 px-4 py-3">
        <div>
          <p class="text-sm font-medium">Sounds</p>
          <p class="text-xs text-muted">Soft cues for calls, messages and prayer times</p>
        </div>
        <USwitch :model-value="soundsEnabled" aria-label="Sounds" @update:model-value="toggleSounds" />
      </div>
      <div class="px-4 py-3">
        <div class="flex items-baseline justify-between gap-3">
          <p class="text-sm font-medium">Moon style</p>
          <p class="text-xs text-muted">{{ moonStyleLabel }}</p>
        </div>
        <div role="radiogroup" aria-label="Moon style" class="mt-2 grid grid-cols-6 gap-1">
          <button
            v-for="opt in MOON_STYLE_OPTIONS"
            :key="opt.value"
            type="button"
            role="radio"
            :aria-checked="moonStyle === opt.value"
            :aria-label="opt.label"
            :title="opt.label"
            class="grid place-items-center rounded-xl py-1 cursor-pointer transition-colors"
            :class="moonStyle === opt.value ? 'bg-primary/15 ring-1 ring-primary/40' : 'hover:bg-accented/50'"
            @click="pickMoonStyle(opt.value)"
          >
            <CelestialMoonSphere
              :variant="opt.value"
              :phase="moonPhase"
              :lat="activeCoords?.lat ?? null"
              :lng="activeCoords?.lng ?? null"
              :size="44"
              :disc="0.82"
              :glow="false"
            />
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script lang="ts" setup>
import { cue, saveSoundsPreference, soundsEnabled } from '@/utils/sounds';
import { MOON_STYLE_OPTIONS, moonStyle, saveMoonStylePreference, type MoonStyle } from '@/utils/moonStyle';

defineProps<{
  /** Phase drawn by the moon-style thumbnails. */
  moonPhase: number;
}>();

const { timeFormat, showAdditionalTimes, activeCoords } = usePrayerRuntime();

function toggleTimeFormat() {
  timeFormat.value = timeFormat.value === '24h' ? '12h' : '24h';
}

function toggleAdditionalTimes() {
  cue('toggled');
  showAdditionalTimes.value = !showAdditionalTimes.value;
}

function toggleSounds(on: boolean) {
  void saveSoundsPreference(on);
  cue('toggled'); // audible only when turning sounds on
}

// Moon style picker: live thumbnails of every style at the current phase.
const moonStyleLabel = computed(() => MOON_STYLE_OPTIONS.find((o) => o.value === moonStyle.value)?.label ?? '');
function pickMoonStyle(style: MoonStyle) {
  if (style === moonStyle.value) return;
  cue('toggled');
  void saveMoonStylePreference(style);
}
</script>
