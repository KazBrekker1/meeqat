import { prepareMoonMap, type MoonMap } from "./sphere";

/**
 * NASA SVS "CGI Moon Kit" LRO LROC colour mosaic (public domain), 1024×512 equirectangular.
 * Shipped in public/ so the apps bundle it; the web serves /moon/* as immutable (Caddyfile.web)
 * — give the file a new name if the map ever changes.
 */
export const MOON_MAP_URL = "/moon/lroc-1024.webp";

/** Contrast stretch applied at load (tuned in design/stage-and-moon.html, Part 1b). */
const MAP_CONTRAST = 1.12;

let pending: Promise<MoonMap> | null = null;

/** Decode the map once per page and share it across every MoonSphere. A failed load can be retried. */
export function loadMoonMap(): Promise<MoonMap> {
  pending ??= (async () => {
    const t0 = performance.now();
    const img = new Image();
    img.decoding = "async";
    img.src = MOON_MAP_URL;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2d canvas unavailable");
    ctx.drawImage(img, 0, 0);
    const raw = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const t1 = performance.now();
    const map = prepareMoonMap(raw, { contrast: MAP_CONTRAST });
    if (import.meta.dev) {
      console.debug(`[moon] map decode ${(t1 - t0).toFixed(1)} ms + prepare ${(performance.now() - t1).toFixed(1)} ms`);
    }
    return map;
  })().catch((err) => {
    pending = null;
    throw err;
  });
  return pending;
}
