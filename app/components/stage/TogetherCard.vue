<template>
  <!-- A live call in my rooms, else a quiet way to start one; nothing otherwise. -->
  <div v-if="call">
    <h2 v-if="heading" class="text-[11px] uppercase tracking-wider text-white/45 mb-1.5 px-1">Pray together</h2>
    <div class="flex items-center gap-3.5 rounded-2xl bg-white/5 border border-white/[0.09] backdrop-blur-md py-3 pr-3 pl-3.5">
      <NuxtLink :to="`/rooms/${call.roomId}`" class="flex items-center gap-3.5 flex-1 min-w-0 group" :aria-label="`Open the room for ${title}`">
        <div class="flex shrink-0">
          <span
            v-for="(ch, i) in call.initials"
            :key="i"
            class="size-[30px] rounded-full grid place-items-center text-xs font-semibold text-white ring-2 ring-[#10163a]"
            :class="i ? '-ms-[9px]' : ''"
            :style="{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }"
          >{{ ch }}</span>
        </div>
        <div class="min-w-0">
          <p class="text-sm font-semibold text-white truncate group-hover:underline underline-offset-2">
            <span class="inline-block size-[7px] rounded-full bg-emerald-400 ring-[3px] ring-emerald-400/20 me-1.5 align-[1px]" />{{ title }}
          </p>
          <p class="text-[12.5px] text-white/55 mt-0.5 truncate">{{ detail }}</p>
        </div>
      </NuxtLink>
      <span v-if="call.joined" class="shrink-0 flex items-center gap-1 text-[13px] font-medium text-emerald-300 px-1">
        <UIcon name="lucide:check" class="size-3.5" /> Going
      </span>
      <button
        v-else
        type="button"
        class="shrink-0 rounded-[9px] bg-indigo-500 hover:bg-indigo-400 px-3.5 py-[7px] text-[13px] font-semibold text-white shadow-[0_6px_18px_-6px_rgba(99,102,241,.8)] cursor-pointer disabled:opacity-60 transition-colors"
        :disabled="joining"
        @click="emit('join', call)"
      >
        {{ joining ? "Joining…" : "Join" }}
      </button>
    </div>
  </div>

  <NuxtLink
    v-else-if="startRoomId && nextPrayer"
    :to="`/rooms/${startRoomId}`"
    class="inline-flex items-center gap-2 self-start rounded-full border border-dashed border-indigo-300/35 px-3.5 py-2 text-[13px] text-indigo-200/85 hover:text-indigo-100 hover:border-indigo-300/60 transition-colors"
  >
    <UIcon name="lucide:plus" class="size-3.5" />
    Start a call for {{ nextPrayer }}
    <span class="text-white/35">· your rooms</span>
  </NuxtLink>
</template>

<script lang="ts" setup>
import { formatClock, prayerName } from "@/utils/together";
import type { StageCall } from "@/composables/useActiveCalls";

const props = defineProps<{
  call: StageCall | null;
  joining?: boolean;
  /** A room where I can start a call (signed in); with the next prayer's name, shows the quiet link. */
  startRoomId?: string | null;
  nextPrayer?: string | null;
  heading?: boolean;
}>();
const emit = defineEmits<{ join: [call: StageCall] }>();

const AVATAR_COLORS = ["#6366f1", "#0ea5e9", "#a855f7"];

const title = computed(() => (props.call ? `${props.call.organizerName} started ${prayerName(props.call.prayer)}` : ""));
const detail = computed(() => {
  const c = props.call;
  if (!c) return "";
  const meet = c.status === "finalized" && c.meetAt ? `meet ${formatClock(c.meetAt)}` : "";
  return [c.place, `${c.going} going`, meet].filter(Boolean).join(" · ");
});
</script>
