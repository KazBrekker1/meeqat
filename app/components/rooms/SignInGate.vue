<template>
  <div class="rounded-xl bg-elevated border border-default px-5 py-8 flex flex-col items-center text-center gap-4">
    <div class="size-12 rounded-full bg-primary/15 grid place-items-center">
      <UIcon name="i-lucide-users" class="size-6 text-primary" />
    </div>
    <div class="space-y-1">
      <h2 class="text-base font-semibold">{{ title }}</h2>
      <p class="text-sm text-muted max-w-xs">{{ description }}</p>
    </div>

    <!-- Native apps: sign in on the web, come back with a deep link (or a pasted code). -->
    <template v-if="native && !sanadOnly">
      <template v-if="awaitingBrowser">
        <div class="flex items-center gap-2 text-sm">
          <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin text-muted" />
          Finish signing in in your browser…
        </div>
        <form v-if="showPaste" class="flex w-full max-w-xs gap-2" @submit.prevent="onPaste">
          <UInput v-model="pastedCode" placeholder="Paste the code" size="sm" class="flex-1" autofocus />
          <UButton type="submit" size="sm" :loading="redeeming" :disabled="!pastedCode.trim()">Sign in</UButton>
        </form>
        <div class="flex items-center gap-1.5">
          <UButton v-if="!showPaste" size="sm" variant="ghost" color="neutral" icon="i-lucide-clipboard" @click="() => { showPaste = true; }">
            Paste code
          </UButton>
          <UButton size="sm" variant="ghost" color="neutral" @click="onCancel">Cancel</UButton>
        </div>
      </template>
      <template v-else>
        <UButton color="primary" icon="i-lucide-external-link" :loading="opening" @click="onBrowser">
          Sign in with your browser
        </UButton>
        <p class="text-xs text-muted max-w-xs">
          Opens meeqat.sanad.ink to sign in with Google or a passkey, then brings you back here.
        </p>
      </template>
      <p v-if="signInError" class="text-xs text-error max-w-xs">{{ signInError }}</p>
    </template>

    <template v-else>
      <div class="flex flex-col items-center gap-1.5">
        <UButton color="primary" icon="i-lucide-log-in" :loading="accountStatus === 'unknown'" @click="signInWithGoogle">
          Sign in with Google
        </UButton>
        <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-key-round" :loading="passkeyBusy" @click="onPasskey">
          Use a passkey
        </UButton>
      </div>
      <p v-if="passkeyFailed" class="text-xs text-error max-w-xs">
        No passkey signed in. Passkeys come from another Sanad app; use Google if you haven't set one up.
      </p>
    </template>
    <NuxtLink to="/privacy" class="text-xs text-muted underline">What's stored</NuxtLink>
  </div>
</template>

<script setup lang="ts">
import { isNative } from "@/utils/platform";

const props = withDefaults(
  defineProps<{
    title?: string;
    description?: string;
    /** Only sign in to Sanad (the /native-login page): no Together session in this browser. */
    sanadOnly?: boolean;
  }>(),
  {
    title: "Sign in to pray together",
    description: "Pray Together needs a Sanad account. Prayer times and reminders keep working without one.",
  },
);
const emit = defineEmits<{ "signed-in": [] }>();

const native = isNative();
const { status: accountStatus, signInWithGoogle, signInWithPasskey } = useAccount();
const { ensureSession, awaitingBrowser, signInError, signInWithBrowser, cancelSignIn, redeem } = useTogether();
const passkeyFailed = ref(false);
const passkeyBusy = ref(false);

// Google redirects away and back to this page; a passkey signs in in place.
async function onPasskey(): Promise<void> {
  passkeyBusy.value = true;
  try {
    passkeyFailed.value = !(await signInWithPasskey());
    if (passkeyFailed.value) return;
    emit("signed-in");
    if (!props.sanadOnly) await ensureSession();
  } finally {
    passkeyBusy.value = false;
  }
}

// --- Native ---
const opening = ref(false);
const showPaste = ref(false);
const pastedCode = ref("");
const redeeming = ref(false);

async function onBrowser(): Promise<void> {
  opening.value = true;
  try {
    await signInWithBrowser();
  } finally {
    opening.value = false;
  }
}

// Deep links only reach an installed app bundle (not `tauri dev` on macOS):
// the web page shows the code to paste here instead.
async function onPaste(): Promise<void> {
  redeeming.value = true;
  try {
    if (await redeem(pastedCode.value)) pastedCode.value = "";
  } finally {
    redeeming.value = false;
  }
}

async function onCancel(): Promise<void> {
  showPaste.value = false;
  pastedCode.value = "";
  await cancelSignIn();
}
</script>
