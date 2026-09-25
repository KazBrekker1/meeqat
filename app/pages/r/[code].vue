<template>
  <RoomsShell title="Join a room" :subtitle="`Code ${code}`" back="/rooms" back-label="Pray Together" :gate-title="`Sign in to join room ${code}`">
    <div class="max-w-md mx-auto rounded-xl bg-elevated border border-default px-5 py-10 text-center space-y-4">
      <template v-if="error">
        <UIcon name="i-lucide-triangle-alert" class="size-8 mx-auto text-error" />
        <p class="text-sm">{{ error }}</p>
        <div class="flex justify-center gap-2">
          <UButton v-if="retryable" icon="i-lucide-rotate-cw" @click="join">Try again</UButton>
          <UButton to="/rooms" variant="soft" color="neutral">Go to my rooms</UButton>
        </div>
      </template>
      <template v-else>
        <UIcon name="i-lucide-loader-circle" class="size-8 mx-auto animate-spin text-muted" />
        <p class="text-sm text-muted">Joining room <span class="font-mono tracking-widest text-highlighted">{{ code }}</span>…</p>
      </template>
    </div>
  </RoomsShell>
</template>

<script setup lang="ts">
definePageMeta({ middleware: "web-only" });
useHead({ title: "Join a room · Meeqat" });

const route = useRoute();
const code = normalizeCode(String(route.params.code));

const { status } = useTogether();
const { joinByCode } = useRooms();
const alerts = useCallAlerts();

const error = ref<string | null>(null);
const retryable = ref(true);
let joining = false;

async function join(): Promise<void> {
  if (joining) return;
  joining = true;
  error.value = null;
  try {
    if (code.length !== 8) throw Object.assign(new Error("bad code"), { invalid: true });
    const room = await joinByCode(code);
    alerts.requestNotificationPermission();
    await navigateTo(`/rooms/${room.id}`, { replace: true });
  } catch (err) {
    if (err instanceof SignedOutError) return; // the sign-in gate is showing
    const notFound = errorStatus(err) === 404 || (err as { invalid?: boolean }).invalid;
    retryable.value = !notFound;
    error.value = notFound
      ? "This invite doesn't match a room. The code may have been changed — ask for a new link."
      : describeError(err, "Couldn't join — retry");
  } finally {
    joining = false;
  }
}

// Signed in already, or once the sign-in gate completes.
watch(status, (s) => s === "ready" && void join(), { immediate: true });
</script>
