export default defineNuxtConfig({
  modules: ["@vueuse/nuxt", "@nuxt/ui", "nuxt-svgo", "reka-ui/nuxt"],
  app: {
    head: {
      title: "Meeqat",
      charset: "utf-8",
      viewport: "width=device-width, initial-scale=1",
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
  dir: {
    modules: "app/modules",
  },
  imports: {
    presets: [
      {
        from: "zod",
        imports: [
          "z",
          {
            name: "infer",
            as: "zInfer",
            type: true,
          },
        ],
      },
    ],
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
