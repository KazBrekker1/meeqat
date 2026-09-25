<template>
  <div class="h-full overflow-y-auto bg-default text-highlighted">
    <header class="sticky top-0 z-10 border-b border-default bg-default/85 backdrop-blur-sm pt-safe">
      <div class="mx-auto flex items-center gap-2 px-3 sm:px-4 min-h-14" :class="wide ? 'max-w-5xl' : 'max-w-xl'">
        <UButton :to="back" icon="i-lucide-arrow-left" variant="ghost" color="neutral" :aria-label="backLabel" />
        <div class="min-w-0 flex-1">
          <h1 class="text-base font-semibold truncate">{{ title }}</h1>
          <p v-if="subtitle" class="text-xs text-muted truncate">{{ subtitle }}</p>
        </div>
        <slot v-if="status === 'ready'" name="actions" />
      </div>
    </header>

    <main class="mx-auto px-4 pt-5 pb-12 pb-safe" :class="wide ? 'max-w-5xl' : 'max-w-xl'">
      <div v-if="status === 'connecting'" class="py-20 grid place-items-center">
        <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-muted" />
      </div>
      <div v-else-if="status === 'signed-out'" class="max-w-md mx-auto">
        <RoomsSignInGate :title="gateTitle" />
      </div>
      <UAlert
        v-else-if="status === 'error'"
        color="error"
        variant="subtle"
        icon="i-lucide-cloud-off"
        :title="error ?? 'Something went wrong'"
        description="Prayer times keep working; only Pray Together is affected."
        :actions="[{ label: 'Retry', color: 'error', variant: 'outline', onClick: retry }]"
      />
      <template v-else>
        <UAlert
          v-if="!online"
          class="mb-5"
          color="warning"
          variant="subtle"
          icon="i-lucide-wifi-off"
          title="You're offline"
          description="Showing what was last loaded. Changes won't go through until you reconnect."
        />
        <slot />
      </template>
    </main>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    back?: string;
    backLabel?: string;
    gateTitle?: string;
    wide?: boolean;
  }>(),
  { back: "/", backLabel: "Back", gateTitle: undefined, subtitle: undefined },
);

useHead({ htmlAttrs: { class: "dark" } });

const { status, error, ensureSession } = useTogether();
const alerts = useCallAlerts();
const online = useOnline();

function retry(): void {
  void ensureSession();
}

onMounted(() => void ensureSession());
// Alerts run on every rooms page once signed in; start() is idempotent.
watch(status, (s) => s === "ready" && void alerts.start(), { immediate: true });
</script>
