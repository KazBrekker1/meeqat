# Location Display & Multi-Monitor Tray Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Display selected city/country in tray popover and Android widget, and center tray popover on the monitor where the mouse cursor is located.

**Architecture:** Two independent features: (1) Pass location data through existing event/service channels and display in UI, (2) Replace `Position.TrayCenter` with custom multi-monitor positioning on macOS.

**Tech Stack:** Vue 3, TypeScript, Kotlin, Tauri APIs (`cursorPosition`, `availableMonitors`, `setPosition`)

---

## Task 1: Add Location to Tray Event Payload

**Files:**
- Modify: `app/pages/index.vue:516-529`

**Step 1: Add city and countryCode to the tray update event**

In the watcher that emits `meeqat:tray:update`, add the location fields:

```typescript
await emit("meeqat:tray:update", {
  dateLine,
  title,
  nextLine,
  sinceLine,
  // Additional fields for the tray popover
  hijriDate: hijriDateVerbose.value,
  gregorianDate: gregorianDateVerbose.value,
  nextPrayerLabel: nextPrayerLabel.value,
  countdown: countdownToNext.value,
  sincePrayerLabel: prevInfo?.label ?? "",
  sinceTime: prevInfo?.timeSince ?? "",
  timingsList: list,
  // NEW: Location fields
  city: selectedCity.value,
  countryCode: selectedCountry.value,
});
```

**Step 2: Commit**

```bash
git add app/pages/index.vue
git commit -m "feat(tray): add city and countryCode to tray update event"
```

---

## Task 2: Display Location in Tray Popover

**Files:**
- Modify: `app/pages/tray.vue:72-91` (TrayUpdatePayload interface)
- Modify: `app/pages/tray.vue:93-105` (refs)
- Modify: `app/pages/tray.vue:16-19` (template header)
- Modify: `app/pages/tray.vue:121-144` (event handler)

**Step 1: Update TrayUpdatePayload interface**

Add city and countryCode to the interface:

```typescript
interface TrayUpdatePayload {
  dateLine?: string;
  title?: string | null;
  nextLine?: string;
  sinceLine?: string;
  timingsList?: Array<{
    key: string;
    label: string;
    time: string;
    minutes?: number;
    isNext?: boolean;
    isPast?: boolean;
  }>;
  hijriDate?: string;
  gregorianDate?: string;
  nextPrayerLabel?: string;
  countdown?: string;
  sincePrayerLabel?: string;
  sinceTime?: string;
  // NEW
  city?: string;
  countryCode?: string;
}
```

**Step 2: Add location refs**

After the existing refs (around line 98):

```typescript
const city = ref<string>("");
const countryCode = ref<string>("");
```

**Step 3: Update template header**

Replace the header section (lines 16-19) with:

```vue
<!-- Header with dates (draggable) -->
<div class="text-center pb-2 border-b border-white/10 cursor-move select-none" @mousedown="startDrag">
  <div v-if="hijriDate" class="text-xs text-white/90 font-medium">{{ hijriDate }}</div>
  <div v-if="gregorianDate" class="text-xs text-white/70">{{ gregorianDate }}</div>
  <div v-if="city && countryCode" class="text-xs text-zinc-500 mt-0.5">{{ city }}, {{ countryCode }}</div>
</div>
```

**Step 4: Update event handler**

In the `listen` callback, add handling for the new fields:

```typescript
if (payload.city) {
  city.value = payload.city;
}
if (payload.countryCode) {
  countryCode.value = payload.countryCode;
}
```

**Step 5: Commit**

```bash
git add app/pages/tray.vue
git commit -m "feat(tray): display city and country code in popover header"
```

---

## Task 3: Add Location to Android Widget Service Payload

**Files:**
- Modify: `app/composables/usePrayerService.ts:4-8` (interface)
- Modify: `app/composables/usePrayerService.ts:102-106` (composable options)
- Modify: `app/composables/usePrayerService.ts:148-158` (api call)

**Step 1: Update UpdatePrayerTimesOptions interface**

Add city and countryCode:

```typescript
interface UpdatePrayerTimesOptions {
  prayers: PrayerTimeData[];
  nextPrayerIndex: number;
  hijriDate?: string;
  gregorianDate?: string;
  nextDayPrayerName?: string;
  nextDayPrayerTime?: number;
  nextDayPrayerLabel?: string;
  // NEW
  city?: string;
  countryCode?: string;
}
```

**Step 2: Update composable options interface**

Add city and countryCode refs:

```typescript
export function usePrayerService(options: {
  timingsList: Ref<PrayerTimingItem[]>;
  hijriDate?: Ref<string | null>;
  gregorianDate?: Ref<string | null>;
  // NEW
  city?: Ref<string | null>;
  countryCode?: Ref<string | null>;
}) {
  const { timingsList, hijriDate, gregorianDate, city, countryCode } = options;
```

**Step 3: Update api call**

In the `update` function, include city and countryCode:

```typescript
await api.updatePrayerTimes({
  prayers,
  nextPrayerIndex,
  hijriDate: hijriDate?.value ?? undefined,
  gregorianDate: gregorianDate?.value ?? undefined,
  city: city?.value ?? undefined,
  countryCode: countryCode?.value ?? undefined,
  ...(nextDay && {
    nextDayPrayerName: nextDay.prayerName,
    nextDayPrayerTime: nextDay.prayerTime,
    nextDayPrayerLabel: nextDay.label,
  }),
});
```

**Step 4: Commit**

```bash
git add app/composables/usePrayerService.ts
git commit -m "feat(android): add city and countryCode to widget service payload"
```

---

## Task 4: Pass Location to usePrayerService in index.vue

**Files:**
- Modify: `app/pages/index.vue:324-329`

**Step 1: Update usePrayerService call**

Change the composable call to include city and countryCode:

```typescript
// Update Android home screen widgets
const { isAndroid } = usePrayerService({
  timingsList,
  hijriDate: hijriDateVerbose,
  gregorianDate: gregorianDateVerbose,
  city: selectedCity,
  countryCode: selectedCountry,
});
```

**Step 2: Commit**

```bash
git add app/pages/index.vue
git commit -m "feat(android): pass city and countryCode to prayer service"
```

---

## Task 5: Update Android Kotlin Plugin to Handle Location

**Files:**
- Modify: `src-tauri/tauri-plugin-prayer-service/android/src/main/java/com/meeqat/plugin/prayerservice/PrayerWidgetProvider.kt:28-36`
- Modify: `src-tauri/tauri-plugin-prayer-service/android/src/main/java/com/meeqat/plugin/prayerservice/PrayerWidgetProvider.kt:287-307`

**Step 1: Add SharedPreferences keys**

Add constants for city and countryCode (after line 36):

```kotlin
const val KEY_CITY = "city"
const val KEY_COUNTRY_CODE = "country_code"
```

**Step 2: Update setCalendarDates to include location**

Rename function to `setHeaderData` and add location handling:

```kotlin
private fun setHeaderData(views: RemoteViews, prefs: android.content.SharedPreferences) {
    // Read dates from SharedPreferences (passed from frontend which calculates correctly)
    val hijriDate = prefs.getString(KEY_HIJRI_DATE, null)
    val gregorianDate = prefs.getString(KEY_GREGORIAN_DATE, null)
    val city = prefs.getString(KEY_CITY, null)
    val countryCode = prefs.getString(KEY_COUNTRY_CODE, null)

    // Set Gregorian date - use saved value or fall back to local formatting
    if (gregorianDate != null) {
        views.setTextViewText(R.id.gregorian_date, gregorianDate)
    } else {
        reusableDate.time = System.currentTimeMillis()
        views.setTextViewText(R.id.gregorian_date, gregorianFormat.format(reusableDate))
    }

    // Set Hijri date - use saved value from frontend (calculated using proper Islamic calendar)
    if (hijriDate != null) {
        views.setTextViewText(R.id.hijri_date, hijriDate)
    } else {
        // Fallback: show empty or placeholder until data arrives from frontend
        views.setTextViewText(R.id.hijri_date, "")
    }

    // Set location if available
    if (city != null && countryCode != null) {
        try {
            views.setTextViewText(R.id.location_text, "$city, $countryCode")
            views.setViewVisibility(R.id.location_text, View.VISIBLE)
        } catch (e: Exception) {
            Log.d(TAG, "location_text view not in layout")
        }
    } else {
        try {
            views.setViewVisibility(R.id.location_text, View.GONE)
        } catch (e: Exception) {
            Log.d(TAG, "location_text view not in layout")
        }
    }
}
```

**Step 3: Update call site**

Change `setCalendarDates(views, prefs)` to `setHeaderData(views, prefs)` at line 172.

**Step 4: Commit**

```bash
git add src-tauri/tauri-plugin-prayer-service/android/src/main/java/com/meeqat/plugin/prayerservice/PrayerWidgetProvider.kt
git commit -m "feat(android): read and display location in widget"
```

---

## Task 6: Update PrayerServicePlugin to Save Location

**Files:**
- Find and modify: `PrayerServicePlugin.kt` (the file that saves to SharedPreferences)

**Step 1: Find the plugin file**

```bash
find src-tauri -name "PrayerServicePlugin.kt" -o -name "*Plugin*.kt" | head -5
```

**Step 2: Add city and countryCode to SharedPreferences save**

In the function that handles `update_prayer_times`, add:

```kotlin
city?.let { editor.putString(PrayerWidgetProvider.KEY_CITY, it) }
countryCode?.let { editor.putString(PrayerWidgetProvider.KEY_COUNTRY_CODE, it) }
```

**Step 3: Commit**

```bash
git add src-tauri/tauri-plugin-prayer-service/android/src/main/java/com/meeqat/plugin/prayerservice/
git commit -m "feat(android): save city and countryCode to SharedPreferences"
```

---

## Task 7: Add Location TextView to Widget XML Layouts

**Files:**
- Modify: `src-tauri/tauri-plugin-prayer-service/android/src/main/res/layout/widget_prayer_4x3.xml`
- Modify: `src-tauri/tauri-plugin-prayer-service/android/src/main/res/layout/widget_prayer_4x4.xml`
- Modify: `src-tauri/tauri-plugin-prayer-service/android/src/main/res/layout/widget_prayer_compact.xml`
- Modify: `src-tauri/tauri-plugin-prayer-service/android/src/main/res/layout/widget_prayer_wide.xml`
- Modify: `src-tauri/tauri-plugin-prayer-service/android/src/main/res/layout/widget_prayer_4x2.xml`

**Step 1: Add location TextView to 4x3 layout**

After the gregorian_date TextView (around line 33), add:

```xml
<TextView
    android:id="@+id/location_text"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:text="Riyadh, SA"
    android:textColor="#80FFFFFF"
    android:textSize="11sp"
    android:gravity="center"
    android:visibility="gone"
    android:layout_marginTop="2dp" />
```

Note: The header in 4x3 is horizontal, so we need to wrap it in a vertical layout. Restructure the header:

```xml
<!-- Header with dates -->
<LinearLayout
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:orientation="vertical">

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="horizontal"
        android:gravity="center_vertical">

        <TextView
            android:id="@+id/hijri_date"
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:text="15 Rajab 1446"
            android:textColor="#FFFFFF"
            android:textSize="14sp"
            android:textStyle="bold" />

        <TextView
            android:id="@+id/gregorian_date"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="Wed, Jan 22"
            android:textColor="#80FFFFFF"
            android:textSize="12sp" />
    </LinearLayout>

    <TextView
        android:id="@+id/location_text"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="Riyadh, SA"
        android:textColor="#80FFFFFF"
        android:textSize="11sp"
        android:visibility="gone" />
</LinearLayout>
```

**Step 2: Apply similar changes to other layouts**

Each layout may have slightly different header structure. Add location_text appropriately.

**Step 3: Commit**

```bash
git add src-tauri/tauri-plugin-prayer-service/android/src/main/res/layout/
git commit -m "feat(android): add location TextView to all widget layouts"
```

---

## Task 8: Implement Multi-Monitor Tray Positioning

**Files:**
- Modify: `app/composables/useTrayPopover.ts:1-4` (imports)
- Modify: `app/composables/useTrayPopover.ts:16-54` (showPopover function)

**Step 1: Add required imports**

```typescript
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { cursorPosition, availableMonitors, LogicalPosition } from "@tauri-apps/api/window";
import { platform } from "@tauri-apps/plugin-os";
```

**Step 2: Update showPopover for multi-monitor support**

Replace the showPopover function:

```typescript
export async function showPopover(): Promise<void> {
  console.log("[TrayPopover] showPopover called");
  const trayWindow = await getTrayWindow();
  if (!trayWindow) {
    console.warn("[TrayPopover] Tray window not found");
    return;
  }

  try {
    // Get current platform
    let currentPlatform = "unknown";
    try {
      currentPlatform = await platform();
    } catch {
      console.log("[TrayPopover] Could not detect platform");
    }

    // On macOS, center on the monitor where the cursor is
    if (currentPlatform === "macos") {
      try {
        const cursor = await cursorPosition();
        const monitors = await availableMonitors();

        // Find the monitor containing the cursor
        const targetMonitor = monitors.find(m =>
          cursor.x >= m.position.x &&
          cursor.x < m.position.x + m.size.width &&
          cursor.y >= m.position.y &&
          cursor.y < m.position.y + m.size.height
        );

        if (targetMonitor) {
          // Center on target monitor (popover size is 280x350 from tauri.conf.json)
          const popoverWidth = 280;
          const popoverHeight = 350;
          const x = targetMonitor.position.x + (targetMonitor.size.width - popoverWidth) / 2;
          const y = targetMonitor.position.y + (targetMonitor.size.height - popoverHeight) / 2;

          console.log(`[TrayPopover] Centering on monitor at (${x}, ${y})`);
          await trayWindow.setPosition(new LogicalPosition(x, y));
        } else {
          // Fallback: emit show event for default positioning
          console.log("[TrayPopover] No target monitor found, using default positioning");
          await emit("meeqat:tray:show");
        }
      } catch (e) {
        console.error("[TrayPopover] Multi-monitor positioning failed, using fallback:", e);
        await emit("meeqat:tray:show");
      }
    } else {
      // Non-macOS: use default tray positioning
      await emit("meeqat:tray:show");
    }

    // Show the window
    console.log("[TrayPopover] Showing window...");
    await trayWindow.show();
    console.log("[TrayPopover] Window shown");

    // Focus the window
    console.log("[TrayPopover] Setting focus...");
    await trayWindow.setFocus();

    // Setup focus listener to auto-hide when clicking outside
    if (focusUnlisten) {
      focusUnlisten();
      focusUnlisten = null;
    }

    focusUnlisten = await trayWindow.onFocusChanged(({ payload: focused }) => {
      console.log("[TrayPopover] Focus changed:", focused);
      if (!focused) {
        hidePopover();
      }
    });
    console.log("[TrayPopover] showPopover completed");
  } catch (e) {
    console.error("[TrayPopover] Failed to show popover:", e);
  }
}
```

**Step 3: Commit**

```bash
git add app/composables/useTrayPopover.ts
git commit -m "feat(macos): center tray popover on monitor with cursor"
```

---

## Task 9: Test and Verify

**Step 1: Build and test macOS tray**

```bash
bun tauri dev
```

- Click tray icon on different monitors
- Verify popover appears centered on the correct monitor
- Verify location displays in popover header

**Step 2: Build and test Android widget**

```bash
bun tauri android dev
```

- Add widget to home screen
- Verify location displays below dates

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: add location display to tray/widget and multi-monitor tray positioning

- Display city, country code in macOS tray popover header
- Display city, country code in Android widget header
- Center tray popover on monitor where cursor is located (macOS)"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Add location to tray event | index.vue |
| 2 | Display location in tray | tray.vue |
| 3 | Add location to service interface | usePrayerService.ts |
| 4 | Pass location to service | index.vue |
| 5 | Kotlin: read location | PrayerWidgetProvider.kt |
| 6 | Kotlin: save location | PrayerServicePlugin.kt |
| 7 | XML: add location TextView | widget_*.xml |
| 8 | Multi-monitor positioning | useTrayPopover.ts |
| 9 | Test and verify | - |
