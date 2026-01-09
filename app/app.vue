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
