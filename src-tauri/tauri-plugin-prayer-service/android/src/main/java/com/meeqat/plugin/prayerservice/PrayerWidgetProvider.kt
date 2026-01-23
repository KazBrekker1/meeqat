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
import org.json.JSONArray
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.Calendar

/**
 * AppWidgetProvider that displays prayer times on the home screen.
 * Reads prayer data from SharedPreferences (shared with the plugin).
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

        /**
         * Static method to trigger widget updates from anywhere
         */
        fun updateAllWidgets(context: Context) {
            val intent = Intent(context, PrayerWidgetProvider::class.java).apply {
                action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
            }
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val widgetIds = appWidgetManager.getAppWidgetIds(
                ComponentName(context, PrayerWidgetProvider::class.java)
            )
            intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, widgetIds)
            context.sendBroadcast(intent)
        }
    }

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        Log.d(TAG, "onUpdate called for ${appWidgetIds.size} widgets")
        for (appWidgetId in appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId)
        }
        // Ensure periodic updates are scheduled
        WidgetUpdateReceiver.scheduleNextUpdate(context)
    }

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        Log.d(TAG, "onEnabled - first widget added, starting update scheduling")
        // Start periodic widget updates when first widget is added
        WidgetUpdateReceiver.scheduleNextUpdate(context)
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        Log.d(TAG, "onDisabled - last widget removed, cancelling updates")
        // Cancel periodic updates when last widget is removed
        WidgetUpdateReceiver.cancelScheduledUpdates(context)
    }

    override fun onAppWidgetOptionsChanged(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetId: Int,
        newOptions: Bundle
    ) {
        Log.d(TAG, "onAppWidgetOptionsChanged for widget $appWidgetId")
        updateWidget(context, appWidgetManager, appWidgetId)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_WIDGET_UPDATE) {
            Log.d(TAG, "Received WIDGET_UPDATE broadcast")
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val widgetIds = appWidgetManager.getAppWidgetIds(
                ComponentName(context, PrayerWidgetProvider::class.java)
            )
            onUpdate(context, appWidgetManager, widgetIds)
        }
    }

    private fun updateWidget(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetId: Int
    ) {
        // Get widget size to determine layout
        val options = appWidgetManager.getAppWidgetOptions(appWidgetId)
        val minHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 110)
        val minWidth = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250)

        // Select layout based on width and height
        // Wide layout only for very wide widgets (5+ columns, 2 rows) with high aspect ratio
        val isWide = minWidth >= 380 && minHeight < 160 && minWidth > minHeight * 2.0
        val layoutId = when {
            isWide -> R.layout.widget_prayer_wide               // Wide horizontal layout (5x2 or 6x2)
            minHeight >= 250 -> R.layout.widget_prayer_4x4      // Full (all 6 prayers vertical)
            minHeight >= 160 -> R.layout.widget_prayer_4x3      // 4x3 with next prayer + 2-col grid
            minHeight >= 110 -> R.layout.widget_prayer_compact  // Compact with prev prayer
            else -> R.layout.widget_prayer_4x2                  // Minimal (countdown only)
        }

        Log.d(TAG, "Widget $appWidgetId: ${minWidth}x$minHeight, using layout=${getLayoutName(layoutId)}")

        val views = RemoteViews(context.packageName, layoutId)

        // Load prayer data from SharedPreferences
        val prefs = context.getSharedPreferences(
            PREFS_NAME,
            Context.MODE_PRIVATE
        )
        val prayersJson = prefs.getString(KEY_PRAYERS_JSON, null)
        val nextPrayerIndex = prefs.getInt(KEY_NEXT_PRAYER_INDEX, 0)

        // Set up click intent to open app
        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        if (launchIntent != null) {
            val pendingIntent = PendingIntent.getActivity(
                context,
                0,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_root, pendingIntent)
        }

        if (prayersJson != null) {
            val prayers = parsePrayersJson(prayersJson)
            if (prayers.isNotEmpty()) {
                // Recalculate the actual next prayer index based on current time
                // This handles the case where the app is in background and prayer time passes
                val actualNextIndex = findActualNextPrayerIndex(context, prayers, nextPrayerIndex)

                // Update SharedPreferences if index changed
                if (actualNextIndex != nextPrayerIndex) {
                    Log.d(TAG, "Prayer index advanced from $nextPrayerIndex to $actualNextIndex")
                    prefs.edit().putInt(KEY_NEXT_PRAYER_INDEX, actualNextIndex).apply()
                }

                populateWidget(context, views, prayers, actualNextIndex, layoutId)
            } else {
                showLoadingState(views)
            }
        } else {
            showLoadingState(views)
        }

        // Set calendar dates from SharedPreferences (passed from frontend)
        setCalendarDates(views, prefs)

        appWidgetManager.updateAppWidget(appWidgetId, views)
    }

    private fun populateWidget(
        context: Context,
        views: RemoteViews,
        prayers: List<PrayerTimeData>,
        nextPrayerIndex: Int,
        layoutId: Int
    ) {
        // Set next prayer info
        if (nextPrayerIndex in prayers.indices) {
            val nextPrayer = prayers[nextPrayerIndex]
            views.setTextViewText(R.id.next_prayer_name, nextPrayer.label)
            views.setTextViewText(R.id.next_prayer_time, formatTime(nextPrayer.prayerTime))
            views.setTextViewText(R.id.countdown, formatCountdown(context, nextPrayer.prayerTime))
        }

        // Set previous prayer info (for layouts that support it)
        if (layoutId == R.layout.widget_prayer_compact || layoutId == R.layout.widget_prayer_4x4 || layoutId == R.layout.widget_prayer_wide || layoutId == R.layout.widget_prayer_4x3) {
            // Find the most recent prayer that has actually passed
            val now = DebugTimeProvider.currentTimeMillis(context)
            val prevPrayer = prayers
                .filter { it.prayerTime < now }
                .maxByOrNull { it.prayerTime }

            if (prevPrayer != null) {
                try {
                    views.setTextViewText(R.id.prev_prayer_name, prevPrayer.label)
                    views.setTextViewText(R.id.prev_prayer_elapsed, formatElapsed(context, prevPrayer.prayerTime))
                    views.setViewVisibility(R.id.prev_prayer_container, View.VISIBLE)
                } catch (e: Exception) {
                    // Layout might not have these views
                }
            } else {
                // No prayer has passed yet today (before Fajr)
                // Show "Since Isha" from yesterday if we have Isha in the list
                val isha = prayers.find { it.prayerName.equals("Isha", ignoreCase = true) }
                if (isha != null) {
                    try {
                        // Isha from yesterday = today's Isha time - 24 hours
                        val yesterdayIshaTime = isha.prayerTime - (24 * 60 * 60 * 1000)
                        views.setTextViewText(R.id.prev_prayer_name, "Isha")
                        views.setTextViewText(R.id.prev_prayer_elapsed, formatElapsed(context, yesterdayIshaTime))
                        views.setViewVisibility(R.id.prev_prayer_container, View.VISIBLE)
                    } catch (e: Exception) {
                        // Layout might not have these views
                    }
                } else {
                    try {
                        views.setViewVisibility(R.id.prev_prayer_container, View.GONE)
                    } catch (e: Exception) {
                        // Layout might not have this view
                    }
                }
            }
        }

        // Populate prayer list for layouts with prayer rows
        if (layoutId == R.layout.widget_prayer_compact || layoutId == R.layout.widget_prayer_4x4 || layoutId == R.layout.widget_prayer_wide || layoutId == R.layout.widget_prayer_4x3) {
            val maxRows = 6
            val prayersToShow = prayers.take(maxRows)

            // Row IDs for name and time TextViews
            val rowNameIds = intArrayOf(
                R.id.prayer_name_1, R.id.prayer_name_2, R.id.prayer_name_3,
                R.id.prayer_name_4, R.id.prayer_name_5, R.id.prayer_name_6
            )
            val rowTimeIds = intArrayOf(
                R.id.prayer_time_1, R.id.prayer_time_2, R.id.prayer_time_3,
                R.id.prayer_time_4, R.id.prayer_time_5, R.id.prayer_time_6
            )
            val rowContainerIds = intArrayOf(
                R.id.prayer_row_1, R.id.prayer_row_2, R.id.prayer_row_3,
                R.id.prayer_row_4, R.id.prayer_row_5, R.id.prayer_row_6
            )

            // Use shorter time format for compact/wide/4x3 layouts
            val useShortTime = layoutId == R.layout.widget_prayer_compact || layoutId == R.layout.widget_prayer_wide || layoutId == R.layout.widget_prayer_4x3

            for (i in 0 until maxRows) {
                if (i < prayersToShow.size && i < rowNameIds.size) {
                    val prayer = prayersToShow[i]
                    views.setTextViewText(rowNameIds[i], prayer.label)
                    views.setTextViewText(rowTimeIds[i], if (useShortTime) formatTimeShort(prayer.prayerTime) else formatTime(prayer.prayerTime))
                    views.setViewVisibility(rowContainerIds[i], View.VISIBLE)

                    // Highlight current prayer row
                    if (i == nextPrayerIndex) {
                        views.setInt(rowContainerIds[i], "setBackgroundResource", R.drawable.widget_highlight_bg)
                        views.setTextColor(rowNameIds[i], 0xFFFFFFFF.toInt())
                    } else {
                        views.setInt(rowContainerIds[i], "setBackgroundResource", R.drawable.widget_prayer_row_bg)
                        views.setTextColor(rowNameIds[i], 0xB3FFFFFF.toInt())
                    }
                } else if (i < rowContainerIds.size) {
                    views.setViewVisibility(rowContainerIds[i], View.GONE)
                }
            }
        }
    }

    private fun showLoadingState(views: RemoteViews) {
        views.setTextViewText(R.id.next_prayer_name, "Loading...")
        views.setTextViewText(R.id.next_prayer_time, "--:--")
        views.setTextViewText(R.id.countdown, "--:--")
    }

    private fun setCalendarDates(views: RemoteViews, prefs: android.content.SharedPreferences) {
        // Read dates from SharedPreferences (passed from frontend which calculates correctly)
        val hijriDate = prefs.getString(KEY_HIJRI_DATE, null)
        val gregorianDate = prefs.getString(KEY_GREGORIAN_DATE, null)

        // Set Gregorian date - use saved value or fall back to local formatting
        if (gregorianDate != null) {
            views.setTextViewText(R.id.gregorian_date, gregorianDate)
        } else {
            val gregorianFormat = SimpleDateFormat("EEE, MMM d", Locale.getDefault())
            views.setTextViewText(R.id.gregorian_date, gregorianFormat.format(Date()))
        }

        // Set Hijri date - use saved value from frontend (calculated using proper Islamic calendar)
        if (hijriDate != null) {
            views.setTextViewText(R.id.hijri_date, hijriDate)
        } else {
            // Fallback: show empty or placeholder until data arrives from frontend
            views.setTextViewText(R.id.hijri_date, "")
        }
    }

    /**
     * Find the actual next prayer index based on current time.
     * If the stored next prayer has passed, find the first prayer that hasn't passed yet.
     * If all prayers have passed, return the last prayer index (end of day state).
     */
    private fun findActualNextPrayerIndex(context: Context, prayers: List<PrayerTimeData>, storedIndex: Int): Int {
        val now = DebugTimeProvider.currentTimeMillis(context)

        // If stored index is valid and that prayer hasn't passed, use it
        if (storedIndex in prayers.indices && prayers[storedIndex].prayerTime > now) {
            return storedIndex
        }

        // Find the first prayer that hasn't passed yet
        for (i in prayers.indices) {
            if (prayers[i].prayerTime > now) {
                return i
            }
        }

        // All prayers have passed - return the last one (shows "Now" state for last prayer)
        // This handles end-of-day scenario where we're past Isha
        return prayers.lastIndex.coerceAtLeast(0)
    }

    private fun formatTime(timestamp: Long): String {
        val sdf = SimpleDateFormat("h:mm a", Locale.getDefault())
        return sdf.format(Date(timestamp))
    }

    private fun formatTimeShort(timestamp: Long): String {
        val sdf = SimpleDateFormat("h:mm", Locale.getDefault())
        return sdf.format(Date(timestamp))
    }

    private fun formatElapsed(context: Context, prayerTime: Long): String {
        val now = DebugTimeProvider.currentTimeMillis(context)
        val diff = now - prayerTime

        if (diff <= 0) {
            return "now"
        }

        val hours = diff / (1000 * 60 * 60)
        val minutes = (diff % (1000 * 60 * 60)) / (1000 * 60)

        return when {
            hours > 0 -> "${hours}h ${minutes}m ago"
            else -> "${minutes}m ago"
        }
    }

    private fun formatCountdown(context: Context, targetTime: Long): String {
        val now = DebugTimeProvider.currentTimeMillis(context)
        val diff = targetTime - now

        if (diff <= 0) {
            return "Now"
        }

        val hours = diff / (1000 * 60 * 60)
        val minutes = (diff % (1000 * 60 * 60)) / (1000 * 60)
        val seconds = (diff % (1000 * 60)) / 1000

        return when {
            hours > 0 -> "${hours}h ${minutes}m"
            minutes >= 1 -> "${minutes}m"
            else -> "${seconds}s"
        }
    }

    private fun parsePrayersJson(json: String): List<PrayerTimeData> {
        return try {
            val result = mutableListOf<PrayerTimeData>()
            val jsonArray = JSONArray(json)

            for (i in 0 until jsonArray.length()) {
                val obj = jsonArray.getJSONObject(i)
                val prayerName = obj.getString("prayerName")
                val prayerTime = obj.getLong("prayerTime")
                val label = obj.getString("label")
                result.add(PrayerTimeData(prayerName, prayerTime, label))
            }

            result
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing prayers JSON: ${e.message}", e)
            emptyList()
        }
    }

    private fun getLayoutName(layoutId: Int): String {
        return when (layoutId) {
            R.layout.widget_prayer_4x4 -> "4x4"
            R.layout.widget_prayer_4x3 -> "4x3"
            R.layout.widget_prayer_compact -> "compact"
            R.layout.widget_prayer_wide -> "wide"
            R.layout.widget_prayer_4x2 -> "4x2"
            else -> "unknown"
        }
    }
}
