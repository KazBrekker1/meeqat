<template>
  <Html class="overflow-x-hidden">
    <Body class="font-sans antialiased">
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

onMounted(async () => {
  try {
    const win = getCurrentWindow();
    await win.onCloseRequested(async (event) => {
      try {
        event.preventDefault();
        await win.minimize();
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
