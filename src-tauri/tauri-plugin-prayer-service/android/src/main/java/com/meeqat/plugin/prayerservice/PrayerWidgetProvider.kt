package com.meeqat.plugin.prayerservice

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.RemoteViews
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * AppWidgetProvider that displays prayer times on the home screen as the "orbit"
 * design: a Canvas-rendered orbit/moon bitmap (see [MeeqatOrbit]) plus a live
 * countdown, progress bar, an always-visible daily times strip, and a "since" line.
 *
 * Update strategy: the orbit bitmap only changes once a minute, so the per-second
 * service tick does a cheap partiallyUpdateAppWidget (countdown/progress/since/clock)
 * and the full update (which ships the bitmap + strip over IPC) runs once per minute
 * or whenever the data changes.
 */
class PrayerWidgetProvider : AppWidgetProvider() {

    companion object {
        private const val TAG = "PrayerWidgetProvider"
        const val ACTION_WIDGET_UPDATE = "com.meeqat.plugin.prayerservice.WIDGET_UPDATE"

        // SharedPreferences keys (shared with PrayerServicePlugin)
        const val PREFS_NAME = "prayer_service_prefs"
        const val KEY_PRAYERS_JSON = "prayers_json"
        const val KEY_NEXT_PRAYER_INDEX = "next_prayer_index"
        const val KEY_HIJRI_DATE = "hijri_date"
        const val KEY_GREGORIAN_DATE = "gregorian_date"
        const val KEY_NEXT_DAY_PRAYER_NAME = "next_day_prayer_name"
        const val KEY_NEXT_DAY_PRAYER_TIME = "next_day_prayer_time"
        const val KEY_NEXT_DAY_PRAYER_LABEL = "next_day_prayer_label"
        const val KEY_CITY = "city"
        const val KEY_COUNTRY_CODE = "country_code"

        private val timeFormat = ThreadLocal.withInitial { SimpleDateFormat("h:mm a", Locale.getDefault()) }
        private val timeFormatShort = ThreadLocal.withInitial { SimpleDateFormat("h:mm", Locale.getDefault()) }
        private val gregorianFormat = ThreadLocal.withInitial { SimpleDateFormat("MMM d, yyyy", Locale.getDefault()) }

        private const val DATA_STALENESS_THRESHOLD_MS = 25 * 60 * 60 * 1000L
        private const val MS_PER_DAY = 24 * 60 * 60 * 1000L
        private const val PRAYER_ISHA = "Isha"

        @Volatile private var cachedLaunchPendingIntent: PendingIntent? = null
        // Minute at which we last shipped a full update (bitmap + strip). The per-second
        // tick only does partial updates between minute boundaries.
        @Volatile private var lastFullMinute = -1L

        private val stripLabelIds = intArrayOf(
            R.id.strip_label_1, R.id.strip_label_2, R.id.strip_label_3,
            R.id.strip_label_4, R.id.strip_label_5, R.id.strip_label_6
        )
        private val stripTimeIds = intArrayOf(
            R.id.strip_time_1, R.id.strip_time_2, R.id.strip_time_3,
            R.id.strip_time_4, R.id.strip_time_5, R.id.strip_time_6
        )
        private val stripColIds = intArrayOf(
            R.id.strip_col_1, R.id.strip_col_2, R.id.strip_col_3,
            R.id.strip_col_4, R.id.strip_col_5, R.id.strip_col_6
        )

        private fun layoutFor(minWidth: Int, minHeight: Int): Int {
            // Any landscape widget with room for the orbit beside the timers uses the
            // side-by-side "wide" layout (orbit left, countdown/progress right, strip below).
            val landscape = minWidth >= 320 && minHeight >= 120 && minWidth > minHeight * 1.2
            return when {
                landscape -> R.layout.widget_prayer_wide
                minHeight >= 250 -> R.layout.widget_prayer_4x4
                minHeight >= 160 -> R.layout.widget_prayer_4x3
                minHeight >= 110 -> R.layout.widget_prayer_compact
                minHeight >= 72 -> R.layout.widget_prayer_4x2
                // One-row "glance": just the next prayer + live countdown.
                else -> R.layout.widget_prayer_glance
            }
        }

        private fun isGlance(layoutId: Int) = layoutId == R.layout.widget_prayer_glance

        /** Orbit/moon image: (viewId, drawOrbit, renderPx). 4×2 is moon-only. */
        private fun bitmapSpec(layoutId: Int): Triple<Int, Boolean, Int> = when (layoutId) {
            R.layout.widget_prayer_4x4 -> Triple(R.id.orbit_image, true, 360)
            R.layout.widget_prayer_4x3 -> Triple(R.id.orbit_image, true, 300)
            R.layout.widget_prayer_compact -> Triple(R.id.orbit_image, true, 260)
            R.layout.widget_prayer_wide -> Triple(R.id.orbit_image, true, 300)
            else -> Triple(R.id.moon_image, false, 140)
        }

        // ---- entry points -------------------------------------------------------

        /**
         * Called per-second by CountdownService. Does a full update (bitmap) at most
         * once per minute and a cheap partial update for the live countdown otherwise.
         */
        fun updateAllWidgets(context: Context, forceFull: Boolean = false) {
            val mgr = AppWidgetManager.getInstance(context)
            val ids = mgr.getAppWidgetIds(ComponentName(context, PrayerWidgetProvider::class.java))
            if (ids.isEmpty()) return
            val minute = System.currentTimeMillis() / 60000L
            val full = forceFull || minute != lastFullMinute
            for (id in ids) {
                if (full) fullUpdate(context, mgr, id) else partialUpdate(context, mgr, id)
            }
            if (full) lastFullMinute = minute
        }

        // ---- shared computed state ---------------------------------------------

        private data class WidgetState(
            val untilText: String,
            val countdown: String,
            val progressPct: Int,
            val sinceText: String?,
            val nowClock: String
        )

        private fun computeState(
            context: Context,
            prayers: List<PrayerTimeData>,
            nextIndex: Int,
            nextDayPrayer: PrayerTimeData?
        ): WidgetState {
            val now = DebugTimeProvider.currentTimeMillis(context)
            val next = nextDayPrayer ?: prayers.getOrNull(nextIndex)
            val untilText = if (next != null) "Until ${next.label} · ${formatTimeShort(next.prayerTime)}" else ""
            val countdown = if (next != null) formatCountdown(context, next.prayerTime) else ""

            // progress between previous prayer and next
            var pct = 0
            if (next != null) {
                var prevTime = 0L
                for (p in prayers) if (p.prayerTime in (prevTime + 1)..now) prevTime = p.prayerTime
                if (prevTime == 0L) {
                    val isha = prayers.find { it.prayerName.equals(PRAYER_ISHA, true) }
                    prevTime = (isha?.prayerTime ?: next.prayerTime) - MS_PER_DAY
                }
                val span = next.prayerTime - prevTime
                if (span > 0) pct = (((now - prevTime).toDouble() / span) * 100).toInt().coerceIn(0, 100)
            }

            // since: most recent prayer that has passed (else yesterday's Isha)
            var prev: PrayerTimeData? = null
            for (p in prayers) if (p.prayerTime < now && (prev == null || p.prayerTime > prev!!.prayerTime)) prev = p
            val sinceText = when {
                prev != null -> "${prev!!.label} · ${formatElapsed(context, prev!!.prayerTime)}"
                else -> prayers.find { it.prayerName.equals(PRAYER_ISHA, true) }
                    ?.let { "Isha · ${formatElapsed(context, it.prayerTime - MS_PER_DAY)}" }
            }

            return WidgetState(untilText, countdown, pct, sinceText, formatTime(now))
        }

        // ---- full update (bitmap + everything) ----------------------------------

        private fun fullUpdate(context: Context, mgr: AppWidgetManager, appWidgetId: Int) {
            val options = mgr.getAppWidgetOptions(appWidgetId)
            val minHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 110)
            val minWidth = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250)
            val layoutId = layoutFor(minWidth, minHeight)
            val views = RemoteViews(context.packageName, layoutId)

            val prayers = PrayerTimeUtils.loadPrayerTimes(context)
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val storedIndex = prefs.getInt(KEY_NEXT_PRAYER_INDEX, 0)

            // click → open app
            val pi = cachedLaunchPendingIntent ?: run {
                context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
                    PendingIntent.getActivity(
                        context, 0, it,
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                    ).also { p -> cachedLaunchPendingIntent = p }
                }
            }
            if (pi != null) views.setOnClickPendingIntent(R.id.widget_root, pi)

            val (imageId, drawOrbitBase, px) = bitmapSpec(layoutId)
            val glance = isGlance(layoutId)

            if (prayers.isEmpty()) {
                showMessage(views, "Open Meeqat")
                if (!glance) {
                    views.setImageViewBitmap(imageId, MeeqatOrbit.bitmap(px, prayers, 0, DebugTimeProvider.currentTimeMillis(context), false))
                    setHeaderData(context, views, prefs)
                }
                mgr.updateAppWidget(appWidgetId, views)
                return
            }

            val nextIndex = PrayerTimeUtils.findNextPrayerIndex(context, prayers, storedIndex)
            if (nextIndex != storedIndex) prefs.edit().putInt(KEY_NEXT_PRAYER_INDEX, nextIndex).commit()

            val allPassed = PrayerTimeUtils.allPrayersPassed(context, prayers)
            val nextDayPrayer = if (allPassed) PrayerTimeUtils.loadNextDayPrayer(context) else null

            val dataAge = System.currentTimeMillis() - prefs.getLong("data_timestamp", 0L)
            if (dataAge > DATA_STALENESS_THRESHOLD_MS && allPassed && nextDayPrayer == null) {
                showMessage(views, "Tap to refresh")
            } else {
                val state = computeState(context, prayers, nextIndex, nextDayPrayer)
                if (glance) {
                    applyGlance(views, state)
                } else {
                    applyState(views, state)
                    populateStrip(context, views, prayers, if (nextDayPrayer == null) nextIndex else -1)
                }
            }

            // The glance layout has no orbit/strip/header — skip the bitmap + header.
            if (!glance) {
                val now = DebugTimeProvider.currentTimeMillis(context)
                val drawOrbit = drawOrbitBase && prayers.isNotEmpty()
                views.setImageViewBitmap(imageId, MeeqatOrbit.bitmap(px, prayers, nextIndex, now, drawOrbit))
                setHeaderData(context, views, prefs)
            }

            mgr.updateAppWidget(appWidgetId, views)
        }

        // ---- partial update (per-second, no bitmap) ------------------------------

        private fun partialUpdate(context: Context, mgr: AppWidgetManager, appWidgetId: Int) {
            val options = mgr.getAppWidgetOptions(appWidgetId)
            val minHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 110)
            val minWidth = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250)
            val layoutId = layoutFor(minWidth, minHeight)

            val prayers = PrayerTimeUtils.loadPrayerTimes(context)
            if (prayers.isEmpty()) return
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val nextIndex = PrayerTimeUtils.findNextPrayerIndex(context, prayers, prefs.getInt(KEY_NEXT_PRAYER_INDEX, 0))
            val nextDayPrayer = if (PrayerTimeUtils.allPrayersPassed(context, prayers)) PrayerTimeUtils.loadNextDayPrayer(context) else null

            val state = computeState(context, prayers, nextIndex, nextDayPrayer)
            val views = RemoteViews(context.packageName, layoutId)
            if (isGlance(layoutId)) applyGlance(views, state) else applyState(views, state)
            try { mgr.partiallyUpdateAppWidget(appWidgetId, views) } catch (e: Exception) {
                Log.w(TAG, "partial update failed: ${e.message}")
            }
        }

        private fun applyState(views: RemoteViews, s: WidgetState) {
            views.setTextViewText(R.id.until_label, s.untilText)
            views.setTextViewText(R.id.countdown, s.countdown)
            views.setProgressBar(R.id.next_progress, 100, s.progressPct, false)
            if (s.sinceText != null) {
                views.setTextViewText(R.id.since_line, s.sinceText)
                views.setViewVisibility(R.id.since_line, View.VISIBLE)
            } else {
                views.setViewVisibility(R.id.since_line, View.INVISIBLE)
            }
            try { views.setTextViewText(R.id.now_clock, s.nowClock) } catch (_: Exception) {}
        }

        /** Minimal apply path for the one-row glance layout: until + countdown only. */
        private fun applyGlance(views: RemoteViews, s: WidgetState) {
            views.setTextViewText(R.id.until_label, s.untilText)
            views.setTextViewText(R.id.countdown, s.countdown)
            try { views.setProgressBar(R.id.next_progress, 100, s.progressPct, false) } catch (_: Exception) {}
        }

        private fun populateStrip(context: Context, views: RemoteViews, prayers: List<PrayerTimeData>, nextIndex: Int) {
            for (i in 0 until 6) {
                if (i < prayers.size) {
                    val p = prayers[i]
                    views.setTextViewText(stripLabelIds[i], p.label)
                    views.setTextViewText(stripTimeIds[i], formatTimeShort(p.prayerTime))
                    views.setViewVisibility(stripColIds[i], View.VISIBLE)
                    when {
                        i == nextIndex -> {
                            views.setInt(stripColIds[i], "setBackgroundResource", R.drawable.widget_highlight_bg)
                            views.setTextColor(stripLabelIds[i], 0xFFFDE68A.toInt())
                            views.setTextColor(stripTimeIds[i], 0xFFFDE68A.toInt())
                        }
                        nextIndex in 0..5 && i < nextIndex -> { // past
                            views.setInt(stripColIds[i], "setBackgroundColor", 0x00000000)
                            views.setTextColor(stripLabelIds[i], 0x59FFFFFF)
                            views.setTextColor(stripTimeIds[i], 0x66FFFFFF)
                        }
                        else -> { // upcoming
                            views.setInt(stripColIds[i], "setBackgroundColor", 0x00000000)
                            views.setTextColor(stripLabelIds[i], 0x8CFFFFFF.toInt())
                            views.setTextColor(stripTimeIds[i], 0xCCFFFFFF.toInt())
                        }
                    }
                } else {
                    views.setViewVisibility(stripColIds[i], View.GONE)
                }
            }
        }

        private fun showMessage(views: RemoteViews, msg: String) {
            views.setTextViewText(R.id.countdown, msg)
            try { views.setTextViewText(R.id.until_label, "") } catch (_: Exception) {}
            try { views.setViewVisibility(R.id.since_line, View.INVISIBLE) } catch (_: Exception) {}
            for (id in stripColIds) try { views.setViewVisibility(id, View.GONE) } catch (_: Exception) {}
        }

        private fun setHeaderData(context: Context, views: RemoteViews, prefs: android.content.SharedPreferences) {
            val hijri = prefs.getString(KEY_HIJRI_DATE, null)
            val greg = prefs.getString(KEY_GREGORIAN_DATE, null)
            val city = prefs.getString(KEY_CITY, null)
            val cc = prefs.getString(KEY_COUNTRY_CODE, null)

            try {
                views.setTextViewText(R.id.gregorian_date, greg
                    ?: gregorianFormat.get()!!.format(Date(DebugTimeProvider.currentTimeMillis(context))))
            } catch (_: Exception) {}
            try { views.setTextViewText(R.id.hijri_date, hijri ?: "") } catch (_: Exception) {}
            try {
                if (city != null) {
                    views.setTextViewText(R.id.location_text, if (cc != null) "$city, $cc" else city)
                    views.setViewVisibility(R.id.location_text, View.VISIBLE)
                }
            } catch (_: Exception) {}
        }

        private fun formatTime(ts: Long) = timeFormat.get()!!.format(Date(ts))
        private fun formatTimeShort(ts: Long) = timeFormatShort.get()!!.format(Date(ts))

        private fun formatElapsed(context: Context, prayerTime: Long): String {
            val diff = DebugTimeProvider.currentTimeMillis(context) - prayerTime
            if (diff <= 0) return "now"
            val hours = diff / (1000 * 60 * 60)
            val minutes = (diff % (1000 * 60 * 60)) / (1000 * 60)
            return if (hours > 0) "${hours}h ${minutes}m ago" else "${minutes}m ago"
        }

        private fun formatCountdown(context: Context, targetTime: Long) =
            PrayerTimeUtils.formatDuration(targetTime - DebugTimeProvider.currentTimeMillis(context))
    }

    override fun onUpdate(context: Context, mgr: AppWidgetManager, appWidgetIds: IntArray) {
        for (id in appWidgetIds) fullUpdate(context, mgr, id)
        lastFullMinute = System.currentTimeMillis() / 60000L
        WidgetUpdateReceiver.ensureUpdatesActive(context)
    }

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        WidgetUpdateReceiver.ensureUpdatesActive(context)
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        WidgetUpdateReceiver.cancelScheduledUpdates(context)
        WidgetKeepAliveWorker.cancel(context)
    }

    override fun onAppWidgetOptionsChanged(context: Context, mgr: AppWidgetManager, appWidgetId: Int, newOptions: Bundle) {
        fullUpdate(context, mgr, appWidgetId)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_WIDGET_UPDATE) {
            val mgr = AppWidgetManager.getInstance(context)
            val ids = mgr.getAppWidgetIds(ComponentName(context, PrayerWidgetProvider::class.java))
            onUpdate(context, mgr, ids)
        }
    }
}
