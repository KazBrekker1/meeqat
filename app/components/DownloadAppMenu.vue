<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";

// "Get the app" on the web: links to the latest GitHub release's installers.
// Asset names carry the version (Meeqat_3.5.0_x64.dmg), so they're resolved at
// runtime from the releases API; the visitor's own platform is listed first.

interface Build {
  id: "mac-arm" | "mac-intel" | "windows" | "linux-appimage" | "linux-deb" | "android";
  label: string;
  hint: string;
  icon: string;
  match: RegExp;
}

const BUILDS: Build[] = [
  { id: "mac-arm", label: "macOS · Apple Silicon", hint: ".dmg", icon: "i-lucide-apple", match: /_aarch64\.dmg$/ },
  { id: "mac-intel", label: "macOS · Intel", hint: ".dmg", icon: "i-lucide-apple", match: /_x64\.dmg$/ },
  { id: "windows", label: "Windows", hint: "installer .exe", icon: "i-lucide-monitor", match: /_x64-setup\.exe$/ },
  { id: "linux-appimage", label: "Linux", hint: ".AppImage", icon: "i-lucide-terminal", match: /_amd64\.AppImage$/ },
  { id: "linux-deb", label: "Linux · Debian/Ubuntu", hint: ".deb", icon: "i-lucide-terminal", match: /_amd64\.deb$/ },
  { id: "android", label: "Android", hint: ".apk", icon: "i-lucide-smartphone", match: /-release\.apk$/ },
];

const RELEASES_PAGE = "https://github.com/KazBrekker1/meeqat/releases/latest";

const assets = ref<Record<string, string>>({});
const version = ref<string | null>(null);

function visitorBuild(): Build["id"] | null {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "android";
  if (/Windows/i.test(ua)) return "windows";
  if (/Mac OS X|Macintosh/i.test(ua)) return "mac-arm"; // browsers don't expose Apple Silicon vs Intel; most Macs sold since 2020 are ARM
  if (/Linux/i.test(ua)) return "linux-appimage";
  return null;
}

onMounted(async () => {
  try {
    const res = await fetch("https://api.github.com/repos/KazBrekker1/meeqat/releases/latest", {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return;
    const data = (await res.json()) as { tag_name: string; assets: { name: string; browser_download_url: string }[] };
    version.value = data.tag_name.replace(/^meeqat-v/, "");
    for (const b of BUILDS) {
      const a = data.assets.find((x) => b.match.test(x.name));
      if (a) assets.value[b.id] = a.browser_download_url;
    }
  } catch {
    // offline / rate-limited: items fall back to the releases page
  }
});

const items = computed<DropdownMenuItem[][]>(() => {
  const mine = visitorBuild();
  const ordered = [...BUILDS].sort((a, b) => Number(b.id === mine) - Number(a.id === mine));
  return [
    ordered.map((b) => ({
      label: b.label,
      description: b.id === mine ? `Recommended · ${b.hint}` : b.hint,
      icon: b.icon,
      to: assets.value[b.id] ?? RELEASES_PAGE,
      target: "_blank",
    })),
    [{ label: version.value ? `All downloads · v${version.value}` : "All downloads", icon: "i-lucide-external-link", to: RELEASES_PAGE, target: "_blank" }],
  ];
});
</script>

<template>
  <UDropdownMenu :items="items" :content="{ align: 'end' }" :ui="{ content: 'w-64' }">
    <!-- Icon-only on phones: the header has no room for the label next to the city. -->
    <UButton icon="i-lucide-download" size="xs" color="primary" variant="soft" class="shrink-0" aria-label="Get the app">
      <span class="hidden sm:inline">Get the app</span>
    </UButton>
  </UDropdownMenu>
</template>
