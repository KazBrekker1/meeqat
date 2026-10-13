package com.meeqat.plugin.prayerservice

import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.View
import android.os.SystemClock
import android.util.TypedValue
import android.view.ViewGroup
import android.widget.Chronometer
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextClock
import android.widget.TextView
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import com.android.ide.common.rendering.api.SessionParams
import org.junit.Rule
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone

/**
 * Snapshots of the home-screen widget as a launcher would draw it: the real widget
 * layout XML inflated at a real cell size, filled the same way PrayerWidgetProvider
 * fills its RemoteViews, with the real MeeqatOrbit bitmap and the real day / next-
 * prayer resolution (PrayerTimeUtils.resolve). RemoteViews itself can't be applied
 * under layoutlib, so [fill] mirrors fullUpdate/applyState/showMessage/populateStrip/
 * setHeaderData — keep it in step with the provider.
 *
 * The countdown (Chronometer) and the header clock (TextClock) are live views: the
 * countdown is frozen at the moment's value, the clock shows the time of the render.
 */
class WidgetPreviewTest {

    @get:Rule
    val paparazzi = Paparazzi(
        deviceConfig = DeviceConfig.PIXEL_6,
        theme = "android:Theme.Material.NoActionBar",
        renderingMode = SessionParams.RenderingMode.SHRINK, // crop to the home-screen patch
        showSystemUi = false,
        useDeviceResolution = true, // real Pixel 6 pixels, not scaled to 1000px
    )

    // Doha, the day in the bug report (8 Rabiʿ al-Thani 1448).
    private val tz = TimeZone.getTimeZone("Asia/Qatar")
    private val day = listOf(
        Triple("Fajr", "Fajr", "04:02"),
        Triple("Sunrise", "Sunrise", "05:21"),
        Triple("Dhuhr", "Dhuhr", "11:28"),
        Triple("Asr", "Asr", "14:55"),
        Triple("Maghrib", "Maghrib", "17:34"),
        Triple("Isha", "Isha", "19:04"),
    )

    private fun at(hhmm: String): Long {
        val (h, m) = hhmm.split(":").map(String::toInt)
        return Calendar.getInstance(tz).apply {
            clear(); set(2026, Calendar.SEPTEMBER, 19, h, m)
        }.timeInMillis
    }

    private fun dayAt(offsetDays: Int, shiftMin: Int = 0) =
        day.map { (name, label, t) -> PrayerTimeData(name, at(t) + offsetDays * DAY + shiftMin * 60_000L, label) }

    private val prayers = dayAt(0)

    /** What an older frontend stores: today only, with today's header dates. */
    private val todayOnly = listOf(PrayerDay(prayers, "8 Rabi' al-Thani 1448 AH", "Sep 19, 2026"))
    /** The look-ahead window: today plus tomorrow (a minute later), each with its dates. */
    private val twoDays = todayOnly + PrayerDay(dayAt(1, shiftMin = 1), "9 Rabi' al-Thani 1448 AH", "Sep 20, 2026")

    /** Moments that exercise every caption the orbit can show. */
    private val moments = listOf(
        "0411" to at("04:11"),         // → Sunrise, short wait
        "1340" to at("13:40"),         // → Asr
        "1752" to at("17:52"),         // → Isha
        "2130" to at("21:30"),         // → Fajr tomorrow, at tomorrow's stored time
        "0900_nextday" to at("09:00") + DAY, // the day after: tomorrow's list + dates
    )

    @Test fun wide() = moments.forEach { (k, t) -> snap("wide_$k", R.layout.widget_prayer_wide, 360, 208, t) }
    @Test fun compact() = snap("compact_1752", R.layout.widget_prayer_compact, 190, 200, at("17:52"))
    @Test fun glance() = snap("glance_1752", R.layout.widget_prayer_glance, 190, 64, at("17:52"))
    @Test fun wide24h() { use24 = true; snap("wide_1752_24h", R.layout.widget_prayer_wide, 360, 208, at("17:52")); use24 = false }
    @Test fun tall4x3() = snap("4x3_1752", R.layout.widget_prayer_4x3, 290, 270, at("17:52"))
    @Test fun dashboard4x4() = snap("4x4_1752", R.layout.widget_prayer_4x4, 360, 380, at("17:52"))
    @Test fun strip4x2() = snap("4x2_1752", R.layout.widget_prayer_4x2, 360, 110, at("17:52"))
    @Test fun strip4x2LastHour() = snap("4x2_1840", R.layout.widget_prayer_4x2, 360, 110, at("18:40"))

    // Only today stored (older frontend / app not opened): the next morning runs on
    // yesterday's times projected a day forward — no Hijri date, native Gregorian.
    @Test fun estimated() {
        snap("wide_0900_estimated", R.layout.widget_prayer_wide, 360, 208, at("09:00") + DAY, todayOnly)
        snap("4x4_0900_estimated", R.layout.widget_prayer_4x4, 360, 380, at("09:00") + DAY, todayOnly)
    }

    // Window exhausted (two days on) and no data at all, on every kind of layout.
    @Test fun stale() = statusLayouts.forEach { (k, l, w, h) -> snap("${k}_stale", l, w, h, at("09:00") + 2 * DAY, todayOnly) }
    @Test fun noData() = statusLayouts.forEach { (k, l, w, h) -> snap("${k}_nodata", l, w, h, at("09:00"), emptyList()) }

    private data class Size(val key: String, val layout: Int, val w: Int, val h: Int)
    private val statusLayouts get() = listOf(
        Size("wide", R.layout.widget_prayer_wide, 360, 208),
        Size("4x4", R.layout.widget_prayer_4x4, 360, 380),
        Size("4x2", R.layout.widget_prayer_4x2, 360, 110),
        Size("compact", R.layout.widget_prayer_compact, 190, 200),
        Size("glance", R.layout.widget_prayer_glance, 190, 64),
    )

    private fun snap(name: String, layout: Int, wDp: Int, hDp: Int, nowMs: Long, days: List<PrayerDay> = twoDays) {
        TimeZone.setDefault(tz)
        val ctx = paparazzi.context
        val dp = ctx.resources.displayMetrics.density

        val widget = paparazzi.inflate<View>(layout)
        fill(widget, layout, nowMs, days)

        // Launcher-ish wallpaper so the widget's rounded corners read as on a phone.
        val home = FrameLayout(ctx).apply {
            background = GradientDrawable(
                GradientDrawable.Orientation.TL_BR,
                intArrayOf(0xFF6F8A73.toInt(), 0xFF4E6653.toInt())
            )
            val pad = (16 * dp).toInt()
            setPadding(pad, pad, pad, pad)
            addView(widget, FrameLayout.LayoutParams((wDp * dp).toInt(), (hDp * dp).toInt()))
            layoutParams = ViewGroup.LayoutParams(
                ((wDp + 32) * dp).toInt(), ((hDp + 32) * dp).toInt()
            )
        }
        paparazzi.snapshot(home, name)
    }

    private fun fill(root: View, layout: Int, nowMs: Long, days: List<PrayerDay>) {
        val schedule = PrayerTimeUtils.resolve(days, null, nowMs)
        val shown = schedule?.day?.prayers ?: emptyList()
        val next = schedule?.next
        val prev = schedule?.prev
        val countdown = root.findViewById<Chronometer>(R.id.countdown) // 4×2 + glance only

        // fullUpdate: the pill is the countdown, or the status message
        val caption: String
        if (schedule == null || next == null) {
            // showMessage
            caption = if (schedule == null) "Open Meeqat" else "Tap to refresh"
            countdown?.apply { stop(); setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f); text = caption }
            root.text(R.id.until_label, "")
            root.findViewById<ProgressBar>(R.id.next_progress)?.progress = 0
            root.findViewById<View>(R.id.since_line)?.visibility = View.INVISIBLE
            for (i in 0 until 6) root.findViewById<View>(ids("strip_col_", i))?.visibility = View.GONE
            root.text(R.id.next_line, "")
        } else {
            caption = "${next.label} in ${minutes(next.prayerTime / 60_000L - nowMs / 60_000L)}"
            // applyState
            root.text(R.id.until_label, "Until ${next.label} · ${clock(next.prayerTime)}")
            root.text(R.id.next_line, "${next.label} · ${clock(next.prayerTime, ampm = true)}")
            countdown?.apply {
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
                isCountDown = true
                base = SystemClock.elapsedRealtime() + (next.prayerTime - nowMs)
            }
            root.findViewById<ProgressBar>(R.id.next_progress)?.progress = if (prev == null) 0 else
                (((nowMs - prev.prayerTime).toDouble() / (next.prayerTime - prev.prayerTime)) * 100).toInt()
            if (prev != null) root.text(R.id.since_line, "${prev.label} · ${minutes((nowMs - prev.prayerTime) / 60_000L)} ago")
            populateStrip(root, layout, shown, schedule.nextIndex)
        }

        // orbit / moon bitmap — the real renderer
        if (layout != R.layout.widget_prayer_glance) {
            val drawOrbit = layout != R.layout.widget_prayer_4x2
            val (imageId, px) = when (layout) {
                R.layout.widget_prayer_4x4 -> R.id.orbit_image to 420
                R.layout.widget_prayer_4x3, R.layout.widget_prayer_wide -> R.id.orbit_image to 300
                R.layout.widget_prayer_compact -> R.id.orbit_image to 260
                else -> R.id.moon_image to 140
            }
            root.findViewById<ImageView>(imageId)?.setImageBitmap(
                MeeqatOrbit.bitmap(px, shown, schedule?.nextIndex ?: -1, nowMs, drawOrbit, caption)
            )
        }

        // setHeaderData: the shown day's own dates; without them the Gregorian date is
        // formatted natively and stands in for the Hijri one
        val headerDay = if (next != null) schedule.day else null
        val greg = headerDay?.gregorianDate ?: nativeDate(nowMs)
        root.text(R.id.hijri_date, headerDay?.hijriDate ?: greg)
        root.text(R.id.gregorian_date, if (headerDay?.hijriDate != null) greg else "")
        root.text(R.id.location_text, "Doha, QA")
        root.findViewById<TextClock>(R.id.now_clock)?.apply {
            timeZone = tz.id
            val pattern = if (use24) "HH:mm" else "h:mm a"
            format12Hour = pattern; format24Hour = pattern
        }
    }

    private fun populateStrip(root: View, layout: Int, shown: List<PrayerTimeData>, hi: Int) {
        val listStyle = layout == R.layout.widget_prayer_wide
        val highlight = if (listStyle) R.drawable.widget_current_row_bg else R.drawable.widget_highlight_bg
        for (i in 0 until 6) {
            val col = root.findViewById<LinearLayout>(ids("strip_col_", i)) ?: continue // compact/glance: no strip
            val label = root.findViewById<TextView>(ids("strip_label_", i))
            val time = root.findViewById<TextView>(ids("strip_time_", i))
            label.text = shown[i].label
            time.text = clock(shown[i].prayerTime)
            when {
                i == hi -> {
                    col.setBackgroundResource(highlight)
                    label.setTextColor(0xFFFDE68A.toInt()); time.setTextColor(0xFFFDE68A.toInt())
                }
                hi in 0..5 && i < hi -> {
                    col.setBackgroundColor(Color.TRANSPARENT)
                    label.setTextColor(0x80FFFFFF.toInt()); time.setTextColor(0x8CFFFFFF.toInt())
                }
                else -> {
                    col.setBackgroundColor(Color.TRANSPARENT)
                    label.setTextColor(0x8CFFFFFF.toInt()); time.setTextColor(0xCCFFFFFF.toInt())
                }
            }
        }
    }

    private fun ids(prefix: String, i: Int) =
        paparazzi.context.resources.getIdentifier("$prefix${i + 1}", "id", paparazzi.context.packageName)

    private fun View.text(id: Int, s: String) { findViewById<TextView>(id)?.text = s }

    private var use24 = false

    private fun clock(ms: Long, ampm: Boolean = false): String {
        val c = Calendar.getInstance(tz).apply { timeInMillis = ms }
        if (use24) return "%02d:%02d".format(c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE))
        val h = c.get(Calendar.HOUR).let { if (it == 0) 12 else it }
        val m = "%02d".format(c.get(Calendar.MINUTE))
        return if (ampm) "$h:$m ${if (c.get(Calendar.AM_PM) == 0) "AM" else "PM"}" else "$h:$m"
    }

    private fun minutes(m: Long) = if (m >= 60) "${m / 60}h ${m % 60}m" else "${m}m"

    private fun nativeDate(ms: Long) =
        java.text.SimpleDateFormat("MMM d, yyyy", java.util.Locale.US).apply { timeZone = tz }.format(java.util.Date(ms))

    private companion object { const val DAY = 86_400_000L }
}
