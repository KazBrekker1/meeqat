import { shallowRef } from "vue";

/** The Moon the real sky is pinned to: its element and its disc radius in CSS px. */
export interface SkyAnchor {
  el: HTMLElement;
  moonRadius: number;
}

const anchor = shallowRef<SkyAnchor | null>(null);

/**
 * The orbit registers its Moon here, so the real sky behind the page (RealSky) puts the Moon's
 * true position exactly under it and scales the sky to the Moon's size. One per window.
 */
export function useSkyAnchor() {
  return anchor;
}

export function setSkyAnchor(el: HTMLElement | null | undefined, moonRadius: number) {
  anchor.value = el ? { el, moonRadius } : null;
}

export function clearSkyAnchor(el: HTMLElement | null | undefined) {
  if (el && anchor.value?.el === el) anchor.value = null;
}
