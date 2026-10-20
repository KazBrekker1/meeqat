<template>
  <div class="relative w-full max-w-sm">
    <UInput
      v-model="query"
      icon="lucide:search"
      placeholder="Search stars, constellations, planets"
      class="w-full"
      aria-label="Search the sky"
      :ui="{ base: 'bg-[#0b1230]/85 backdrop-blur' }"
      @keydown="onKey"
    />
    <ul
      v-if="results.length"
      role="listbox"
      class="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-white/12 bg-[#0b1230]/95 py-1 shadow-xl backdrop-blur"
    >
      <li
        v-for="(r, i) in results"
        :key="`${r.target.kind}:${r.en}`"
        role="option"
        :aria-selected="i === active"
        class="flex cursor-pointer items-baseline justify-between gap-3 px-3 py-1.5 text-sm"
        :class="i === active && 'bg-white/10'"
        @mouseenter="active = i"
        @mousedown.prevent="choose(r)"
      >
        <span class="truncate">{{ r.en }} <span class="text-xs text-white/40">{{ KIND[r.target.kind] }}</span></span>
        <span class="shrink-0 text-amber-200/90" dir="rtl">{{ r.ar }}</span>
      </li>
    </ul>
  </div>
</template>

<script lang="ts" setup>
import { search, type SearchItem, type SearchTarget } from "@/utils/sky/search";

const props = defineProps<{ index: SearchItem[] }>();
const emit = defineEmits<{ choose: [target: SearchTarget] }>();

const KIND: Record<SearchTarget["kind"], string> = { star: "star", constellation: "constellation", planet: "planet", moon: "", sun: "" };

const query = ref("");
const active = ref(0);
const results = computed(() => search(props.index, query.value));
watch(results, () => (active.value = 0));

function choose(r: SearchItem) {
  emit("choose", r.target);
  query.value = "";
  (document.activeElement as HTMLElement | null)?.blur();
}

function onKey(e: KeyboardEvent) {
  if (e.key === "ArrowDown") active.value = Math.min(active.value + 1, results.value.length - 1);
  else if (e.key === "ArrowUp") active.value = Math.max(active.value - 1, 0);
  else if (e.key === "Enter" && results.value[active.value]) choose(results.value[active.value]!);
  // Esc clears the query first; with nothing typed it leaves the field (the next Esc closes explore).
  else if (e.key === "Escape") {
    if (query.value) query.value = "";
    else (e.target as HTMLElement).blur();
  } else return;
  e.preventDefault();
}
</script>
