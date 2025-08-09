<template>
  <UButton
    :icon="is_dark ? 'lucide:moon' : 'lucide:sun'"
    color="neutral"
    variant="ghost"
    size="xs"
    @click="is_dark = !is_dark"
  />
</template>

<script setup lang="ts">
const colorMode = useColorMode();

const is_dark = computed({
  get() {
    return colorMode.value === "dark";
  },
  set() {
    colorMode.preference = colorMode.value === "dark" ? "light" : "dark";
  },
});
</script>
