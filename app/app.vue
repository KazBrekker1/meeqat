<template>
  <Html class="h-full overflow-hidden">
    <Body class="h-full font-sans antialiased overflow-hidden">
      <UApp>
        <NuxtLayout>
          <NuxtPage />
        </NuxtLayout>
      </UApp>
    </Body>
  </Html>
</template>

<script setup lang="ts">
import { getCurrentWindow } from "@tauri-apps/api/window";
import { platform } from "@tauri-apps/plugin-os";
import { isTauriAvailable } from "@/utils/store";

const route = useRoute();

onMounted(async () => {
  // Skip close handler for tray window
  if (route.path === '/tray') return;
  // Browser/prototype context (no Tauri runtime): the OS plugin would throw on
  // platform(). Nothing to wire up without a native window — bail out.
  if (!isTauriAvailable()) return;
  // Desktop only: hide-on-close keeps the app alive in the tray. On mobile this
  // would trap the user by hiding the sole window on a back/close gesture — let
  // the OS handle it natively instead.
  const currentPlatform = platform();
  if (currentPlatform === 'android' || currentPlatform === 'ios') return;

  try {
    const win = getCurrentWindow();
    await win.onCloseRequested(async (event) => {
      try {
        event.preventDefault();
        await win.hide();
      } catch (error) {
        console.error(error);
        console.error("Failed to handle close request");
      }
    });
  } catch {
    console.error("Failed to get current window");
  }
});
</script>
