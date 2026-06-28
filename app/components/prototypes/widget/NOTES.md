# Widget Lab — prototype notes

**Question:** What should the home-screen widgets look like in the new celestial theme,
and which treatment ports cleanly to Android RemoteViews (and iOS SwiftUI)?

**Route:** `/widget-lab?variant=A|B|C` (dev-only switcher; ← / → to cycle).

**Variants** (each rendered across the real widget sizes: 4×2 minimal, wide, compact, 4×4 full):

- **A — Aurora glass:** sky gradient + translucent "glass" rows, amber next-prayer
  highlight, crescent moon in the header. Closest to the in-app look.
  Port: `<gradient>` + `#AARRGGBB` solid drawables + an ImageView moon. No blur used.
- **B — Slate flat:** solid navy, next prayer as a filled indigo banner (hero), rows are
  flat lines with a left accent bar on the active one. Flattest / most literal RemoteViews map.
- **C — Orbit hero:** the orbit+moon mark and countdown ARE the widget; prayer rows are a
  compressed strip. Different hierarchy. Port: orbit is a vector-drawable ImageView.

**Portability:** all three avoid stars/blur so they map to RemoteViews drawables. The
gradient backgrounds become `widget_background.xml` `<gradient>`; the highlight becomes
`widget_highlight_bg.xml`; rows become `widget_prayer_row_bg.xml`. The same palette drives
the iOS `MeeqatWidget.swift`.

**VERDICT (round 1): A — Aurora glass** (closest to the in-app list look).

---

## Round 2 — orbit/moon propositions (awaiting choice)

Feedback on the shipped widget: (1) it lacks the app's core orbit/moon element,
(2) the dense 4×3/4×4 list clips/overlaps (weighted rows squeezed below text height).
`/widget-lab?variant=A|B|C` now previews three directions (real `OrbitBumps` +
`MoonPhase` + `MeeqatMark`, at all sizes):

- **A — Live orbit hero** (`OrbitHeroWidget`): the app orbit (gradient ring · prayer
  dots · now-marker · moon) is the centerpiece on medium/large; moon accent on 4×2.
- **B — Static mark + list** (`OrbitListWidget`): full daily list rebuilt with FIXED
  row heights (kills the clipping) + a static Meeqat mark in the header. No live orbit.
- **C — Orbit hero, no list** (`OrbitOnlyWidget`): orbit dominates every size; only
  next prayer + countdown + progress. Cleanest, least fragile.

**Native reality:** A and C need the orbit drawn as a **Kotlin Canvas bitmap**
(`setImageViewBitmap`) — RemoteViews can't render it live; redraw is cached/throttled,
not per-tick. B maps 1:1 to existing drawables (vector ImageView + fixed-dp rows).

**Interactivity note (why the hybrid exists):** home-screen widgets have NO hover
(touch-only) and the orbit is a frozen bitmap, so the lab's hover-bump/tooltip can't
happen on-device. A widget tap can only open the app or fire a full re-render — no
cheap per-dot peek. So per-prayer times must be *always-visible*, not interaction-gated.

**VERDICT (FINAL): H — orbit hero + slim times strip** (`OrbitHeroHybridWidget`
+ `TimesStrip`). User chose A (live orbit hero); the hybrid keeps that hero and adds
an always-visible daily times strip (next highlighted) so every prayer is glanceable
without hover/tap. 4×2 keeps the moon accent. **A/B/C and the old AuroraWidget were
discarded** — `/widget-lab` now renders only H (no switcher). Times strip uses
normal-case `text-[9px]` `whitespace-nowrap` labels so no prayer name truncates at
any size (the earlier uppercase+tracking overflowed narrow columns into ellipses).

**Android port — DONE & verified on emulator (2026-06-28):**
- `MeeqatOrbit.kt` — Canvas→Bitmap renderer (sweep-gradient sky ring keyed to
  sunrise/sunset + prayer dots + now-marker + elliptical-terminator moon, synodic phase),
  cached per (size,kind) and only re-rendered when the minute/next-prayer/phase changes.
- `widget_prayer_*` rebuilt to orbit/moon ImageView hero + `until_label` + `countdown`
  + progress + `since_line` + included `widget_times_strip.xml` (6 weighted columns,
  next highlighted). 4×2 = moon accent.
- `PrayerWidgetProvider`: per-second tick = `partiallyUpdateAppWidget` (countdown/
  progress/since/clock); full update (ships bitmap + strip over IPC) only once per minute
  or on data change (`forceFull`). Avoids per-second 0.5 MB bitmap IPC.
- Verified on emulator: 4×4 renders correctly — orbit orientation right, near-full moon,
  times strip full (no clipping), live countdown + clock.
- Notification icon: app-module `ic_notification.xml` swapped to the orbit mark.

**TODO:** iOS `MeeqatWidget.swift` — SwiftUI `Canvas` orbit + times strip (parity).
Confirm the smaller native sizes (compact/4×2/wide) on a real home screen.

**Ported (theme re-skin, 2026-06):**
- Android drawables → `widget_background.xml` (navy gradient), `widget_highlight_bg.xml`
  (amber tint + ring), `widget_prayer_row_bg.xml` (white/6% glass).
- `PrayerWidgetProvider` highlighted-row text → amber `#FDE68A`.
- Layout root padding 12dp→16dp (wide 8→14) + row `marginTop` 2→3dp (the "too tight" fix).
- iOS `MeeqatWidget.swift` `WidgetColors` → navy gradient bg, amber highlight, white countdown,
  glass hero card.

The prototype is now a single faithful mirror of the shipped widget (B/C variants deleted):
linear navy gradient, amber highlight, glass vertical rows, generous padding, **crescent moon**.

Information-rich per common prayer-widget conventions (Muslim Pro / Athan / IslamicFinder):
next prayer + countdown + actual time, **progress bar to next prayer** (indigo→amber),
full daily list (Fajr·Sunrise·Dhuhr·Asr·Maghrib·Isha — next highlighted, past dimmed),
**live clock**, Hijri + Gregorian date, location, "since last".
**Native port status (needs an on-device build to confirm visually):**
- **iOS** (`MeeqatWidget.swift`): progress bar (`PrayerProgressBar`), live current time, phase
  **moon** (SF Symbols `moonphase.*`, iOS 16+ with `moon.fill` fallback), white countdown,
  Aurora gradient — all three families done.
- **Android**: progress bar shipped — new `widget_progress.xml` (indigo→amber) + `next_progress`
  `ProgressBar` in compact/4×3/4×4/wide layouts + provider computes the fraction
  (`setProgressBar`). Countdown text → white. Still TODO: **live clock** (`TextClock`) and the
  **moon** (needs a pre-rendered bitmap via `setImageViewBitmap`); 4×2 minimal stays countdown-only.

**Still needs an on-device build / native follow-up:**
- Visual verification on a real Android home screen + iOS widget gallery.
- **Moon on native:** prototype shows the live `MoonPhase`. iOS SwiftUI can draw it directly;
  **Android RemoteViews cannot** draw a live phase — needs a pre-rendered bitmap
  (`setImageViewBitmap`) or a set of ~8 phase drawables chosen by phase. Not yet ported.
- Android layouts were re-skinned (theme), not restructured to A's exact arrangement.
- iOS widget isn't wired end-to-end (prior review: plugin registration, project.yml target,
  app-group entitlement) — theming is independent of that.

Delete this prototype (`app/components/prototypes/widget/`, `app/pages/widget-lab.vue`) once the
on-device look is confirmed.
