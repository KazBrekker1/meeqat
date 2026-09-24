import pkg from "./package.json";

export default defineNuxtConfig({
  modules: ["@vueuse/nuxt", "@nuxt/ui", "nuxt-svgo", "reka-ui/nuxt"],
  runtimeConfig: {
    public: {
      version: pkg.version,
      // Central Sanad auth. Static build: baked in at `nuxt generate` time;
      // override with NUXT_PUBLIC_AUTH_URL for local dev (see Task 11).
      authUrl: process.env.NUXT_PUBLIC_AUTH_URL || "https://auth.sanad.ink",
    },
  },
  app: {
    head: {
      title: "Meeqat",
      charset: "utf-8",
      viewport: "width=device-width, initial-scale=1, viewport-fit=cover",
      meta: [{ name: "format-detection", content: "no" }],
    },
    pageTransition: {
      name: "page",
      mode: "out-in",
    },
    layoutTransition: {
      name: "layout",
      mode: "out-in",
    },
  },
  css: ["@/assets/css/main.css"],
  icon: {
    customCollections: [
      {
        prefix: "local",
        dir: "./app/assets/icons",
      },
    ],
  },
  svgo: {
    autoImportPath: "@/assets/",
  },
  ssr: false,
  imports: {
    dirs: ["composables/prayer"],
  },
  dir: {
    modules: "app/modules",
  },
  vite: {
    clearScreen: false,
    envPrefix: ["VITE_", "TAURI_"],
    server: {
      strictPort: true,
      hmr: {
        protocol: "ws",
        host: "localhost",
        port: 3001,
      },
      watch: {
        ignored: ["**/src-tauri/**"],
      },
    },
  },
  devServer: {
    host: "localhost",
  },
  router: {
    options: {
      scrollBehaviorType: "smooth",
    },
  },
  devtools: {
    enabled: false,
  },
  experimental: {
    typedPages: true,
  },
  compatibilityDate: "2025-07-01",
});
