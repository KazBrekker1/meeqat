<template>
  <RoomsShell
    :title="room?.name ?? 'Room'"
    :subtitle="room ? room.default_place || 'No default place' : undefined"
    back="/rooms"
    back-label="Back to rooms"
    gate-title="Sign in to see this room"
    wide
  >
    <template v-if="me && !gone" #actions>
      <UButton
        size="sm"
        :variant="me.subscribed ? 'ghost' : 'soft'"
        :color="me.subscribed ? 'neutral' : 'primary'"
        :icon="me.subscribed ? 'i-lucide-bell' : 'i-lucide-bell-off'"
        :loading="busy === 'subscribe'"
        :aria-label="me.subscribed ? 'Subscribed — unsubscribe' : 'Subscribe'"
        @click="toggleSubscribed"
      >
        <span class="hidden sm:inline">{{ me.subscribed ? "Subscribed" : "Subscribe" }}</span>
      </UButton>
      <UDropdownMenu :items="roomMenu" :content="{ align: 'end' }">
        <UButton icon="i-lucide-ellipsis-vertical" size="sm" variant="ghost" color="neutral" aria-label="Room options" />
      </UDropdownMenu>
    </template>

    <div v-if="gone" class="max-w-md mx-auto rounded-xl bg-elevated border border-default px-5 py-8 text-center space-y-3">
      <UIcon name="i-lucide-door-closed" class="size-8 mx-auto text-muted" />
      <p class="text-sm">{{ gone }}</p>
      <UButton to="/rooms" variant="soft" color="neutral" icon="i-lucide-arrow-left">Back to rooms</UButton>
    </div>

    <UAlert
      v-else-if="loadError"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="loadError"
      :actions="[{ label: 'Retry', color: 'error', variant: 'outline', onClick: load }]"
    />

    <div v-else-if="!room || !me" class="space-y-3 max-w-xl">
      <USkeleton class="h-10 w-full rounded-xl" />
      <USkeleton class="h-56 w-full rounded-xl" />
    </div>

    <div v-else class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <!-- Calls -->
      <section class="min-w-0">
        <div class="flex items-center justify-between gap-2 mb-1.5">
          <p class="text-[11px] uppercase tracking-wider text-muted">Calls today</p>
          <UButton v-if="canStart && details.length" size="xs" variant="ghost" class="-my-1.5" icon="i-lucide-megaphone" @click="openStart">
            Start a call
          </UButton>
        </div>

        <div v-if="!me.subscribed" class="rounded-xl bg-elevated border border-default px-5 py-8 text-center space-y-3">
          <UIcon name="i-lucide-bell-off" class="size-7 mx-auto text-muted" />
          <div>
            <p class="text-sm font-medium">Subscribe to see calls</p>
            <p class="text-sm text-muted mt-0.5">You're in this room but unsubscribed, so its calls, polls and chat are hidden from you.</p>
          </div>
          <UButton icon="i-lucide-bell" :loading="busy === 'subscribe'" @click="toggleSubscribed">Subscribe</UButton>
        </div>

        <template v-else>
          <USkeleton v-if="callsApi.loading.value && !details.length" class="h-56 w-full rounded-xl" />
          <UAlert
            v-else-if="callsApi.error.value"
            color="error"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            :title="callsApi.error.value"
            :actions="[{ label: 'Retry', color: 'error', variant: 'outline', onClick: retryCalls }]"
          />
          <div v-else-if="!details.length" class="rounded-xl bg-elevated border border-default px-5 py-8 text-center space-y-3">
            <UIcon name="i-lucide-users" class="size-7 mx-auto text-muted" />
            <div>
              <p class="text-sm font-medium">No calls right now</p>
              <p class="text-sm text-muted mt-0.5">
                {{ canStart ? "Start one and everyone subscribed here gets an alert." : "When a caller starts one, it shows up here." }}
              </p>
            </div>
            <UButton v-if="canStart" icon="i-lucide-megaphone" @click="openStart">Start a call</UButton>
          </div>
          <div v-else class="space-y-3">
            <RoomsCallCard
              v-for="d in details"
              :key="d.call.id"
              :detail="d"
              :my-id="userId"
              :api="callsApi"
              class="transition-shadow duration-500"
              :class="highlighted === d.call.id ? 'ring-2 ring-primary/70' : ''"
              @joined="alerts.requestNotificationPermission"
            />
          </div>
        </template>
      </section>

      <aside class="space-y-6 min-w-0">
        <!-- Invite -->
        <section>
          <p class="text-[11px] uppercase tracking-wider text-muted mb-1.5">Invite</p>
          <div class="rounded-xl bg-elevated border border-default px-4 py-3 space-y-3">
            <div class="flex items-center gap-2">
              <code class="flex-1 font-mono text-lg tracking-[0.25em]" data-testid="room-code">{{ room.code }}</code>
              <UButton size="sm" variant="soft" color="neutral" icon="i-lucide-copy" @click="copy(room.code, 'Code copied')">Code</UButton>
              <UButton size="sm" variant="soft" icon="i-lucide-link" @click="copy(inviteLink(room.code), 'Invite link copied')">Link</UButton>
            </div>
            <p class="text-xs text-muted">Anyone with the code or link can join as a member.</p>
            <UButton
              v-if="isOwner"
              size="xs"
              variant="link"
              color="neutral"
              class="px-0"
              icon="i-lucide-refresh-cw"
              :loading="busy === 'rotate'"
              @click="rotate"
            >
              Get a new code
            </UButton>
          </div>
        </section>

        <!-- Members -->
        <section>
          <p class="text-[11px] uppercase tracking-wider text-muted mb-1.5">Members · {{ members.length }}</p>
          <ul class="rounded-xl bg-elevated border border-default divide-y divide-default overflow-hidden">
            <li v-for="m in members" :key="m.id" class="flex items-center gap-3 px-4 py-2.5">
              <UAvatar :src="m.expand?.user?.avatar_url || undefined" :alt="m.expand?.user?.name || '?'" size="sm" />
              <div class="min-w-0 flex-1">
                <p class="text-sm truncate">
                  {{ m.expand?.user?.name || "Someone" }}<span v-if="m.user === userId" class="text-muted"> (you)</span>
                </p>
                <p class="text-xs text-muted">
                  {{ ROLE_LABEL[m.role] }}<template v-if="!m.subscribed"> · unsubscribed</template>
                </p>
              </div>
              <UDropdownMenu v-if="isOwner && m.role !== 'owner'" :items="memberMenu(m)" :content="{ align: 'end' }">
                <UButton
                  icon="i-lucide-ellipsis"
                  size="sm"
                  variant="ghost"
                  color="neutral"
                  :aria-label="`Manage ${m.expand?.user?.name || 'member'}`"
                  :loading="busy === `member:${m.user}`"
                />
              </UDropdownMenu>
            </li>
          </ul>
          <p v-if="isOwner" class="mt-1.5 text-xs text-muted">Callers can start calls. You can always start one.</p>
        </section>

        <!-- Owner settings -->
        <section v-if="isOwner">
          <p class="text-[11px] uppercase tracking-wider text-muted mb-1.5">Room settings</p>
          <div class="rounded-xl bg-elevated border border-default divide-y divide-default">
            <form class="px-4 py-3 space-y-3" @submit.prevent="saveSettings">
              <UFormField label="Name" required>
                <UInput v-model="settings.name" class="w-full" :maxlength="60" />
              </UFormField>
              <UFormField label="Default place">
                <UInput v-model="settings.place" class="w-full" :maxlength="80" placeholder="e.g. Musalla, Floor 3" />
              </UFormField>
              <UButton type="submit" size="sm" :loading="busy === 'settings'" :disabled="!settingsDirty || !settings.name.trim()" class="disabled:opacity-40">Save</UButton>
            </form>
            <div class="px-4 py-3 space-y-2">
              <div class="flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-sm font-medium">Discoverable</p>
                  <p class="text-xs text-muted">Signed-in people within 1 km can find and join without a code.</p>
                </div>
                <USwitch
                  :model-value="room.discoverable"
                  :loading="busy === 'discoverable'"
                  :disabled="busy === 'discoverable'"
                  aria-label="Discoverable"
                  @update:model-value="setDiscoverable"
                />
              </div>
              <div v-if="room.discoverable" class="flex items-center justify-between gap-3">
                <p class="text-xs text-muted flex items-center gap-1.5">
                  <UIcon name="i-lucide-map-pin" class="size-3.5" />
                  Located here, to about 100 m
                </p>
                <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-locate-fixed" :loading="busy === 'relocate'" @click="relocate">
                  Update to my location
                </UButton>
              </div>
            </div>
          </div>
        </section>

        <!-- History -->
        <section>
          <p class="text-[11px] uppercase tracking-wider text-muted mb-1.5">History</p>
          <ul v-if="history.length" class="rounded-xl bg-elevated border border-default divide-y divide-default overflow-hidden">
            <li v-for="h in history" :key="h.id" class="flex items-center gap-3 px-4 py-2.5">
              <div class="min-w-0 flex-1">
                <p class="text-sm truncate">
                  {{ prayerName(h.prayer || "") }} · {{ h.joined ?? 0 }} prayed together<template v-if="h.place"> · {{ h.place }}</template>
                </p>
              </div>
              <span class="text-xs text-muted tabular-nums shrink-0">{{ formatDay(h.day) }}</span>
            </li>
          </ul>
          <p v-else class="rounded-xl bg-elevated border border-default px-4 py-4 text-sm text-muted">
            Finished calls show up here — a headcount, never names.
          </p>
        </section>
      </aside>
    </div>

    <!-- Start a call -->
    <UModal v-model:open="showStart" title="Start a call" description="Everyone subscribed to this room gets an alert.">
      <template #body>
        <form class="space-y-5" @submit.prevent="startCall">
          <UFormField label="Prayer">
            <div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Prayer">
              <UButton
                v-for="p in prayerChoices"
                :key="p"
                size="sm"
                role="radio"
                :aria-checked="start.prayer === p"
                :variant="start.prayer === p ? 'solid' : 'soft'"
                :color="start.prayer === p ? 'primary' : 'neutral'"
                @click="pickPrayer(p)"
              >
                {{ prayerName(p) }}
              </UButton>
            </div>
          </UFormField>
          <UFormField label="Place">
            <UInput v-model="start.place" class="w-full" :maxlength="80" placeholder="Where are you meeting?" />
          </UFormField>
          <UFormField label="Poll" hint="Optional" help="Let people vote on places or times; you pick the final one.">
            <div class="space-y-1.5">
              <div
                v-for="(o, i) in start.options"
                :key="i"
                class="flex items-center gap-2 rounded-lg border border-default px-3 py-1.5 text-sm"
              >
                <UIcon :name="o.kind === 'time' ? 'i-lucide-clock' : o.kind === 'place' ? 'i-lucide-map-pin' : 'i-lucide-message-circle'" class="size-3.5 text-muted" />
                <span class="flex-1 truncate">{{ o.label }}</span>
                <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-x" aria-label="Remove option" @click="removeStartOption(i)" />
              </div>
              <RoomsOptionForm @add="addStartOption" />
            </div>
          </UFormField>
          <UButton block type="submit" icon="i-lucide-megaphone" :loading="busy === 'start'">Start {{ prayerName(start.prayer) }} call</UButton>
        </form>
      </template>
    </UModal>
  </RoomsShell>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { RoomHistoryResponse, RoomsResponse } from "@/types/together";
import type { Member, Role } from "@/composables/useRooms";
import type { OptionInput } from "@/composables/useRoomCalls";
import { PRAYERS, prayerName, weekdayIn, type PrayerId } from "@/utils/together";

definePageMeta({ middleware: "web-only" });

const route = useRoute();
const roomId = String(route.params.id);

const { pb, status, userId, live } = useTogether();
const rooms$ = useRooms();
const alerts = useCallAlerts();
const toast = useToast();
const { confirm } = useConfirm();
const { busy, run } = useTogetherAction();

const ROLE_LABEL: Record<Role, string> = { owner: "Owner", caller: "Caller", member: "Member" };

const room = ref<RoomsResponse | null>(null);
const members = ref<Member[]>([]);
const history = ref<RoomHistoryResponse[]>([]);
const loadError = ref<string | null>(null);
/** Set when the room is no longer mine to see (removed, left elsewhere, deleted). */
const gone = ref<string | null>(null);

useHead({ title: () => `${room.value?.name ?? "Room"} · Meeqat` });

const me = computed(() => members.value.find((m) => m.user === userId.value) ?? null);
const isOwner = computed(() => me.value?.role === "owner");
const canStart = computed(() => Boolean(me.value?.subscribed && me.value.role !== "member"));

const callsApi = useRoomCalls(roomId, computed(() => Boolean(me.value?.subscribed) && !gone.value));
const details = callsApi.details;

/** Our own leave/delete is in flight: its realtime echo isn't news. */
let leaving = false;
function markGone(message: string): void {
  if (gone.value || leaving) return;
  gone.value = message;
  stopLive?.();
}

async function load(): Promise<void> {
  loadError.value = null;
  try {
    const [r, m, h] = await Promise.all([rooms$.fetchRoom(roomId), rooms$.fetchMembers(roomId), rooms$.fetchHistory(roomId)]);
    room.value = r;
    members.value = m;
    history.value = h;
    if (!me.value) markGone("You're not in this room any more.");
  } catch (err) {
    if (err instanceof SignedOutError) return;
    const code = errorStatus(err);
    if (code === 404 || code === 403) markGone("This room isn't available — you may have been removed, or it was deleted.");
    else loadError.value = describeError(err, "Couldn't load this room — retry");
  }
}

async function reloadMembers(): Promise<void> {
  try {
    members.value = await rooms$.fetchMembers(roomId);
    if (!me.value) markGone("You were removed from this room.");
  } catch {
    // keep the list we have; the next event or reconnect retries
  }
}

let stopLive: (() => void) | null = null;
watch(
  status,
  (s) => {
    stopLive?.();
    stopLive = null;
    if (s !== "ready" || gone.value) return;
    void load();
    stopLive = live(
      [
        {
          collection: "rooms",
          topic: roomId,
          onEvent: (e) => {
            if (e.action === "delete") markGone("This room was deleted by its owner.");
            else room.value = e.record;
          },
        },
        { collection: "memberships", filter: pb().filter("room = {:roomId}", { roomId }), onEvent: () => void reloadMembers() },
        {
          collection: "room_history",
          filter: pb().filter("room = {:roomId}", { roomId }),
          onEvent: () => void rooms$.fetchHistory(roomId).then((h) => (history.value = h)).catch(() => {}),
        },
      ],
      () => void load(),
    );
  },
  { immediate: true },
);
onScopeDispose(() => stopLive?.());

function retryCalls(): void {
  void callsApi.refresh();
}

// --- Membership ---
async function toggleSubscribed(): Promise<void> {
  const mine = me.value;
  if (!mine) return;
  const next = !mine.subscribed;
  await run("subscribe", next ? "Couldn't subscribe — retry" : "Couldn't unsubscribe — retry", async () => {
    const updated = await rooms$.setSubscribed(mine.id, next);
    members.value = members.value.map((m) => (m.id === updated.id ? updated : m));
  });
  if (next) alerts.requestNotificationPermission();
}

async function leaveOrDelete(): Promise<void> {
  const r = room.value;
  const mine = me.value;
  if (!r || !mine) return;
  const owner = mine.role === "owner";
  const ok = await confirm({
    title: owner ? `Delete ${r.name}?` : `Leave ${r.name}?`,
    message: owner
      ? "The room, its calls and its history are deleted for everyone."
      : "You'll stop getting its calls. You can rejoin with the code.",
    confirmText: owner ? "Delete room" : "Leave room",
    confirmColor: "error",
  });
  if (!ok) return;
  leaving = true;
  const done = await run("leave", owner ? "Couldn't delete the room — retry" : "Couldn't leave — retry", () =>
    owner ? rooms$.deleteRoom(r.id) : rooms$.leaveRoom(mine.id),
  );
  if (done) await navigateTo("/rooms");
  else leaving = false;
}

const roomMenu = computed<DropdownMenuItem[]>(() => [
  isOwner.value
    ? { label: "Delete room", icon: "i-lucide-trash-2", color: "error", onSelect: () => void leaveOrDelete() }
    : { label: "Leave room", icon: "i-lucide-log-out", color: "error", onSelect: () => void leaveOrDelete() },
]);

// --- Members (owner) ---
function memberMenu(m: Member): DropdownMenuItem[] {
  const name = m.expand?.user?.name || "this member";
  const nextRole: Exclude<Role, "owner"> = m.role === "caller" ? "member" : "caller";
  return [
    {
      label: nextRole === "caller" ? "Make caller" : "Make member",
      description: nextRole === "caller" ? "Can start calls" : "Can join, vote and chat",
      icon: nextRole === "caller" ? "i-lucide-megaphone" : "i-lucide-user",
      onSelect: () =>
        void run(`member:${m.user}`, "Couldn't change the role — retry", async () => {
          await rooms$.setRole(roomId, m.user, nextRole);
          await reloadMembers();
        }),
    },
    {
      label: "Remove from room",
      icon: "i-lucide-user-x",
      color: "error",
      onSelect: () => void removeMember(m, name),
    },
  ];
}

async function removeMember(m: Member, name: string): Promise<void> {
  const ok = await confirm({
    title: `Remove ${name}?`,
    message: "They can rejoin only with a new code or link.",
    confirmText: "Remove",
    confirmColor: "error",
  });
  if (!ok) return;
  await run(`member:${m.user}`, "Couldn't remove — retry", async () => {
    await rooms$.removeMember(roomId, m.user);
    members.value = members.value.filter((x) => x.id !== m.id);
  });
}

// --- Invite ---
async function copy(text: string, done: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.add({ title: done, icon: "i-lucide-check", color: "success" });
  } catch {
    toast.add({ title: "Couldn't copy — select it and copy by hand", color: "error" });
  }
}

async function rotate(): Promise<void> {
  const ok = await confirm({
    title: "Get a new code?",
    message: "The current code and invite link stop working. People already in the room stay.",
    confirmText: "New code",
  });
  if (ok) await run("rotate", "Couldn't change the code — retry", async () => (room.value = await rooms$.rotateCode(roomId)));
}

// --- Owner settings ---
const settings = reactive({ name: "", place: "" });
watch(
  () => [room.value?.name, room.value?.default_place],
  ([name, place]) => {
    settings.name = name ?? "";
    settings.place = place ?? "";
  },
  { immediate: true },
);
const settingsDirty = computed(
  () => settings.name.trim() !== room.value?.name || settings.place.trim() !== (room.value?.default_place ?? ""),
);

async function saveSettings(): Promise<void> {
  const ok = await run("settings", "Couldn't save — retry", async () => {
    room.value = await rooms$.updateRoom(roomId, { name: settings.name.trim(), default_place: settings.place.trim() });
  });
  if (ok) toast.add({ title: "Room updated", icon: "i-lucide-check", color: "success" });
}

async function setDiscoverable(on: boolean): Promise<void> {
  await run("discoverable", on ? "Couldn't make it discoverable" : "Couldn't turn off discovery — retry", async () => {
    const patch = on ? { discoverable: true, ...(await rooms$.preciseLocation()) } : { discoverable: false };
    room.value = await rooms$.updateRoom(roomId, patch);
  });
}

async function relocate(): Promise<void> {
  const ok = await run("relocate", "Couldn't update the location", async () => {
    room.value = await rooms$.updateRoom(roomId, { discoverable: true, ...(await rooms$.preciseLocation()) });
  });
  if (ok) toast.add({ title: "Room location updated", icon: "i-lucide-check", color: "success" });
}

// --- History ---
function formatDay(day?: string): string {
  if (!day) return "";
  const d = new Date(`${day}T12:00:00`);
  return d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
}

// --- Start a call ---
const prayerTimes = usePrayerTimes();
const isFriday = computed(() => (room.value ? weekdayIn(room.value.tz) === 5 : false));
const prayerChoices = computed<PrayerId[]>(() => PRAYERS.filter((p) => p !== "jumuah" || isFriday.value));

/** The next prayer by the app's own prayer times (Sunrise → Dhuhr; Jumu'ah on Fridays). */
function nextPrayer(): PrayerId {
  const isPrayer = (key: string): key is PrayerId => (PRAYERS as readonly string[]).includes(key);
  const upcoming = prayerTimes.timingsList.value.map((t) => ({ ...t, id: t.key.toLowerCase() })).find((t) => !t.isPast && isPrayer(t.id))?.id;
  let p: PrayerId;
  if (upcoming && isPrayer(upcoming)) p = upcoming;
  else {
    // No prayer times loaded on this device: a rough guess by the clock.
    const h = new Date().getHours();
    p = h < 6 ? "fajr" : h < 13 ? "dhuhr" : h < 16 ? "asr" : h < 19 ? "maghrib" : "isha";
  }
  return p === "dhuhr" && isFriday.value ? "jumuah" : p;
}

const showStart = ref(false);
const start = reactive<{ prayer: PrayerId; place: string; options: OptionInput[] }>({ prayer: "dhuhr", place: "", options: [] });
const highlighted = ref<string | null>(null);

function openStart(): void {
  start.prayer = nextPrayer();
  start.place = room.value?.default_place ?? "";
  start.options = [];
  showStart.value = true;
}

function pickPrayer(p: PrayerId): void {
  start.prayer = p;
}
function addStartOption(o: OptionInput): void {
  start.options.push(o);
}
function removeStartOption(i: number): void {
  start.options.splice(i, 1);
}

async function startCall(): Promise<void> {
  const out: { result?: Awaited<ReturnType<typeof callsApi.startCall>> } = {};
  await run("start", "Couldn't start the call — retry", async () => {
    out.result = await callsApi.startCall({ prayer: start.prayer, place: start.place.trim(), options: start.options });
  });
  if (!out.result) return;
  const { id, existing, optionsFailed } = out.result;
  showStart.value = false;
  alerts.requestNotificationPermission();
  if (existing) toast.add({ title: `${prayerName(start.prayer)} already has a call today — here it is`, icon: "i-lucide-info", color: "info" });
  if (optionsFailed) toast.add({ title: `Call started, but ${optionsFailed} poll option(s) didn't save — add them again`, color: "warning" });
  highlighted.value = id;
  await nextTick();
  document.querySelector(`[data-call="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => {
    if (highlighted.value === id) highlighted.value = null;
  }, 2500);
}

// The default prayer needs today's times; load them if this page was opened directly.
onMounted(async () => {
  if (prayerTimes.timings.value) return;
  await prayerTimes.loadPreferences();
  const { locationMode, gpsLat, gpsLng, selectedCity, selectedCountry, selectedMethodId } = prayerTimes;
  if (locationMode.value === "gps" && gpsLat.value != null && gpsLng.value != null) {
    await prayerTimes.fetchByCoordinates(gpsLat.value, gpsLng.value);
  } else if (selectedCity.value && selectedCountry.value) {
    await prayerTimes.fetchPrayerTimingsByCity(selectedCity.value, selectedCountry.value, { methodId: selectedMethodId.value });
  }
});
</script>
