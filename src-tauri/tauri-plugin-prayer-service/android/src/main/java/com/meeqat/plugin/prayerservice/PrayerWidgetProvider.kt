package com.meeqat.plugin.prayerservice

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.SystemClock
import android.util.TypedValue
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
 * Update strategy: the parts that move every second are drawn by the system — the
 * countdown is a Chronometer and the clock a TextClock — so nothing here runs per
 * second. Everything else (orbit bitmap, progress, highlight, "since" line, dates)
 * is redrawn in full on the coarse schedule kept by [WidgetUpdateReceiver]: at each
 * prayer boundary / midnight, every few minutes while the device is awake, and
 * whenever the app pushes new data.
 */
class PrayerWidgetProvider : AppWidgetProvider() {

    companion object {
        const val ACTION_WIDGET_UPDATE = "com.meeqat.plugin.prayerservice.WIDGET_UPDATE"

        // SharedPreferences keys (shared with PrayerServicePlugin)
        const val PREFS_NAME = "prayer_service_prefs"
        const val KEY_PRAYERS_JSON = "prayers_json"
        // [{prayers, hijriDate?, gregorianDate?}] — today first, up to a week ahead.
        const val KEY_UPCOMING_DAYS_JSON = "upcoming_days_json"
        const val KEY_HIJRI_DATE = "hijri_date"
        const val KEY_GREGORIAN_DATE = "gregorian_date"
        const val KEY_NEXT_DAY_PRAYER_NAME = "next_day_prayer_name"
        const val KEY_NEXT_DAY_PRAYER_TIME = "next_day_prayer_time"
        const val KEY_NEXT_DAY_PRAYER_LABEL = "next_day_prayer_label"
        const val KEY_CITY = "city"
        const val KEY_COUNTRY_CODE = "country_code"

        const val KEY_USE_24_HOUR = "use_24_hour"

        private const val STRIP_MIN_WIDTH = 250
        private const val MSG_NO_DATA = "Open Meeqat"
        private const val MSG_STALE = "Tap to refresh"
        // Countdown text size: the live H:MM:SS, and the smaller status message.
        private const val COUNTDOWN_SP = 22f
        private const val COUNTDOWN_MESSAGE_SP = 15f

        @Volatile private var cachedLaunchPendingIntent: PendingIntent? = null

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
                // Narrow widgets can't fit the six-column times strip.
                minWidth < STRIP_MIN_WIDTH -> if (minHeight >= 110) R.layout.widget_prayer_compact else R.layout.widget_prayer_glance
                minHeight >= 250 -> R.layout.widget_prayer_4x4
                minHeight >= 110 -> R.layout.widget_prayer_4x3
                minHeight >= 72 -> R.layout.widget_prayer_4x2
                // One-row "glance": just the next prayer + live countdown.
                else -> R.layout.widget_prayer_glance
            }
        }

        private fun isGlance(layoutId: Int) = layoutId == R.layout.widget_prayer_glance

        /** Orbit/moon image: (viewId, drawOrbit, renderPx). 4×2 is moon-only. */
        private fun bitmapSpec(layoutId: Int): Triple<Int, Boolean, Int> = when (layoutId) {
            R.layout.widget_prayer_4x4 -> Triple(R.id.orbit_image, true, 420)
            R.layout.widget_prayer_4x3 -> Triple(R.id.orbit_image, true, 300)
            R.layout.widget_prayer_compact -> Triple(R.id.orbit_image, true, 260)
            R.layout.widget_prayer_wide -> Triple(R.id.orbit_image, true, 300)
            else -> Triple(R.id.moon_image, false, 140)
        }

        /** Layouts with the Chronometer countdown (+ until label and progress bar). */
        private fun hasCountdown(layoutId: Int) =
            layoutId == R.layout.widget_prayer_4x2 || layoutId == R.layout.widget_prayer_glance

        /** Layouts whose header shows the TextClock. */
        private fun hasClock(layoutId: Int) = layoutId == R.layout.widget_prayer_4x3 ||
            layoutId == R.layout.widget_prayer_4x4 || layoutId == R.layout.widget_prayer_compact

        // ---- entry points -------------------------------------------------------

        /** Whether any widget is placed. Nothing is scheduled or drawn without one. */
        fun hasWidgets(context: Context): Boolean = widgetIds(context).isNotEmpty()

        private fun widgetIds(context: Context): IntArray = AppWidgetManager.getInstance(context)
            .getAppWidgetIds(ComponentName(context, PrayerWidgetProvider::class.java))

        /** Redraw every placed widget in full. A no-op when there are none. */
        fun updateAllWidgets(context: Context) {
            val ids = widgetIds(context)
            if (ids.isEmpty()) return
            updateWidgets(context, AppWidgetManager.getInstance(context), ids)
        }

        /**
         * Synchronized: redraws come from the main thread (receivers) and from the
         * Tauri command thread (data pushes); one at a time keeps them from interleaving.
         */
        @Synchronized
        private fun updateWidgets(context: Context, mgr: AppWidgetManager, ids: IntArray) {
            for (id in ids) fullUpdate(context, mgr, id)
        }

        // ---- full update ----------------------------------------------------------

        private fun fullUpdate(context: Context, mgr: AppWidgetManager, appWidgetId: Int) {
            val options = mgr.getAppWidgetOptions(appWidgetId)
            val minHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 110)
            val minWidth = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250)
            val layoutId = layoutFor(minWidth, minHeight)
            val views = RemoteViews(context.packageName, layoutId)

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

            val now = DebugTimeProvider.currentTimeMillis(context)
            val schedule = PrayerTimeUtils.resolveSchedule(context, now)
            val prayers = schedule?.day?.prayers ?: emptyList()
            val next = schedule?.next

            // The pill at the orbit's bottom: the countdown, or what to do when there is none.
            val caption: String
            if (schedule == null || next == null) {
                // No data yet, or the stored window has run out.
                caption = if (schedule == null) MSG_NO_DATA else MSG_STALE
                showMessage(views, layoutId, caption)
            } else {
                caption = "${next.label} in ${formatMinutes(next.prayerTime / 60000L - now / 60000L)}"
                applyState(context, views, layoutId, next, schedule.prev, now)
                // wide renders a vertical times LIST → slim accent-bar highlight;
                // the other layouts use the horizontal strip → the chip highlight.
                val listStyle = layoutId == R.layout.widget_prayer_wide
                populateStrip(context, views, prayers, schedule.nextIndex, listStyle)
            }

            // The glance layout has no orbit/strip/header — skip the bitmap + header.
            if (!isGlance(layoutId)) {
                val (imageId, drawOrbit, px) = bitmapSpec(layoutId)
                views.setImageViewBitmap(
                    imageId,
                    MeeqatOrbit.bitmap(px, prayers, schedule?.nextIndex ?: -1, now, drawOrbit, caption)
                )
                // A stale day's dates are not today's — only a live schedule lends its header.
                setHeaderData(context, views, layoutId, if (next != null) schedule?.day else null, now)
            }

            mgr.updateAppWidget(appWidgetId, views)
        }

        /**
         * Fill the text parts for a live schedule. Ids a layout doesn't have are
         * skipped by RemoteViews; the Chronometer / TextClock calls are type-specific,
         * so those are only made for layouts that carry the view.
         */
        private fun applyState(
            context: Context,
            views: RemoteViews,
            layoutId: Int,
            next: PrayerTimeData,
            prev: PrayerTimeData?,
            now: Long
        ) {
            views.setTextViewText(R.id.until_label, "Until ${next.label} · ${formatTimeShort(context, next.prayerTime)}")
            views.setTextViewText(R.id.next_line, "${next.label} · ${formatTime(context, next.prayerTime)}") // compact only

            if (hasCountdown(layoutId)) {
                // The system ticks this down by itself (H:MM:SS / MM:SS) — no updates from us.
                views.setTextViewTextSize(R.id.countdown, TypedValue.COMPLEX_UNIT_SP, COUNTDOWN_SP)
                views.setChronometerCountDown(R.id.countdown, true)
                views.setChronometer(
                    R.id.countdown,
                    SystemClock.elapsedRealtime() + (next.prayerTime - now),
                    null,
                    true
                )
            }

            // progress between previous prayer and next
            var pct = 0
            if (prev != null) {
                val span = next.prayerTime - prev.prayerTime
                if (span > 0) pct = (((now - prev.prayerTime).toDouble() / span) * 100).toInt().coerceIn(0, 100)
            }
            views.setProgressBar(R.id.next_progress, 100, pct, false)

            if (prev != null) {
                views.setTextViewText(R.id.since_line, "${prev.label} · ${formatElapsed(now - prev.prayerTime)}")
                views.setViewVisibility(R.id.since_line, View.VISIBLE)
            } else {
                views.setViewVisibility(R.id.since_line, View.INVISIBLE)
            }
        }

        private fun populateStrip(context: Context, views: RemoteViews, prayers: List<PrayerTimeData>, nextIndex: Int, listStyle: Boolean) {
            val highlightBg = if (listStyle) R.drawable.widget_current_row_bg else R.drawable.widget_highlight_bg
            for (i in 0 until 6) {
                if (i < prayers.size) {
                    val p = prayers[i]
                    views.setTextViewText(stripLabelIds[i], p.label)
                    views.setTextViewText(stripTimeIds[i], formatTimeShort(context, p.prayerTime))
                    views.setViewVisibility(stripColIds[i], View.VISIBLE)
                    when {
                        i == nextIndex -> {
                            views.setInt(stripColIds[i], "setBackgroundResource", highlightBg)
                            views.setTextColor(stripLabelIds[i], 0xFFFDE68A.toInt())
                            views.setTextColor(stripTimeIds[i], 0xFFFDE68A.toInt())
                        }
                        nextIndex in 0..5 && i < nextIndex -> { // past
                            views.setInt(stripColIds[i], "setBackgroundColor", 0x00000000)
                            views.setTextColor(stripLabelIds[i], 0x80FFFFFF.toInt())
                            views.setTextColor(stripTimeIds[i], 0x8CFFFFFF.toInt())
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

        /**
         * No data / stale data: the message replaces the countdown (and, through the
         * caller, the orbit's pill) and the times are hidden rather than shown wrong.
         */
        private fun showMessage(views: RemoteViews, layoutId: Int, msg: String) {
            if (hasCountdown(layoutId)) {
                // Stop the Chronometer first, or its next tick would overwrite the text.
                views.setChronometer(R.id.countdown, SystemClock.elapsedRealtime(), null, false)
                views.setTextViewTextSize(R.id.countdown, TypedValue.COMPLEX_UNIT_SP, COUNTDOWN_MESSAGE_SP)
                views.setTextViewText(R.id.countdown, msg)
            }
            views.setTextViewText(R.id.until_label, "")
            views.setProgressBar(R.id.next_progress, 100, 0, false)
            views.setViewVisibility(R.id.since_line, View.INVISIBLE)
            for (id in stripColIds) views.setViewVisibility(id, View.GONE)
            views.setTextViewText(R.id.next_line, "") // compact only; its orbit pill carries the message
        }

        /**
         * Header for the day being shown. The dates are the app's strings for THAT day;
         * for a day without them (older data, or a projected day) the Gregorian date is
         * formatted here and takes the Hijri date's place — never yesterday's Hijri date.
         */
        private fun setHeaderData(context: Context, views: RemoteViews, layoutId: Int, day: PrayerDay?, now: Long) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val city = prefs.getString(KEY_CITY, null)
            val cc = prefs.getString(KEY_COUNTRY_CODE, null)

            // Created per call, like the clock formatters: a cached one would keep the
            // old locale / timezone after the user travels.
            val greg = day?.gregorianDate
                ?: SimpleDateFormat("MMM d, yyyy", Locale.getDefault()).format(Date(now))
            val hijri = day?.hijriDate
            views.setTextViewText(R.id.hijri_date, hijri ?: greg)
            views.setTextViewText(R.id.gregorian_date, if (hijri != null) greg else "")
            views.setTextViewText(R.id.location_text, when {
                city == null -> ""
                cc != null -> "$city, $cc"
                else -> city
            })

            if (hasClock(layoutId)) {
                // TextClock picks one of the two by the system setting; the app's own
                // 12h/24h preference wins, so both get the chosen pattern.
                val pattern = if (use24Hour(context)) "HH:mm" else "h:mm a"
                views.setCharSequence(R.id.now_clock, "setFormat12Hour", pattern)
                views.setCharSequence(R.id.now_clock, "setFormat24Hour", pattern)
            }
        }

        /** The app's 12h/24h setting; the system's until the app has pushed one. */
        private fun use24Hour(context: Context): Boolean {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            return if (prefs.contains(KEY_USE_24_HOUR)) prefs.getBoolean(KEY_USE_24_HOUR, false)
            else android.text.format.DateFormat.is24HourFormat(context)
        }

        private fun formatTime(context: Context, ts: Long) =
            SimpleDateFormat(if (use24Hour(context)) "HH:mm" else "h:mm a", Locale.getDefault()).format(Date(ts))
        private fun formatTimeShort(context: Context, ts: Long) =
            SimpleDateFormat(if (use24Hour(context)) "HH:mm" else "h:mm", Locale.getDefault()).format(Date(ts))

        private fun formatElapsed(diff: Long): String {
            if (diff < 60_000L) return "now"
            return "${formatMinutes(diff / 60_000L)} ago"
        }

        /** "3h 08m"-style duration for the orbit pill and the "since" line. */
        private fun formatMinutes(totalMinutes: Long): String {
            val m = totalMinutes.coerceAtLeast(0)
            return if (m >= 60) "${m / 60}h ${m % 60}m" else "${m}m"
        }
    }

    override fun onUpdate(context: Context, mgr: AppWidgetManager, appWidgetIds: IntArray) {
        updateWidgets(context, mgr, appWidgetIds)
        WidgetUpdateReceiver.ensureUpdatesActive(context)
    }

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        WidgetUpdateReceiver.ensureUpdatesActive(context)
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        // Last widget removed: nothing may keep running, or come back, without one.
        WidgetUpdateReceiver.cancelScheduledUpdates(context)
    }

    override fun onAppWidgetOptionsChanged(context: Context, mgr: AppWidgetManager, appWidgetId: Int, newOptions: Bundle) {
        updateWidgets(context, mgr, intArrayOf(appWidgetId))
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
