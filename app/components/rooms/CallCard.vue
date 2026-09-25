<template>
  <article class="rounded-xl bg-elevated border border-default overflow-hidden" :data-call="call.id">
    <!-- Summary -->
    <div class="px-4 pt-3.5 pb-3 space-y-2">
      <div class="flex items-start gap-2">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <h3 class="text-lg font-semibold leading-tight">{{ prayerName(call.prayer) }}</h3>
            <UBadge v-if="call.status === 'finalized'" size="sm" color="success" variant="subtle" icon="i-lucide-check">Set</UBadge>
            <UBadge v-else size="sm" color="primary" variant="subtle">Open</UBadge>
          </div>
          <p class="text-xs text-muted mt-0.5 truncate">
            {{ isOrganizer ? "You started this" : `Started by ${call.expand?.organizer?.name || "someone"}` }} · {{ formatClock(call.created) }}
          </p>
        </div>
        <UDropdownMenu v-if="isOrganizer" :items="organizerMenu" :content="{ align: 'end' }">
          <UButton icon="i-lucide-ellipsis" size="sm" variant="ghost" color="neutral" aria-label="Call options" :loading="busy === 'cancel'" />
        </UDropdownMenu>
      </div>

      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span class="flex items-center gap-1.5 min-w-0">
          <UIcon name="i-lucide-map-pin" class="size-4 text-muted shrink-0" />
          <span class="truncate">{{ call.place || "Place not set" }}</span>
          <UBadge v-if="call.place_changed_at" size="xs" color="warning" variant="subtle">Place changed</UBadge>
        </span>
        <span v-if="call.meet_at" class="flex items-center gap-1.5">
          <UIcon name="i-lucide-clock" class="size-4 text-muted shrink-0" />
          Meet {{ formatClock(call.meet_at) }}
        </span>
      </div>

      <form v-if="editingPlace" class="flex gap-1.5 pt-1" @submit.prevent="savePlace">
        <UInput v-model="placeDraft" size="sm" class="flex-1" :maxlength="80" placeholder="Where are you meeting?" autofocus aria-label="Place" />
        <UButton type="submit" size="sm" :loading="busy === 'place'" :disabled="!placeDraft.trim()">Save</UButton>
        <UButton size="sm" variant="ghost" color="neutral" @click="stopEditingPlace">Cancel</UButton>
      </form>
    </div>

    <!-- Who's going -->
    <div class="px-4 py-2.5 border-t border-default flex items-center gap-3">
      <UAvatarGroup v-if="detail.participants.length" size="xs" :max="6">
        <UAvatar
          v-for="p in detail.participants"
          :key="p.id"
          :src="p.expand?.user?.avatar_url || undefined"
          :alt="p.expand?.user?.name || '?'"
          :class="avatarTint(p.user)"
        />
      </UAvatarGroup>
      <span class="text-sm text-muted flex-1">{{ goingLabel }}</span>
      <UButton
        v-if="joined"
        size="sm"
        variant="soft"
        color="neutral"
        icon="i-lucide-check"
        :loading="busy === 'leave'"
        @click="leave"
      >
        Going · Leave
      </UButton>
      <UButton v-else size="sm" icon="i-lucide-user-plus" :loading="busy === 'join'" @click="join">Join</UButton>
    </div>

    <!-- Poll -->
    <section v-if="detail.options.length || canEditPoll" class="px-4 py-3 border-t border-default space-y-2">
      <p class="text-[11px] uppercase tracking-wider text-muted">Poll</p>
      <ul v-if="detail.options.length" class="space-y-1.5">
        <li v-for="opt in detail.options" :key="opt.id" class="flex items-center gap-1.5">
          <button
            type="button"
            class="relative flex-1 min-w-0 overflow-hidden rounded-lg border px-3 py-2 text-start transition-colors disabled:cursor-default"
            :class="myVote === opt.id ? 'border-primary/60 bg-primary/10' : 'border-default bg-default/40 enabled:hover:border-accented'"
            :disabled="!canVote || busy !== null"
            :aria-pressed="myVote === opt.id"
            @click="vote(opt.id)"
          >
            <span
              class="absolute inset-y-0 start-0 bg-primary/15 transition-all"
              :style="{ width: `${share(opt.id)}%` }"
              aria-hidden="true"
            />
            <span class="relative flex items-center gap-2">
              <UIcon :name="kindIcon(opt.kind)" class="size-3.5 text-muted shrink-0" />
              <span class="text-sm truncate flex-1">{{ opt.label }}</span>
              <UIcon v-if="myVote === opt.id" name="i-lucide-circle-check" class="size-4 text-primary shrink-0" />
              <span class="text-xs tabular-nums text-muted shrink-0">{{ count(opt.id) }}</span>
            </span>
          </button>
          <template v-if="canEditPoll">
            <UButton size="sm" variant="ghost" :loading="busy === `finalize:${opt.id}`" @click="finalize(opt.id)">Pick</UButton>
            <UButton
              size="sm"
              variant="ghost"
              color="neutral"
              icon="i-lucide-x"
              aria-label="Remove option"
              :loading="busy === `remove:${opt.id}`"
              @click="removeOption(opt.id)"
            />
          </template>
        </li>
      </ul>
      <p v-else class="text-xs text-muted">Add places or times for people to vote on, then pick one.</p>
      <p v-if="canEditPoll && detail.options.length" class="text-xs text-muted">Pick an option to finalize — it doesn't have to be the most voted.</p>
      <RoomsOptionForm v-if="canEditPoll" :loading="busy === 'add-option'" @add="addOption" />
    </section>

    <!-- Chat -->
    <section class="px-4 py-3 border-t border-default space-y-2">
      <p class="text-[11px] uppercase tracking-wider text-muted">Chat</p>
      <div ref="scroller" class="max-h-56 overflow-y-auto space-y-2 pe-1" aria-live="polite">
        <p v-if="!detail.messages.length" class="text-xs text-muted">No messages yet. Chat is deleted an hour after the call.</p>
        <div v-for="m in detail.messages" :key="m.id" class="text-sm leading-snug">
          <div class="flex items-baseline gap-2">
            <span class="font-medium" :class="m.user === myId ? 'text-primary' : ''">{{ m.user === myId ? "You" : m.expand?.user?.name || "Someone" }}</span>
            <span class="text-[11px] text-dimmed tabular-nums">{{ formatClock(m.created) }}</span>
          </div>
          <p class="text-toned break-words whitespace-pre-line">{{ m.body }}</p>
        </div>
      </div>
      <form class="flex gap-1.5" @submit.prevent="send">
        <UInput
          v-model="draft"
          size="sm"
          class="flex-1"
          placeholder="Message"
          :maxlength="280"
          aria-label="Message"
          :ui="{ trailing: 'pe-2' }"
        >
          <template v-if="draft.length > 240" #trailing>
            <span class="text-[11px] tabular-nums text-muted">{{ 280 - draft.length }}</span>
          </template>
        </UInput>
        <UButton type="submit" size="sm" icon="i-lucide-send-horizontal" aria-label="Send" :loading="busy === 'send'" :disabled="!draft.trim()" />
      </form>
    </section>
  </article>
</template>

<script setup lang="ts">
// Distinct tints so overlapping initials stay readable.
const AVATAR_TINTS = ["bg-sky-500/30", "bg-emerald-500/30", "bg-amber-500/30", "bg-rose-500/30", "bg-violet-500/30", "bg-teal-500/30"];
function avatarTint(userId: string): string {
  let h = 0;
  for (const ch of userId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `${AVATAR_TINTS[h % AVATAR_TINTS.length]} text-highlighted`;
}

import type { DropdownMenuItem } from "@nuxt/ui";
import type { CallDetail, OptionInput, OptionKind, useRoomCalls } from "@/composables/useRoomCalls";
import { formatClock, prayerName } from "@/utils/together";

const props = defineProps<{
  detail: CallDetail;
  myId: string | null;
  api: ReturnType<typeof useRoomCalls>;
}>();
const emit = defineEmits<{ joined: [] }>();

const { confirm } = useConfirm();
const { busy, run } = useTogetherAction();

const call = computed(() => props.detail.call);
const isOrganizer = computed(() => call.value.organizer === props.myId);
const joined = computed(() => props.detail.participants.some((p) => p.user === props.myId));
const canEditPoll = computed(() => isOrganizer.value && call.value.status === "open");
const canVote = computed(() => call.value.status === "open");
const myVote = computed(() => props.detail.votes.find((v) => v.user === props.myId)?.option ?? null);

const goingLabel = computed(() => {
  const n = props.detail.participants.length;
  if (!n) return "No one yet";
  return joined.value ? (n === 1 ? "Just you so far" : `You and ${n - 1} more`) : `${n} going`;
});

const count = (optionId: string) => props.detail.votes.filter((v) => v.option === optionId).length;
const share = (optionId: string) => (props.detail.votes.length ? (count(optionId) / props.detail.votes.length) * 100 : 0);
const kindIcon = (kind?: OptionKind | "") =>
  kind === "place" ? "i-lucide-map-pin" : kind === "time" ? "i-lucide-clock" : "i-lucide-message-circle";

const id = () => call.value.id;

async function join(): Promise<void> {
  if (await run("join", "Couldn't join — retry", () => props.api.join(id()))) emit("joined");
}
async function leave(): Promise<void> {
  await run("leave", "Couldn't leave — retry", () => props.api.leave(id()));
}
async function vote(optionId: string): Promise<void> {
  await run(`vote:${optionId}`, "Couldn't save your vote — retry", () => props.api.vote(id(), optionId));
}
async function finalize(optionId: string): Promise<void> {
  await run(`finalize:${optionId}`, "Couldn't finalize — retry", () => props.api.finalize(id(), optionId));
}
async function removeOption(optionId: string): Promise<void> {
  await run(`remove:${optionId}`, "Couldn't remove the option — retry", () => props.api.removeOption(optionId));
}
async function addOption(o: OptionInput): Promise<void> {
  await run("add-option", "Couldn't add the option — retry", () => props.api.addOption(id(), o));
}

const editingPlace = ref(false);
const placeDraft = ref("");
function startEditingPlace(): void {
  placeDraft.value = call.value.place ?? "";
  editingPlace.value = true;
}
function stopEditingPlace(): void {
  editingPlace.value = false;
}
async function savePlace(): Promise<void> {
  const place = placeDraft.value.trim();
  if (place === call.value.place) {
    editingPlace.value = false;
    return;
  }
  if (await run("place", "Couldn't change the place — retry", () => props.api.editPlace(id(), place))) editingPlace.value = false;
}

async function cancelCall(): Promise<void> {
  const ok = await confirm({
    title: `Cancel ${prayerName(call.value.prayer)}?`,
    message: "Everyone in the room will see the call end.",
    confirmText: "Cancel call",
    cancelText: "Keep it",
    confirmColor: "error",
  });
  if (ok) await run("cancel", "Couldn't cancel the call — retry", () => props.api.cancel(id()));
}

const organizerMenu = computed<DropdownMenuItem[]>(() => [
  { label: "Change place", icon: "i-lucide-map-pin", onSelect: startEditingPlace },
  { label: "Cancel call", icon: "i-lucide-circle-x", color: "error", onSelect: () => void cancelCall() },
]);

// Chat
const draft = ref("");
const scroller = ref<HTMLElement | null>(null);

async function send(): Promise<void> {
  const body = draft.value.trim();
  if (!body) return;
  if (await run("send", "Couldn't send — retry", () => props.api.sendMessage(id(), body))) draft.value = "";
}

// Follow new messages when already at (or near) the bottom, or when they're mine.
watch(
  () => props.detail.messages.length,
  async () => {
    const el = scroller.value;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    const mine = props.detail.messages.at(-1)?.user === props.myId;
    await nextTick();
    if (nearBottom || mine) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  },
);
onMounted(() => {
  if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight;
});
</script>
