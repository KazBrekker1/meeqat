import { prepareMoonMap, type MoonMap } from "./sphere";
import { prepareGrey, STYLE_SRC, type GreyChain, type MapKind, type MoonStyle } from "./styles";

/**
 * NASA SVS "CGI Moon Kit" LRO LROC colour mosaic (public domain), 1024×512 equirectangular.
 * Shipped in public/ so the apps bundle it; the web serves /moon/* as immutable (Caddyfile.web)
 * — give the file a new name if the map ever changes.
 */
export const MOON_MAP_URL = "/moon/lroc-1024.webp";
/** The same LROC WAC mosaic as a greyscale albedo map, 512×256 (for the illustrated styles). */
export const ALBEDO_MAP_URL = "/moon/albedo-512.webp";

/** Contrast stretch applied at load (tuned in design/stage-and-moon.html, Part 1b). */
const MAP_CONTRAST = 1.12;

/** Promise cache that forgets a failure, so a failed load can be retried. */
function once<T>(make: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () =>
    (pending ??= make().catch((err) => {
      pending = null;
      throw err;
    }));
}

/** Decodes an image to RGBA once per URL (the LROC map feeds both photo and duotone). */
const pixels = new Map<string, () => Promise<ImageData>>();
function decode(url: string): Promise<ImageData> {
  let get = pixels.get(url);
  if (!get) {
    get = once(async () => {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("2d canvas unavailable");
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, canvas.width, canvas.height);
    });
    pixels.set(url, get);
  }
  return get();
}

function timed<T>(label: string, url: string, prepare: (img: ImageData) => T): () => Promise<T> {
  return once(async () => {
    const t0 = performance.now();
    const raw = await decode(url);
    const t1 = performance.now();
    const out = prepare(raw);
    if (import.meta.dev) console.debug(`[moon] ${label} decode ${(t1 - t0).toFixed(1)} ms + prepare ${(performance.now() - t1).toFixed(1)} ms`);
    return out;
  });
}

const loaders: { photo: () => Promise<MoonMap>; lroc: () => Promise<GreyChain>; albedo: () => Promise<GreyChain> } = {
  photo: timed("photo map", MOON_MAP_URL, (img) => prepareMoonMap(img, { contrast: MAP_CONTRAST })),
  lroc: timed("lroc grey", MOON_MAP_URL, prepareGrey),
  albedo: timed("albedo", ALBEDO_MAP_URL, prepareGrey),
};

/**
 * The map a style paints from, loaded on first use and shared by every MoonSphere
 * (glass/engraved/manuscript/stipple → albedo-512, photo/duotone → lroc-1024).
 */
export function loadStyleMap(style: MoonStyle): Promise<MoonMap | GreyChain> {
  const kind: MapKind = STYLE_SRC[style].map;
  return loaders[kind]();
}
