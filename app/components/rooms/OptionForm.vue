<template>
  <form class="flex gap-1.5" @submit.prevent="submit">
    <USelect v-model="kind" :items="KINDS" size="sm" class="w-28 shrink-0" aria-label="Option type" />
    <UInput v-if="kind === 'time'" v-model="time" type="time" size="sm" class="flex-1 min-w-0" aria-label="Meeting time" />
    <UInput
      v-else
      v-model="label"
      size="sm"
      class="flex-1 min-w-0"
      :maxlength="60"
      :placeholder="kind === 'place' ? 'Another place, e.g. Musalla B2' : 'Option'"
      aria-label="Option"
    />
    <UButton type="submit" size="sm" color="neutral" variant="soft" icon="i-lucide-plus" :loading="loading" :disabled="!valid" aria-label="Add option" />
  </form>
</template>

<script setup lang="ts">
import type { OptionInput, OptionKind } from "@/composables/useRoomCalls";
import { formatClock, timeInputToIso } from "@/utils/together";

defineProps<{ loading?: boolean }>();
const emit = defineEmits<{ add: [option: OptionInput] }>();

const KINDS: { label: string; value: OptionKind; icon: string }[] = [
  { label: "Place", value: "place", icon: "i-lucide-map-pin" },
  { label: "Time", value: "time", icon: "i-lucide-clock" },
  { label: "Other", value: "other", icon: "i-lucide-message-circle" },
];

const kind = ref<OptionKind>("place");
const label = ref("");
const time = ref("");

const valid = computed(() => (kind.value === "time" ? Boolean(time.value) : Boolean(label.value.trim())));

function submit(): void {
  if (!valid.value) return;
  if (kind.value === "time") {
    const iso = timeInputToIso(time.value);
    if (!iso) return;
    // Finalizing a time option sets the meeting time from `value`.
    emit("add", { kind: "time", label: formatClock(iso), value: iso });
    time.value = "";
  } else {
    const text = label.value.trim();
    // Finalizing a place option sets the call's place from `value`.
    emit("add", { kind: kind.value, label: text, value: kind.value === "place" ? text : undefined });
    label.value = "";
  }
}
</script>
