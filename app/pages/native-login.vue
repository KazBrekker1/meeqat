<template>
  <div class="h-full overflow-y-auto bg-default text-highlighted pt-safe pb-safe">
    <main class="mx-auto max-w-md px-4 py-12">
      <div class="flex items-center justify-center gap-2 mb-8">
        <MeeqatMark class="size-6 text-indigo-300" />
        <span class="text-lg font-semibold">Meeqat</span>
      </div>

      <div v-if="phase === 'invalid'" class="rounded-xl bg-elevated border border-default px-5 py-8 text-center space-y-2">
        <UIcon name="i-lucide-link-2-off" class="size-8 mx-auto text-muted" />
        <h1 class="text-base font-semibold">This sign-in link is incomplete</h1>
        <p class="text-sm text-muted">Start again from the Meeqat app: Pray Together → Sign in with your browser.</p>
      </div>

      <div v-else-if="phase === 'checking'" class="py-16 grid place-items-center">
        <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-muted" />
      </div>

      <RoomsSignInGate
        v-else-if="phase === 'sign-in'"
        title="Sign in to the Meeqat app"
        description="Sign in with your Sanad account here; you'll be sent back to the app."
        sanad-only
        @signed-in="handOff"
      />

      <div v-else class="rounded-xl bg-elevated border border-default px-5 py-8 flex flex-col items-center text-center gap-4">
        <template v-if="phase === 'handing-off'">
          <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin text-muted" />
          <p class="text-sm">Signing you in to the Meeqat app…</p>
        </template>

        <template v-else-if="phase === 'error'">
          <UIcon name="i-lucide-triangle-alert" class="size-8 text-error" />
          <p class="text-sm">{{ error }}</p>
          <UButton icon="i-lucide-rotate-cw" @click="handOff">Try again</UButton>
        </template>

        <template v-else-if="phase === 'done' && code">
          <UIcon name="i-lucide-circle-check" class="size-8 text-success" />
          <div class="space-y-1">
            <h1 class="text-base font-semibold">Opening Meeqat…</h1>
            <p v-if="user" class="text-sm text-muted">Signed in as {{ user.name }}. You can close this tab once the app opens.</p>
          </div>
          <UButton :href="appLink" icon="i-lucide-external-link">Open Meeqat</UButton>
          <div class="w-full border-t border-default pt-4 space-y-2">
            <p class="text-xs text-muted">App didn't open? Copy this code and choose “Paste code” in the app. It works once, for 3 minutes.</p>
            <div class="flex gap-2">
              <UInput :model-value="code" readonly size="sm" class="flex-1 font-mono" aria-label="Sign-in code" />
              <UButton size="sm" variant="soft" color="neutral" :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'" @click="copyCode">
                {{ copied ? "Copied" : "Copy code" }}
              </UButton>
            </div>
          </div>
        </template>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { looksLikeBase64url } from "@/utils/pkce";

definePageMeta({ middleware: "web-only" });
useHead({ title: "Sign in to the app · Meeqat", htmlAttrs: { class: "dark" } });

type Phase = "invalid" | "checking" | "sign-in" | "handing-off" | "error" | "done";

const route = useRoute();
// base64url of a SHA-256 digest is 43 characters; the app's state is 22.
const challenge = route.query.challenge;
const state = route.query.state;
const valid = looksLikeBase64url(challenge, 43, 43) && looksLikeBase64url(state, 16, 128);

const togetherUrl = useRuntimeConfig().public.togetherUrl as string;
const { status: accountStatus, user, refresh, getToken } = useAccount();

const phase = ref<Phase>(valid ? "checking" : "invalid");
const error = ref<string | null>(null);
const code = ref<string | null>(null);
const copied = ref(false);

const appLink = computed(() =>
  code.value && typeof state === "string" ? `meeqat://auth?${new URLSearchParams({ code: code.value, state })}` : undefined,
);

async function handOff(): Promise<void> {
  if (!valid) return;
  phase.value = "handing-off";
  error.value = null;
  try {
    const token = await getToken();
    if (!token) {
      await refresh();
      phase.value = accountStatus.value === "signed-in" ? "error" : "sign-in";
      error.value = "Couldn't confirm your Sanad sign-in — try again";
      return;
    }
    const res = await fetch(`${togetherUrl}/api/sanad/handoff`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, challenge }),
    });
    if (!res.ok) {
      error.value =
        res.status === 429
          ? "Too many attempts — wait a few minutes and retry"
          : res.status === 400
            ? "This sign-in link is incomplete. Start again from the Meeqat app."
            : "Couldn't sign you in to the app — try again";
      phase.value = "error";
      return;
    }
    const body = (await res.json()) as { code?: string };
    if (!body.code) throw new Error("no code");
    code.value = body.code;
    phase.value = "done";
    window.location.href = appLink.value!;
  } catch {
    error.value = "Can't reach Meeqat's server — check your connection and retry";
    phase.value = "error";
  }
}

async function copyCode(): Promise<void> {
  if (!code.value) return;
  try {
    await navigator.clipboard.writeText(code.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    // The field is selectable; copying by hand still works.
  }
}

onMounted(async () => {
  if (!valid) return;
  await refresh();
  if (accountStatus.value === "signed-in") await handOff();
  else phase.value = "sign-in";
});
</script>
