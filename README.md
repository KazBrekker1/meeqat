## Meeqat

Minimal, elegant prayer times app built with Nuxt 4 and Tauri 2. Runs as a desktop app (macOS/Windows/Linux) with a live tray indicator and offline-friendly caching.

### Features

- **City & country selection**: Choose from curated lists; supports multiple calculation methods.
- **Live times**: Current time, Gregorian and Hijri dates.
- **Next prayer countdown**: Highlights the upcoming prayer and shows a live countdown.
- **Tray integration (desktop)**: System tray title and menu update with date and countdown.
- **Athan alert**: Lightweight tone pattern at prayer time; dismissible.
- **Offline-friendly**: Caches fetched days and persists preferences (Tauri Store with web fallback).
- **Optional extra timezone**: Display an alternate timezone alongside local times.

### Tech stack

- **Nuxt 4** + **Vue 3** and **@nuxt/ui** for the interface
- **Tauri 2** for desktop packaging and tray integration
- **Bun** for package management and scripts

### Quick start

Prerequisites:

- Bun installed (`curl -fsSL https://bun.sh/install | bash`)
- For desktop builds: Tauri prerequisites (Rust toolchain, platform SDKs)

- For Android builds: JDK 17, Android SDK + NDK, Android Studio or CLI tools

Install dependencies:

```bash
bun install
```

Run in the browser (no desktop features):

```bash
bun run dev
```

Run as a desktop app with Tauri (tray, persistence, etc.):

```bash
bun run tauri:dev
```

Build static site output:

```bash
bun run generate
```

Build desktop binaries:

```bash
bun run tauri:build
# or a debug build
bun run tauri:build:debug
```

### Android (APK)

Prerequisites:

- Java 17 (Temurin recommended)
- Android SDK + NDK installed (ensure `sdkmanager` and `ndk` available)
- Rust with Android targets (installed automatically on first init)

Initialize the Android project (generates files under `src-tauri/gen/android`):

```bash
bun run tauri:android:init
```

Run on a connected device/emulator (debug):

```bash
bun run tauri:android:dev
```

Build a release APK:

```bash
bun run tauri:android:build:release
# The APK will be generated under:
# src-tauri/gen/android/**/outputs/**/*.apk
```

### Project structure

- `app/` — Nuxt app (pages, components, composables, UI)
- `src-tauri/` — Tauri project (config, Rust sources, icons)

Notable pieces:

- `app/composables/usePrayerTimes.ts` — fetching, caching, countdowns, and athan logic
- `app/plugins/tray.client.ts` — system tray setup and live updates

### Configuration

No environment variables are required. Prayer times are fetched by city/country, calculation method, and timezone. The app persists your last selections locally.

### Acknowledgements

- Shoutout to **Nuxtor** for the Nuxt × Tauri scaffolding inspiration.
- Shoutout to the **Adhan/AlAdhan Prayer Times API** powering the timings.

### License

Copyright © 2025. All rights reserved.
