<template>
  <RoomsShell title="Pray Together" subtitle="Rooms for praying in congregation">
    <div class="space-y-6">
      <div class="grid grid-cols-2 gap-2">
        <UButton block icon="i-lucide-plus" @click="openCreate">Create room</UButton>
        <UButton block variant="soft" color="neutral" icon="i-lucide-ticket" @click="openJoin">Join with code</UButton>
      </div>

      <!-- My rooms -->
      <section>
        <p class="text-[11px] uppercase tracking-wider text-muted mb-1.5">My rooms</p>
        <div v-if="loading && !rooms.length" class="space-y-2">
          <USkeleton v-for="i in 2" :key="i" class="h-[68px] w-full rounded-xl" />
        </div>
        <UAlert
          v-else-if="loadError"
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="loadError"
          :actions="[{ label: 'Retry', color: 'error', variant: 'outline', onClick: load }]"
        />
        <div v-else-if="!rooms.length" class="rounded-xl bg-elevated border border-default px-5 py-8 text-center">
          <UIcon name="i-lucide-door-open" class="size-7 mx-auto mb-2 text-muted" />
          <p class="text-sm font-medium">No rooms yet</p>
          <p class="text-sm text-muted mt-0.5">Create one for your workplace, or join with a code from a colleague.</p>
        </div>
        <ul v-else class="rounded-xl bg-elevated border border-default divide-y divide-default overflow-hidden">
          <li v-for="r in rooms" :key="r.id">
            <NuxtLink :to="`/rooms/${r.room}`" class="flex items-center gap-3 px-4 py-3 hover:bg-accented/40 transition-colors">
              <div class="size-9 rounded-lg bg-primary/15 grid place-items-center shrink-0">
                <UIcon name="i-lucide-users" class="size-4.5 text-primary" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 min-w-0">
                  <p class="text-sm font-medium truncate">{{ r.expand.room.name }}</p>
                  <UBadge v-if="r.role !== 'member'" size="xs" variant="subtle" color="neutral" class="capitalize shrink-0">{{ r.role }}</UBadge>
                </div>
                <p class="text-xs text-muted truncate">
                  <template v-if="!r.subscribed">Unsubscribed · </template>{{ r.expand.room.default_place || "No default place" }}
                </p>
              </div>
              <UBadge v-if="activeByRoom[r.room]" size="sm" color="success" variant="subtle" class="shrink-0">
                <span class="size-1.5 rounded-full bg-success animate-pulse" />
                {{ activeByRoom[r.room] }}
              </UBadge>
              <UIcon v-else-if="!r.subscribed" name="i-lucide-bell-off" class="size-4 text-dimmed shrink-0" aria-label="Unsubscribed" />
              <UIcon name="i-lucide-chevron-right" class="size-4 text-dimmed shrink-0" />
            </NuxtLink>
          </li>
        </ul>
      </section>

      <!-- Nearby -->
      <section>
        <p class="text-[11px] uppercase tracking-wider text-muted mb-1.5">Nearby</p>
        <div class="rounded-xl bg-elevated border border-default overflow-hidden">
          <div class="px-4 py-3 flex items-center justify-between gap-3">
            <p class="text-sm text-muted">Rooms that chose to be discoverable, within 1 km of you.</p>
            <UButton
              size="sm"
              variant="soft"
              color="neutral"
              icon="i-lucide-locate-fixed"
              class="shrink-0"
              :loading="nearbyLoading"
              @click="searchNearby"
            >
              {{ nearbyChecked ? "Search again" : "Search" }}
            </UButton>
          </div>
          <p v-if="nearbyError" class="px-4 pb-3 text-xs text-error">{{ nearbyError }}</p>
          <p v-else-if="nearbyChecked && !nearby.length" class="px-4 pb-3 text-xs text-muted">No discoverable rooms near you.</p>
          <ul v-if="nearby.length" class="border-t border-default divide-y divide-default">
            <li v-for="n in nearby" :key="n.id" class="flex items-center gap-3 px-4 py-2.5">
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium truncate">{{ n.name }}</p>
                <p class="text-xs text-muted truncate">
                  {{ n.default_place || "No default place" }} · {{ distance(n.distance_m) }} · {{ n.members }} {{ n.members === 1 ? "member" : "members" }}
                </p>
              </div>
              <UButton v-if="myRoomIds.has(n.id)" size="sm" variant="ghost" color="neutral" :to="`/rooms/${n.id}`">Open</UButton>
              <UButton v-else size="sm" :loading="busy === `nearby:${n.id}`" @click="joinNearby(n.id)">Join</UButton>
            </li>
          </ul>
        </div>
        <p class="mt-1.5 text-xs text-muted">Your position is sent with the search only and never stored.</p>
      </section>

      <p class="flex items-start gap-2 text-xs text-muted">
        <UIcon name="i-lucide-bell" class="size-3.5 mt-px shrink-0" />
        {{ native
          ? "Call alerts and meeting reminders arrive while the Meeqat app is running."
          : "Call alerts and meeting reminders arrive only while Meeqat is open in a browser tab." }}
      </p>
    </div>

    <!-- Create room -->
    <UModal v-model:open="showCreate" title="Create a room" description="You'll get a code and a link to invite people.">
      <template #body>
        <form class="space-y-4" @submit.prevent="create">
          <UFormField label="Name" required>
            <UInput v-model="createName" class="w-full" :maxlength="60" placeholder="e.g. Floor 3 team" autofocus />
          </UFormField>
          <UFormField label="Default place" hint="Optional" help="Where calls meet unless the caller picks somewhere else.">
            <UInput v-model="createPlace" class="w-full" :maxlength="80" placeholder="e.g. Musalla, Floor 3" />
          </UFormField>
          <UButton block type="submit" :loading="busy === 'create'" :disabled="!createName.trim()">Create room</UButton>
        </form>
      </template>
    </UModal>

    <!-- Join with code -->
    <UModal v-model:open="showJoin" title="Join with a code" description="8 characters — or paste the invite link.">
      <template #body>
        <form class="space-y-3" @submit.prevent="joinWithCode">
          <UInput
            v-model="joinInput"
            class="w-full"
            size="xl"
            :ui="{ base: 'text-center font-mono tracking-[0.3em] uppercase' }"
            placeholder="ABCD2345"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            autofocus
            aria-label="Room code"
          />
          <p v-if="joinError" class="text-xs text-error">{{ joinError }}</p>
          <UButton block type="submit" :loading="joining" :disabled="joinCode.length !== 8">Join room</UButton>
        </form>
      </template>
    </UModal>
  </RoomsShell>
</template>

<script setup lang="ts">
import type { ActiveCallSummary, MyRoom, NearbyRoom } from "@/composables/useRooms";
import { prayerName } from "@/utils/together";
import { isNative } from "@/utils/platform";

useHead({ title: "Pray Together · Meeqat" });

const native = isNative();

const { pb, status, userId, live } = useTogether();
const rooms$ = useRooms();
const alerts = useCallAlerts();
const { busy, run } = useTogetherAction();

// --- My rooms (+ which have an active call), kept live ---
const rooms = ref<MyRoom[]>([]);
const activeCalls = ref<ActiveCallSummary[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);
const myRoomIds = computed(() => new Set(rooms.value.map((r) => r.room)));
const activeByRoom = computed(() => {
  const out: Record<string, string> = {};
  for (const c of activeCalls.value) out[c.room] = out[c.room] ? "Calls now" : `${prayerName(c.prayer)} call`;
  return out;
});

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    const [mine, calls] = await Promise.all([rooms$.fetchMyRooms(), rooms$.fetchActiveCalls()]);
    rooms.value = mine.filter((r) => r.expand?.room);
    activeCalls.value = calls;
  } catch (err) {
    if (!(err instanceof SignedOutError)) loadError.value = describeError(err, "Couldn't load your rooms — retry");
  } finally {
    loading.value = false;
  }
}

let stopLive: (() => void) | null = null;
watch(
  status,
  (s) => {
    stopLive?.();
    stopLive = null;
    if (s !== "ready") return;
    void load();
    const reloadCalls = () => void rooms$.fetchActiveCalls().then((c) => (activeCalls.value = c)).catch(() => {});
    stopLive = live(
      [
        { collection: "calls", onEvent: reloadCalls },
        { collection: "memberships", filter: pb().filter("user = {:uid}", { uid: userId.value }), onEvent: () => void load() },
      ],
      () => void load(),
    );
  },
  { immediate: true },
);
onScopeDispose(() => stopLive?.());

// --- Create ---
const showCreate = ref(false);
const createName = ref("");
const createPlace = ref("");

function openCreate(): void {
  createName.value = "";
  createPlace.value = "";
  showCreate.value = true;
}

async function create(): Promise<void> {
  const name = createName.value.trim();
  if (!name) return;
  let id = "";
  const ok = await run("create", "Couldn't create the room — retry", async () => {
    id = (await rooms$.createRoom({ name, default_place: createPlace.value.trim() })).id;
  });
  if (!ok) return;
  showCreate.value = false;
  alerts.requestNotificationPermission();
  await navigateTo(`/rooms/${id}`);
}

// --- Join with a code ---
const showJoin = ref(false);
const joinInput = ref("");
const joinError = ref<string | null>(null);
const joining = ref(false);
const joinCode = computed(() => normalizeCode(joinInput.value));

function openJoin(): void {
  joinInput.value = "";
  joinError.value = null;
  showJoin.value = true;
}

async function joinWithCode(): Promise<void> {
  joinError.value = null;
  let id = "";
  try {
    joining.value = true;
    id = (await rooms$.joinByCode(joinCode.value)).id;
  } catch (err) {
    joinError.value =
      errorStatus(err) === 404 ? "No room has that code. Check it with whoever shared it." : describeError(err, "Couldn't join — retry");
    return;
  } finally {
    joining.value = false;
  }
  showJoin.value = false;
  alerts.requestNotificationPermission();
  await navigateTo(`/rooms/${id}`);
}

// --- Nearby ---
const nearby = ref<NearbyRoom[]>([]);
const nearbyLoading = ref(false);
const nearbyChecked = ref(false);
const nearbyError = ref<string | null>(null);

async function searchNearby(): Promise<void> {
  nearbyLoading.value = true;
  nearbyError.value = null;
  try {
    nearby.value = await rooms$.nearby();
    nearbyChecked.value = true;
  } catch (err) {
    nearbyError.value = errorStatus(err) === null && err instanceof Error ? err.message : describeError(err, "Couldn't search — retry");
  } finally {
    nearbyLoading.value = false;
  }
}

function distance(m: number): string {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
}

async function joinNearby(roomId: string): Promise<void> {
  if (await run(`nearby:${roomId}`, "Couldn't join — retry", () => rooms$.joinDiscoverable(roomId))) {
    alerts.requestNotificationPermission();
    await navigateTo(`/rooms/${roomId}`);
  }
}
</script>
