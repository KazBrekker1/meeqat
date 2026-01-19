<template>
  <slot />
</template>

<style>
/* Force transparent background for tray window - override everything */
html,
body,
#__nuxt,
#__nuxt > *,
[data-v-app],
[data-v-app] > *,
.dark,
.dark > *,
[data-theme],
[data-theme] > * {
  background: transparent !important;
  background-color: transparent !important;
}
</style>
