package com.meeqat.plugin.prayerservice

import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
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
 * fills its RemoteViews, with the real MeeqatOrbit bitmap. RemoteViews itself can't
 * be applied under layoutlib, so [fill] mirrors applyState/populateStrip/setHeaderData
 * — keep it in step with the provider.
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

    private val prayers = day.map { (name, label, t) -> PrayerTimeData(name, at(t), label) }

    /** Moments that exercise every caption the orbit can show. */
    private val moments = listOf(
        "0411" to at("04:11"),         // → Sunrise, short wait
        "1340" to at("13:40"),         // → Asr
        "1752" to at("17:52"),         // → Isha
        "2130" to at("21:30"),         // → Fajr tomorrow; every stored time has passed
        // The reported screenshot: next morning, the app hasn't refreshed the list yet.
        "0900_stale" to at("09:00") + DAY,
    )

    @Test fun wide() = moments.forEach { (k, t) -> snap("wide_$k", R.layout.widget_prayer_wide, 360, 208, t) }
    @Test fun compact() = snap("compact_1752", R.layout.widget_prayer_compact, 190, 200, at("17:52"))
    @Test fun tall4x3() = snap("4x3_1752", R.layout.widget_prayer_4x3, 290, 270, at("17:52"))
    @Test fun dashboard4x4() = snap("4x4_1752", R.layout.widget_prayer_4x4, 360, 380, at("17:52"))
    @Test fun strip4x2() = snap("4x2_1752", R.layout.widget_prayer_4x2, 360, 110, at("17:52"))

    private fun snap(name: String, layout: Int, wDp: Int, hDp: Int, nowMs: Long) {
        TimeZone.setDefault(tz)
        val ctx = paparazzi.context
        val dp = ctx.resources.displayMetrics.density

        val widget = paparazzi.inflate<View>(layout)
        fill(widget, layout, nowMs)

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

    private fun fill(root: View, layout: Int, nowMs: Long) {
        // PrayerTimeUtils.findNextPrayerIndex: first upcoming, else lastIndex once all passed
        val nextIndex = prayers.indexOfFirst { it.prayerTime > nowMs }.let { if (it < 0) prayers.lastIndex else it }
        val allPassed = prayers.all { it.prayerTime <= nowMs }
        // after Isha the provider switches to loadNextDayPrayer() — tomorrow's Fajr
        val next = if (allPassed) prayers[0].copy(prayerTime = prayers[0].prayerTime + DAY) else prayers[nextIndex]
        val clockNext = if (allPassed) MeeqatOrbit.nextByClock(prayers, nowMs) else nextIndex
        val prev = prayers.lastOrNull { it.prayerTime <= nowMs }
            ?: prayers.last().copy(prayerTime = prayers.last().prayerTime - DAY)

        // orbit / moon bitmap — the real renderer
        val drawOrbit = layout != R.layout.widget_prayer_4x2
        val (imageId, px) = when (layout) {
            R.layout.widget_prayer_4x4 -> R.id.orbit_image to 360
            R.layout.widget_prayer_4x3, R.layout.widget_prayer_wide -> R.id.orbit_image to 300
            R.layout.widget_prayer_compact -> R.id.orbit_image to 260
            else -> R.id.moon_image to 140
        }
        root.findViewById<ImageView>(imageId)
            ?.setImageBitmap(MeeqatOrbit.bitmap(px, prayers, clockNext, nowMs, drawOrbit))

        // header
        root.text(R.id.location_text, "Doha, QA")
        root.text(R.id.hijri_date, "8 Rabi' al-Thani 1448 AH")
        root.text(R.id.gregorian_date, "Sep 19, 2026")
        root.text(R.id.now_clock, clock(nowMs, ampm = true))

        // applyState
        root.text(R.id.until_label, "Until ${next.label} · ${clock(next.prayerTime)}")
        root.text(R.id.countdown, duration(next.prayerTime - nowMs))
        root.findViewById<ProgressBar>(R.id.next_progress)?.progress =
            (((nowMs - prev.prayerTime).toDouble() / (next.prayerTime - prev.prayerTime)) * 100).toInt()
        root.text(R.id.since_line, "${prev.label} · ${elapsed(nowMs - prev.prayerTime)}")

        // populateStrip
        val listStyle = layout == R.layout.widget_prayer_wide || layout == R.layout.widget_prayer_4x4
        val highlight = if (listStyle) R.drawable.widget_current_row_bg else R.drawable.widget_highlight_bg
        val hi = clockNext
        for (i in 0 until 6) {
            val col = root.findViewById<LinearLayout>(ids("strip_col_", i)) ?: continue
            val label = root.findViewById<TextView>(ids("strip_label_", i))
            val time = root.findViewById<TextView>(ids("strip_time_", i))
            label.text = prayers[i].label
            time.text = clock(prayers[i].prayerTime)
            when {
                i == hi -> {
                    col.setBackgroundResource(highlight)
                    label.setTextColor(0xFFFDE68A.toInt()); time.setTextColor(0xFFFDE68A.toInt())
                }
                hi in 0..5 && i < hi -> {
                    col.setBackgroundColor(Color.TRANSPARENT)
                    label.setTextColor(0x59FFFFFF); time.setTextColor(0x66FFFFFF)
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

    private fun clock(ms: Long, ampm: Boolean = false): String {
        val c = Calendar.getInstance(tz).apply { timeInMillis = ms }
        val h = c.get(Calendar.HOUR).let { if (it == 0) 12 else it }
        val m = "%02d".format(c.get(Calendar.MINUTE))
        return if (ampm) "$h:$m ${if (c.get(Calendar.AM_PM) == 0) "AM" else "PM"}" else "$h:$m"
    }

    private fun duration(ms: Long): String {
        val h = ms / 3_600_000; val m = ms % 3_600_000 / 60_000
        return if (h > 0) "${h}h ${m}m 0s" else "${m}m 0s"
    }

    private fun elapsed(ms: Long): String {
        val h = ms / 3_600_000; val m = ms % 3_600_000 / 60_000
        return if (h > 0) "${h}h ${m}m ago" else "${m}m ago"
    }

    private companion object { const val DAY = 86_400_000L }
}
