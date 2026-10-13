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
    // html/body are overflow-hidden (app-style layout: each page owns its scroller),
    // so the Nuxt root must be exactly viewport-high or pages grow and get clipped.
    rootAttrs: { id: "__nuxt", class: "h-full" },
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
    // Ship every icon the app uses inside the bundle. Without this they are fetched
    // from the Iconify API at runtime, so an offline launch has no icons at all.
    clientBundle: {
      scan: true,
      sizeLimitKb: 512,
      icons: [
        // named in .ts data (prayer icons, reminders), which the scan doesn't see
        "lucide:book-open", "lucide:cloud-sun", "lucide:moon-star", "lucide:sun-medium", "lucide:sunset",
        // Nuxt UI's own defaults (calendar arrows, toast close, select check, spinners…)
        "lucide:arrow-down", "lucide:arrow-left", "lucide:arrow-right", "lucide:arrow-up", "lucide:arrow-up-right", "lucide:check", "lucide:chevron-down", "lucide:chevron-left", "lucide:chevron-right", "lucide:chevron-up", "lucide:chevrons-left", "lucide:chevrons-right", "lucide:circle-alert", "lucide:circle-check", "lucide:circle-x", "lucide:copy", "lucide:copy-check", "lucide:ellipsis", "lucide:eye", "lucide:eye-off", "lucide:file", "lucide:folder", "lucide:folder-open", "lucide:grip-vertical", "lucide:hash", "lucide:info", "lucide:lightbulb", "lucide:loader-circle", "lucide:menu", "lucide:minus", "lucide:monitor", "lucide:moon", "lucide:panel-left-close", "lucide:panel-left-open", "lucide:plus", "lucide:rotate-ccw", "lucide:search", "lucide:square", "lucide:sun", "lucide:terminal", "lucide:triangle-alert", "lucide:upload", "lucide:x",
      ],
    },
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
