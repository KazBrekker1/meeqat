<template>
  <!-- One reminder at a time, the most time-sensitive first; pages when several apply. -->
  <div v-if="current">
    <div v-if="heading" class="flex items-center justify-between mb-1.5 px-1">
      <h2 class="text-[11px] uppercase tracking-wider text-white/45">Right now</h2>
      <button
        v-if="items.length > 1"
        type="button"
        class="text-[11px] text-white/30 hover:text-white/60 tabular-nums cursor-pointer"
        :aria-label="`Show the next reminder (${index + 1} of ${items.length})`"
        @click="next"
      >
        {{ index + 1 }} of {{ items.length }}
      </button>
    </div>
    <div class="flex items-center gap-3.5 rounded-2xl bg-white/5 border border-white/[0.09] backdrop-blur-md py-3 pr-3 pl-3.5">
      <span class="size-[38px] rounded-xl grid place-items-center shrink-0" :style="{ background: current.tint.bg, color: current.tint.fg }">
        <UIcon :name="current.icon" class="size-[18px]" />
      </span>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold text-white leading-snug">
          {{ current.title }}
          <span lang="ar" dir="rtl" class="font-arabic font-medium text-white/55 ms-1">{{ current.arabic }}</span>
        </p>
        <p class="text-[12.5px] text-white/55 mt-0.5 leading-snug">{{ current.detail }}</p>
      </div>
      <div class="flex flex-col items-end gap-2 shrink-0">
        <a
          v-if="current.cta"
          :href="current.cta.href"
          target="_blank"
          rel="noopener"
          class="text-[13px] font-[550] text-indigo-200 hover:text-white px-1"
          @click="openExternal($event, current.cta.href)"
        >{{ current.cta.label }}</a>
        <button
          v-if="!heading && items.length > 1"
          type="button"
          class="flex gap-1 p-1 -m-1 cursor-pointer"
          :aria-label="`Show the next reminder (${index + 1} of ${items.length})`"
          @click="next"
        >
          <i v-for="(_, i) in items" :key="i" class="size-[5px] rounded-full" :class="i === index ? 'bg-white/70' : 'bg-white/20'" />
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { isNative } from "@/utils/platform";
import type { StageReminder } from "@/utils/reminders";

const props = defineProps<{
  items: StageReminder[];
  /** Desktop column: a "Right now" label with the pager in it. */
  heading?: boolean;
}>();

const index = ref(0);
const current = computed(() => props.items[Math.min(index.value, props.items.length - 1)] ?? null);
// Start over from the most urgent whenever the set changes.
watch(() => props.items.map((i) => i.kind).join(), () => (index.value = 0));

function next() {
  index.value = (index.value + 1) % props.items.length;
}

/** The apps open links in the system browser, not the webview. */
async function openExternal(e: MouseEvent, href: string) {
  if (!isNative()) return;
  e.preventDefault();
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(href);
}
</script>
