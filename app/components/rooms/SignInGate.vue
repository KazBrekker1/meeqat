<template>
  <div class="rounded-xl bg-elevated border border-default px-5 py-8 flex flex-col items-center text-center gap-4">
    <div class="size-12 rounded-full bg-primary/15 grid place-items-center">
      <UIcon name="i-lucide-users" class="size-6 text-primary" />
    </div>
    <div class="space-y-1">
      <h2 class="text-base font-semibold">{{ title }}</h2>
      <p class="text-sm text-muted max-w-xs">
        Pray Together needs a Sanad account. Prayer times and reminders keep working without one.
      </p>
    </div>
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
    <NuxtLink to="/privacy" class="text-xs text-muted underline">What's stored</NuxtLink>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ title?: string }>(), { title: "Sign in to pray together" });

const { status: accountStatus, signInWithGoogle, signInWithPasskey } = useAccount();
const { ensureSession } = useTogether();
const passkeyFailed = ref(false);
const passkeyBusy = ref(false);

// Google redirects away and back to this page; a passkey signs in in place.
async function onPasskey(): Promise<void> {
  passkeyBusy.value = true;
  try {
    passkeyFailed.value = !(await signInWithPasskey());
    if (!passkeyFailed.value) await ensureSession();
  } finally {
    passkeyBusy.value = false;
  }
}
</script>
