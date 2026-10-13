<template>
  <section>
    <p class="text-[11px] uppercase tracking-wider text-muted mb-1.5">Calculation</p>
    <div class="rounded-xl bg-elevated border border-default p-3 space-y-3">
      <div class="space-y-1.5">
        <label class="text-sm font-medium">Calculation method</label>
        <USelectMenu
          v-model="selectedMethodId"
          :items="methodSelectOptions"
          placeholder="Select method"
          label-key="label"
          value-key="value"
          class="w-full"
        />
      </div>
      <div class="space-y-1.5">
        <label class="text-sm font-medium">Display timezone</label>
        <USelectMenu
          v-model="selectedExtraTimezone"
          :items="timezoneSelectOptions"
          placeholder="Use my timezone"
          label-key="label"
          value-key="value"
          class="w-full"
          searchable
          searchable-placeholder="Search timezones..."
        />
      </div>
    </div>
  </section>
</template>

<script lang="ts" setup>
import { METHOD_OPTIONS, type MethodOption } from "@/constants/methods";

const { selectedMethodId, selectedExtraTimezone, userTimezone } = usePrayerRuntime();

const methodSelectOptions = computed(() =>
  METHOD_OPTIONS.map((m: MethodOption) => ({
    label: `${m.value} - ${m.label}`,
    value: m.value,
  }))
);

const timezoneSelectOptions = computed(() => {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch (error) {
    console.error(error);
    zones = [
      "UTC",
      "Europe/London",
      "Europe/Paris",
      "Africa/Cairo",
      "Asia/Riyadh",
      "Asia/Dubai",
      "Asia/Qatar",
      "Asia/Kuwait",
      "Asia/Doha",
      "Africa/Casablanca",
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
    ];
  }
  const items = zones.map((z) => ({ label: z, value: z }));
  items.unshift({
    label: `Use my timezone (${userTimezone})`,
    value: userTimezone,
  });
  return items;
});
</script>
