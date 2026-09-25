import pkg from "./package.json";

export default defineNuxtConfig({
  modules: ["@vueuse/nuxt", "@nuxt/ui", "nuxt-svgo", "reka-ui/nuxt"],
  runtimeConfig: {
    public: {
      version: pkg.version,
      // Central Sanad auth. Static build: baked in at `nuxt generate` time;
      // override with NUXT_PUBLIC_AUTH_URL for local dev (see Task 11).
      authUrl: process.env.NUXT_PUBLIC_AUTH_URL || "https://auth.sanad.ink",
      // Pray Together backend: also serves the "add to calendar" ICS feed.
      togetherUrl: process.env.NUXT_PUBLIC_TOGETHER_URL || "https://together.sanad.ink",
      // The web app: the native apps send sign-in through its /native-login page.
      webUrl: process.env.NUXT_PUBLIC_WEB_URL || "https://meeqat.sanad.ink",
    },
  },
  app: {
    head: {
      title: "Meeqat",
      charset: "utf-8",
      viewport: "width=device-width, initial-scale=1, viewport-fit=cover",
      meta: [
        { name: "format-detection", content: "no" },
        { name: "theme-color", content: "#0a0e22" },
      ],
      // Same artwork as the desktop/Android app icon (src-tauri/icons).
      link: [
        { rel: "icon", href: "/favicon.ico", sizes: "any" },
        { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
        { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      ],
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
