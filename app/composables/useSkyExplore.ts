import { ref, shallowRef } from "vue";
import type { SkyPick } from "@/utils/sky/describe";
import type { ViewState } from "@/utils/sky/view";
import { clamp, wrapPi } from "@/utils/sky/vec";

export type { SkyPick };
/** What the real sky behind the page can show: SkyBackground falls back on anything but "ready". */
export type SkyStatus = "loading" | "ready" | "no-webgl" | "catalog-failed" | "lost";

const isOpen = ref(false);
/** The home sky is drawn and can be explored (kept by RealSky). */
const available = ref(false);
/** Where explore looks; replaced on every change so watchers fire. */
const view = shallowRef<ViewState>({ alt: 0, az: 0, fovDeg: 100 });
/** The time slider's instant; null = now. */
const time = shallowRef<Date | null>(null);
const selection = shallowRef<SkyPick | null>(null);
/** The constellation under the mouse (desktop hover), −1 for none. */
const hoverFigure = ref(-1);
/** The orbit's Moon is hidden: explore draws it (from opening until it has flown back on close). */
const moonHidden = ref(false);
/** Closing: the page stays hidden while the explore sky cross-fades back to the home sky. */
const leaving = ref(false);
/** Bumped by RealSky when the sky can no longer be drawn while exploring. */
const closeRequests = ref(0);
/** The home background's current view, kept by RealSky; explore starts from it. Plain, not reactive. */
const backdrop: ViewState = { alt: 0, az: 0, fovDeg: 100 };

let glideFrame = 0;
const ease = (t: number) => t * t * (3 - 2 * t);

/** Animates the view to a target; a new glide, a drag or a flick cancels it. */
function glide(to: Partial<ViewState>, ms = 500, done?: () => void) {
  cancelAnimationFrame(glideFrame);
  const from = view.value, t0 = performance.now();
  const dAz = wrapPi((to.az ?? from.az) - from.az);
  const step = (now: number) => {
    const t = ease(clamp((now - t0) / ms, 0, 1));
    view.value = {
      alt: from.alt + ((to.alt ?? from.alt) - from.alt) * t,
      az: from.az + dAz * t,
      fovDeg: from.fovDeg + ((to.fovDeg ?? from.fovDeg) - from.fovDeg) * t,
    };
    if (t < 1) glideFrame = requestAnimationFrame(step);
    else {
      glideFrame = 0;
      done?.();
    }
  };
  glideFrame = requestAnimationFrame(step);
}

function stopGlide() {
  cancelAnimationFrame(glideFrame);
  glideFrame = 0;
}

/** Explore mode's state for this window: RealSky draws it, sky/Explore.vue drives it. */
export function useSkyExplore() {
  return { isOpen, available, view, time, selection, hoverFigure, moonHidden, leaving, closeRequests, backdrop, glide, stopGlide };
}
