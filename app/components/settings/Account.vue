<template>
  <!-- Account (native apps: the Pray Together session from a browser sign-in) -->
  <section v-if="nativeAccount">
    <p class="text-[11px] uppercase tracking-wider text-muted mb-1.5">Account</p>
    <div class="rounded-xl bg-elevated border border-default px-4 py-3 flex items-center justify-between gap-3">
      <template v-if="togetherStatus === 'ready' && togetherAccount">
        <div class="flex items-center gap-3 min-w-0">
          <UAvatar :src="togetherAccount.avatar_url || undefined" :alt="togetherAccount.name || '?'" size="sm" />
          <div class="min-w-0">
            <p class="text-sm font-medium truncate">{{ togetherAccount.name || 'Signed in' }}</p>
            <p class="text-xs text-muted truncate">Pray Together</p>
          </div>
        </div>
        <UButton size="sm" variant="soft" color="neutral" @click="() => void signOutTogether()">Sign out</UButton>
      </template>
      <template v-else>
        <div class="min-w-0">
          <p class="text-sm font-medium">Sanad account</p>
          <p class="text-xs text-muted">
            {{ awaitingBrowser ? 'Finish signing in in your browser…' : "Optional. You'll need it for Pray Together." }}
          </p>
        </div>
        <UButton v-if="awaitingBrowser" size="sm" variant="ghost" color="neutral" @click="() => void cancelSignIn()">
          Cancel
        </UButton>
        <UButton
          v-else
          size="sm"
          color="primary"
          icon="i-lucide-external-link"
          :loading="togetherStatus === 'connecting'"
          @click="() => void signInWithBrowser()"
        >
          Sign in with your browser
        </UButton>
      </template>
    </div>
    <p v-if="signInError" class="mt-1.5 text-xs text-error">{{ signInError }}</p>
    <p class="mt-1.5 text-xs text-muted">
      Prayer times and reminders never need an account. <NuxtLink to="/privacy" class="underline">What's stored</NuxtLink>
    </p>
  </section>

  <!-- Account (web: the shared Sanad cookie session) -->
  <section v-else-if="accountSupported">
    <p class="text-[11px] uppercase tracking-wider text-muted mb-1.5">Account</p>
    <div class="rounded-xl bg-elevated border border-default px-4 py-3 flex items-center justify-between gap-3">
      <template v-if="accountStatus === 'signed-in' && accountUser">
        <div class="flex items-center gap-3 min-w-0">
          <UAvatar :src="accountUser.image ?? undefined" :alt="accountUser.name" size="sm" />
          <div class="min-w-0">
            <p class="text-sm font-medium truncate">{{ accountUser.name }}</p>
            <p class="text-xs text-muted truncate">{{ accountUser.email }}</p>
          </div>
        </div>
        <UButton size="sm" variant="soft" color="neutral" @click="signOutAccount">Sign out</UButton>
      </template>
      <template v-else>
        <div class="min-w-0">
          <p class="text-sm font-medium">Sanad account</p>
          <p class="text-xs text-muted">Optional. You'll need it for Pray Together.</p>
        </div>
        <div class="flex flex-col items-end gap-1.5 shrink-0">
          <UButton
            size="sm"
            color="primary"
            icon="i-lucide-log-in"
            :loading="accountStatus === 'unknown'"
            @click="signInWithGoogle"
          >
            Sign in with Google
          </UButton>
          <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-key-round" @click="onPasskey">
            Use a passkey
          </UButton>
        </div>
      </template>
    </div>
    <p v-if="passkeyFailed" class="mt-1.5 text-xs text-error">
      No passkey signed in. Passkeys come from another Sanad app; use Google if you haven't set one up.
    </p>
    <p class="mt-1.5 text-xs text-muted">
      Prayer times and reminders never need an account. <NuxtLink to="/privacy" class="underline">What's stored</NuxtLink>
    </p>
  </section>
</template>

<script lang="ts" setup>
import { getPlatform } from '@/utils/platform';

/** Kept by the settings dialog, so the note survives closing and reopening it. */
const passkeyFailed = defineModel<boolean>('passkeyFailed', { default: false });

const {
  user: accountUser,
  status: accountStatus,
  supported: accountSupported,
  signInWithGoogle,
  signInWithPasskey,
  signOut: signOutAccount,
} = useAccount();
async function onPasskey() {
  passkeyFailed.value = !(await signInWithPasskey());
}

const nativeAccount = getPlatform() !== 'web';
const {
  status: togetherStatus,
  account: togetherAccount,
  awaitingBrowser,
  signInError,
  signInWithBrowser,
  cancelSignIn,
  signOut: signOutTogether,
} = useTogether();
</script>
