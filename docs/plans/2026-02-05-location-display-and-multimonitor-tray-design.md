# Location Display & Multi-Monitor Tray Design

**Date**: 2026-02-05
**Status**: Approved

## Overview

Two enhancements to improve the Meeqat user experience:
1. Display the selected city/country in the tray popover and Android widget
2. Open the macOS tray popover on the screen where the mouse cursor is located

## Feature 1: Location Display

### Format

Display location as "City, Code" (e.g., "Riyadh, SA").

### Tray Popover (macOS)

**Location**: Header area, below the Gregorian date.

```
┌─────────────────────────┐
│  16 Rajab 1446 AH       │  ← Hijri date
│  January 15, 2025       │  ← Gregorian date
│  Riyadh, SA             │  ← Location (new)
├─────────────────────────┤
│  Next: Dhuhr in 2:35    │
```

**Implementation**:
- Add `city` and `countryCode` to `meeqat:tray:update` event payload (in `index.vue`)
- Update `tray.vue` to display location below gregorian date
- Style: `text-xs text-zinc-500` (smaller/muted)

### Android Widget

**Location**: Header area, after the Gregorian date.

```
┌─────────────────────────┐
│  16 Rajab 1446 AH       │  ← Hijri date
│  January 15, 2025       │  ← Gregorian date
│  Riyadh, SA             │  ← Location (new)
├─────────────────────────┤
│  Prayer times list...   │
```

**Implementation**:
- Add `city` and `countryCode` to prayer service update payload (in `usePrayerService.ts`)
- Update `PrayerWidgetProvider.kt` to read and display location
- Add new `TextView` in widget XML layout
- Style: Match existing date styling, slightly smaller/muted

## Feature 2: Multi-Monitor Tray Positioning (macOS)

### Current Behavior

Uses `@tauri-apps/plugin-positioner` with `Position.TrayCenter`, which always positions relative to the tray icon on the primary display.

### Proposed Behavior

On macOS, position the popover at the **center** of the monitor where the mouse cursor is located.

### Implementation

In `useTrayPopover.ts`:

```typescript
async function showPopover() {
  const trayWindow = await getTrayWindow()

  if (platform === 'macos') {
    const cursor = await cursorPosition()
    const monitors = await availableMonitors()
    const targetMonitor = monitors.find(m =>
      cursor.x >= m.position.x &&
      cursor.x < m.position.x + m.size.width
    )

    if (targetMonitor) {
      // Center on target monitor (accounting for popover size 280x350)
      const x = targetMonitor.position.x + (targetMonitor.size.width - 280) / 2
      const y = targetMonitor.position.y + (targetMonitor.size.height - 350) / 2
      await trayWindow.setPosition(new LogicalPosition(x, y))
    }
  } else {
    await trayWindow.moveWindow(Position.TrayCenter)
  }

  await trayWindow.show()
}
```

**Fallback**: If monitor detection fails, fall back to `Position.TrayCenter`.

## Files to Modify

| File | Change |
|------|--------|
| `app/pages/index.vue` | Add `city`, `countryCode` to tray update event payload |
| `app/pages/tray.vue` | Display location line in header |
| `app/composables/useTrayPopover.ts` | Multi-monitor centering logic for macOS |
| `app/composables/usePrayerService.ts` | Add `city`, `countryCode` to widget update payload |
| `src-tauri/.../PrayerWidgetProvider.kt` | Read and display location |
| Widget XML layout | Add TextView for location |

## Dependencies

No new dependencies required. Uses existing Tauri APIs:
- `cursorPosition()` from `@tauri-apps/api/window`
- `availableMonitors()` from `@tauri-apps/api/window`
- `setPosition()` on WebviewWindow
