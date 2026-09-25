import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getPlatform } from "@/utils/platform";

const HANDLED_KEY = "meeqat:deep-link:handled";

/**
 * `meeqat://` links in the native apps:
 * - `meeqat://auth?code=…&state=…` finishes a browser sign-in (see /native-login);
 * - `meeqat://r/<CODE>` opens the room invite page.
 * The link that launched the app comes from getCurrent(); later ones from onOpenUrl
 * (Windows/Linux get them through the single-instance plugin).
 */
export default defineNuxtPlugin(async () => {
  const platform = getPlatform();
  if (platform === "web") return;
  // Desktop has a second webview for the tray popover; only the main window routes.
  if (platform === "desktop" && getCurrentWebviewWindow().label !== "main") return;

  const { redeem, signInError } = useTogether();
  const toast = useToast();
  const router = useRouter();

  async function handle(raw: string): Promise<void> {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return;
    }
    if (url.protocol !== "meeqat:") return;

    if (url.hostname === "auth") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (!code || !state) return;
      if (await redeem(code, state)) {
        toast.add({ title: "Signed in to Pray Together", icon: "i-lucide-check", color: "success" });
        if (router.currentRoute.value.path === "/") await router.push("/rooms");
      } else {
        toast.add({ title: "Couldn't sign in", description: signInError.value ?? undefined, color: "error", icon: "i-lucide-triangle-alert" });
      }
      return;
    }

    if (url.hostname === "r") {
      const code = url.pathname.replace(/^\/+/, "").split("/")[0];
      if (code) await router.push(`/r/${encodeURIComponent(code)}`);
    }
  }

  function handleAll(urls: string[] | null | undefined): void {
    for (const u of urls ?? []) void handle(u);
  }

  try {
    await onOpenUrl(handleAll);
    // The launch link survives webview reloads; handle it once per app run.
    const launch = await getCurrent();
    const key = launch?.join(" ");
    if (key && sessionStorage.getItem(HANDLED_KEY) !== key) {
      sessionStorage.setItem(HANDLED_KEY, key);
      onNuxtReady(() => handleAll(launch));
    }
  } catch (err) {
    console.warn("[deep-link] unavailable", err);
  }
});
