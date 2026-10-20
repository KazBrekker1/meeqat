# Real sky behind the Moon — design

Status: draft for review · 2026-10-20
Mockup: `design/sky-backdrop.html` (row A is the chosen look; the explore panel is the interaction model).

## 1. Goal

Replace the home screen's random star-field with the real sky around the Moon, and let the
user open an explore mode to look around the whole sky and learn the stars, constellations
and planets. It has to be very cheap to run: nothing draws while idle, and a drag costs a
couple of milliseconds of CPU.

Non-goals (v1): pointing the phone at the sky (motion sensors), a daylight sky, the Milky
Way and deep-sky objects, twinkling, other sky cultures (e.g. the lunar mansions), explore
mode in the tray, and any change to the Android home-screen widget.

## 2. Decisions

- **The sky around the Moon, as you would see it looking at it.** The view is centred on
  the Moon's real direction with the horizon level (zenith up), and the Moon's real
  position sits exactly under the orbit's Moon.
- **Real positions, always a dark sky** (mockup row A). The night palette at every hour.
  Below the horizon the ground is a gentle dimming with a faint horizon line, and stars
  there are drawn at about a third of their brightness. When the Moon has set it is still
  shown at its real place, as if seen through the ground.
- **The Moon keeps its live tilt** (as seen in the sky), also while it is below the
  horizon, so it turns smoothly with its stars and never jumps at rise or set. This
  replaces the uncommitted fixed north-up change from the same day.
- **Explore is a separate mode**, opened by tapping the Moon. The home background never
  moves under the user's finger, so page scrolling and the orbit's hover keep working.
- **Explore extras in v1:** a time slider with prayer stops, a Qibla marker on the
  horizon, and search.
- **Own WebGL renderer** (no sky library): small, fast, and in Meeqat's look.

## 3. What the user sees

### Home background (all places that use `SkyBackground`: home on desktop, Android and web; the desktop tray)

- The night gradient, the real stars down to magnitude 5.5, faint constellation figures,
  the planets as warm points, the ground dimming and horizon line with faint compass
  letters. No other text.
- The Moon's sky direction is pinned to the centre of the orbit. On phones, where the
  page scrolls, the sky follows the orbit as it scrolls.
- The existing scrim under the prayer list stays, so text stays readable.
- The sky turns once a minute (0.25° per minute), together with the Moon's tilt.

### Explore mode (home only)

- **Open:** tap the Moon (a real button, labelled "Explore the sky", also reachable by
  keyboard). The page UI fades out over ~250 ms and is then hidden; the sky stays where it
  was and glides the Moon to the screen centre.
- **Close:** ×, Esc or Android back. The view glides back to the Moon, the time resets to
  now and the UI fades back in.
- **Move:** drag to look anywhere (with ~0.6 s of glide after a flick); pinch, wheel or
  trackpad, and +/− keys to zoom between a 20° and 180° field of view, zooming toward the
  pointer or pinch centre; arrow keys pan. "Back to the Moon" returns to it.
- **Labels:** English names of the bright stars (brightness cut by zoom: magnitude 1.0
  above a 120° field, 1.6 above 70°, otherwise 2.4), planets, the Sun, the Moon, and
  constellation names by importance (only the main ones when zoomed out, all when zoomed
  in).
- **Tap** a star, planet, the Moon, the Sun or a constellation line: an info card (bottom
  sheet on phones, small card on desktop) with the English and Arabic name, the
  constellation, magnitude, and altitude with compass direction; the Moon also shows how
  much is lit. The tapped star's constellation is highlighted in amber.
- **Time slider** (bottom bar): 00:00–24:00 of the day the orbit shows, with labelled
  stops at each prayer time that the slider snaps to within 8 minutes, and a "Now"
  button. Stars turn, the Moon and planets move.
- **Qibla:** a marker on the horizon at `qiblaBearing()` from `utils/qibla.ts`, labelled
  "Qibla". When it is off screen, an arrow at the screen edge points to it; tapping the
  arrow glides there.
- **Search:** one field at the top over the 177 named stars, the constellations, 5 planets,
  the Moon and the Sun, in English or Arabic. Matching ignores case and accents, Arabic
  tashkeel and tatweel, and treats أ إ آ ٱ as ا, ى as ي and ة as ه. Prefix matches rank
  first, then brighter objects. Choosing a result glides to it and opens its card; if it
  is below the horizon, the card says so.

## 4. Architecture

Pure modules (no Vue, no DOM) under `app/utils/sky/`, a WebGL renderer, and two components.

| Unit | Does | Depends on |
|---|---|---|
| `utils/sky/catalog.ts` | Loads and decodes `/sky/sky-v1.bin` and `/sky/names-v1.json` once per page (one shared promise). | fetch |
| `utils/sky/astro.ts` | `skyAt(date, lat, lng)`: the rotation from J2000 equatorial to the local horizon frame (east, north, up), including precession to the date and sidereal time; the Moon and Sun from `utils/moon/sphere.ts`; the planets. | `sphere.ts` |
| `utils/sky/planets.ts` | Mercury–Saturn from JPL's approximate Keplerian elements (valid 1800–2050), with magnitude from distance and phase angle. | — |
| `utils/sky/view.ts` | View state (centre altitude/azimuth, field of view), the zenith-up camera, stereographic `project`/`unproject`, `pan`, `zoomAt`, and `pick` (nearest body, then star, then constellation segment). | — |
| `utils/sky/search.ts` | Builds the search index and normalises queries (§3). | catalog |
| `utils/sky/describe.ts` | The info card's text for a pick, the constellation to highlight, and where a pick or search result is. | astro, catalog |
| `utils/sky/vec.ts` | Vector and 3×3 matrix helpers shared by the above. | — |
| `utils/sky/shaders.ts`, `utils/sky/renderer.ts` | WebGL 1 renderer: uploads the catalogue once; `draw(frame)` per frame; handles context loss. Returns `null` without WebGL. | catalog |
| `utils/sky/overlay.ts` | The 2D text layer: horizon and compass letters, planets, labels, Sun, Moon, Qibla marker or edge arrow; returns what can be tapped. | astro, catalog, view |
| `components/celestial/RealSky.vue` | The WebGL canvas plus a 2D overlay canvas for text and markers. Owns render-on-demand scheduling, the minute tick and anchoring to the orbit. Interactive only while explore is open. | all of the above |
| `components/sky/Explore.vue` (+ `Search.vue`, `TimeSlider.vue`, `InfoCard.vue`) | Explore controls, teleported above the page: search, time slider, info card, Back to the Moon, close. (The Qibla edge arrow is drawn by the overlay.) | `useSkyExplore` |
| `composables/useSkyExplore.ts` | Shared explore state: open/closed, view, time override, selection. | — |
| `composables/useSkyAnchor.ts` | The orbit registers its Moon element; `RealSky` reads its on-screen centre. | — |

Interfaces (sketch):

```ts
// catalog.ts
interface SkyCatalog {
  starDirs: Float32Array;   // J2000 equatorial unit vectors, 3 per star
  starMag: Float32Array; starBv: Float32Array;
  starCons: Uint8Array;     // constellation index, 255 = none
  lineDirs: Float32Array;   // figure vertices, 3 per vertex
  segments: Uint16Array;    // vertex index pairs
  segFigure: Uint8Array;    // constellation index per segment
  names: { stars: [starIndex: number, en: string, ar: string][];
           constellations: { id: string; en: string; ar: string; label: Vec3; rank: 1 | 2 | 3 }[] };
}
function loadSkyCatalog(): Promise<SkyCatalog>;

// astro.ts
interface SkyState { rot: Mat3; moon: MoonView & { dir: Vec3 }; sun: { dir: Vec3; altDeg: number };
                     planets: { key: string; en: string; ar: string; mag: number; dir: Vec3 }[] }
function skyAt(date: Date, lat: number, lng: number): SkyState;

// view.ts
interface ViewState { alt: number; az: number; fovDeg: number }
function camera(view: ViewState, w: number, h: number, cx: number, cy: number): Camera;
function project(cam: Camera, dir: Vec3, out: Float32Array | number[]): boolean;
function unproject(cam: Camera, x: number, y: number): Vec3;

// renderer.ts
function createSkyRenderer(canvas: HTMLCanvasElement, cat: SkyCatalog): SkyRenderer | null;
interface SkyRenderer { draw(f: { rot: Mat3; cam: Camera; figure: number; dim: number }): void;
                        dispose(): void }
```

Data flow: `usePrayerRuntime` (place, current time) → at the top of each minute
`skyAt()` → `RealSky` requests one frame. Drags, zoom, scrolling (anchor moves), resize,
the time slider and selection also request one frame. Frames are coalesced into one
`requestAnimationFrame`.

Changes to existing code:

- `SkyBackground.vue` renders `RealSky` instead of `StarField` when a place is known and the
  catalogue and WebGL are ready (§7). While explore is open it hides its content layer
  (opacity, then `visibility: hidden` so the list's backdrop blur stops re-compositing) and
  lets the sky take pointer input.
- `Orbit.vue` registers the Moon with `useSkyAnchor` and adds the "Explore the sky" button
  over it (home only, and only when explore is available). The tray's orbit registers its
  anchor but gets no button.
- `MoonSphere.vue`: see §6.
- `index.vue` mounts `SkyExplore` (`components/sky/Explore.vue`).
- Privacy page: credits for the sky data (§5).

## 5. Data

- `scripts/sky/build-catalog.ts` (Bun) downloads d3-celestial's `stars.6.json`,
  `starnames.json`, `constellations.json` and `constellations.lines.json` from a pinned
  commit, verifies their SHA-256, and writes:
  - `public/sky/sky-v1.bin`, little-endian: header (`MQSK`, version, counts), then per star
    an Int16 unit vector ×3, Int8 magnitude ×10, Int8 B−V ×50 and a UInt8 constellation
    index; then the figure vertices (Int16 ×3 each) and segments (UInt16 pair + UInt8
    figure). Stars to magnitude 5.5: 2,851.
  - `public/sky/names-v1.json`: the 177 named stars (brighter than 3.2) and the 89
    constellation entries (the 88 constellations, with Serpens split in two), English and
    Arabic (entry order = figure index).
  - Both are generated once and committed, like `public/moon`. About 35 KB compressed.
    Served as immutable like `/moon/*` (Caddyfile); a format change bumps `v1`.
  - Loaded after first paint, like the Moon map.
- Licences: d3-celestial is BSD-3. Its stars come from the XHIP catalogue (VizieR V/137D,
  free with acknowledgement); constellations from the IAU. Its Arabic star names come from
  Stellarium's sky-culture translations (GPL); names are facts, so crediting the source is
  the plan. The privacy page credits d3-celestial, XHIP/CDS, the IAU and Stellarium.

## 6. The Moon's tilt and timing

- Drop the uncommitted north-up change (the `"south"` orientation in `sphere.ts` and the
  hemisphere rule in `MoonSphere.vue`).
- `MoonSphere.currentView`: with a place, `moonView(now, lat, lng)` (zenith up) at every
  altitude; without a place, north-up as today.
- `MoonSphere` and `RealSky` both redraw at the top of each minute (instead of the Moon's
  10-minute timer), so the Moon's tilt and its stars stay in step. The today-strip chip
  and the tray use the same component and follow.
- Explore draws the Moon from the same style renderer (`utils/moon/styles.ts`) into a
  small offscreen canvas, re-rendered when the minute or the slider time changes
  (throttled to one per frame).

## 7. Rendering

- **WebGL 1**, one context per `RealSky`, device pixel ratio capped at 2.
- **Stars:** one `POINTS` draw. The vertex shader applies `rot` and the camera, projects
  stereographically, sets the point size and brightness from magnitude and the colour
  from B−V, and dims stars below the horizon to ~36 %. Points behind the viewer are
  discarded.
- **Constellation figures:** one draw of camera-facing quads (two triangles per segment)
  for a constant on-screen width (`LINES` is 1 device pixel on most GPUs). The highlighted
  figure is drawn amber in the same pass via a figure uniform.
- **Sky and ground:** one full-screen triangle. The fragment shader unprojects each pixel
  to the horizon frame and returns the night gradient by altitude, the ground dimming
  below 0° and a soft horizon line.
- **Overlay (2D canvas):** labels, compass letters, planets' names, the Sun, the Moon
  sprite and the Qibla marker; only the handful of points that need text are projected on
  the CPU. Redrawn with each frame.
- **Render on demand only** (triggers in §4). The minute tick pauses while the document is
  hidden and catches up on `visibilitychange`.
- **Picking** happens on tap/hover only: project the candidates once and take the nearest
  within 11 CSS px (bodies first, then stars weighted by brightness, then segments within
  7 px).

## 8. Failure handling

| Situation | Background | Explore |
|---|---|---|
| No place chosen | today's `StarField` | not offered |
| WebGL unavailable | plain gradient | not offered |
| Catalogue fails to load | today's `StarField`; retried on the next `visibilitychange` | not offered until loaded |
| WebGL context lost | gradient until restored, then re-upload | closes if open |
| Moon map fails | unchanged: the flat SVG Moon | Moon drawn as the flat disc |

## 9. Performance budget

- 0 frames while idle (verified with a dev-only frame counter).
- Under 2 ms of main-thread time per drag frame in desktop Chromium at 2×.
- No change to first paint: the catalogue and Moon map load after it.
- GPU memory for stars and lines about 170 KB.

## 10. Testing

The repo has no unit-test runner; add `bun test` (built into Bun) with a `test` script.

- `astro`/`planets`: alt/az of a set of bright stars, the Moon, the Sun and the five
  planets for Doha at four instants on 2026-10-20, against fixtures generated with astropy's
  built-in ephemerides (no network), committed under `tests/fixtures/sky/`.
  Tolerances: stars 0.1°, Moon and planets 0.3°.
- `view`: project/unproject round trips; pan and zoom keep the point under the pointer;
  `pick` precedence.
- `search`: English and Arabic normalisation and ranking.
- `describe`: the info card's text, highlighted constellation and look direction.
- `catalog`: the build script's output decodes back to its source within quantisation.
- Visual and performance: one light Playwright run (`tests/e2e/sky.mjs`) in a single
  visible Chromium window so the real GPU draws, at 1× density: the home screen, the idle
  frame count and drag frame time from §9, then explore (open, drag, zoom, search in English
  and Arabic, tap a star, Esc). Headless WebGL is emulated on the CPU and is too heavy for the
  development laptop, so it is never used; the run is started only after asking.
- Real builds, also only after asking (they are heavy): the macOS desktop app (WKWebView) and
  the Android emulator (WebView). Linux (WebKitGTK) is not tested; the fallbacks in §8 cover it.

## 11. Release

A normal app release: no backend changes. The web build still needs the manual Coolify
deploy after the push.
