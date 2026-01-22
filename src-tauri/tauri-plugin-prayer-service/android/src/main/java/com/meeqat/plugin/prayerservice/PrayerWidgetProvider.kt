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
 * Reads prayer data from SharedPreferences (same store as PrayerForegroundService).
 */
class PrayerWidgetProvider : AppWidgetProvider() {

    companion object {
        private const val TAG = "PrayerWidgetProvider"
        const val ACTION_WIDGET_UPDATE = "com.meeqat.plugin.prayerservice.WIDGET_UPDATE"

        /**
         * Static method to trigger widget updates from the foreground service
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
        // Wide layout when widget is horizontally stretched
        val isWide = minWidth >= 300 && minHeight < 250 && minWidth > minHeight * 1.5
        val layoutId = when {
            isWide -> R.layout.widget_prayer_wide               // Wide horizontal layout
            minHeight >= 250 -> R.layout.widget_prayer_4x4      // Full (all 6 prayers vertical)
            minHeight >= 160 -> R.layout.widget_prayer_compact  // Compact 2-column with prev prayer
            else -> R.layout.widget_prayer_4x2                  // Minimal (countdown only)
        }

        Log.d(TAG, "Widget $appWidgetId: ${minWidth}x$minHeight, using layout=${getLayoutName(layoutId)}")

        val views = RemoteViews(context.packageName, layoutId)

        // Load prayer data from SharedPreferences
        val prefs = context.getSharedPreferences(
            PrayerForegroundService.PREFS_NAME,
            Context.MODE_PRIVATE
        )
        val prayersJson = prefs.getString(PrayerForegroundService.KEY_PRAYERS_JSON, null)
        val nextPrayerIndex = prefs.getInt(PrayerForegroundService.KEY_NEXT_PRAYER_INDEX, 0)

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
                populateWidget(context, views, prayers, nextPrayerIndex, layoutId)
            } else {
                showLoadingState(views)
            }
        } else {
            showLoadingState(views)
        }

        // Set calendar dates
        setCalendarDates(views)

        appWidgetManager.updateAppWidget(appWidgetId, views)
    }

    private fun populateWidget(
        @Suppress("UNUSED_PARAMETER") context: Context,
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
            views.setTextViewText(R.id.countdown, formatCountdown(nextPrayer.prayerTime))
        }

        // Set previous prayer info (for layouts that support it)
        if (layoutId == R.layout.widget_prayer_compact || layoutId == R.layout.widget_prayer_4x4 || layoutId == R.layout.widget_prayer_wide) {
            // Find the most recent prayer that has actually passed
            val now = System.currentTimeMillis()
            val prevPrayer = prayers
                .filter { it.prayerTime < now }
                .maxByOrNull { it.prayerTime }

            if (prevPrayer != null) {
                try {
                    views.setTextViewText(R.id.prev_prayer_name, prevPrayer.label)
                    views.setTextViewText(R.id.prev_prayer_elapsed, formatElapsed(prevPrayer.prayerTime))
                    views.setViewVisibility(R.id.prev_prayer_container, View.VISIBLE)
                } catch (e: Exception) {
                    // Layout might not have these views
                }
            } else {
                // No prayer has passed yet today, hide the container
                try {
                    views.setViewVisibility(R.id.prev_prayer_container, View.GONE)
                } catch (e: Exception) {
                    // Layout might not have this view
                }
            }
        }

        // Populate prayer list for layouts with prayer rows
        if (layoutId == R.layout.widget_prayer_compact || layoutId == R.layout.widget_prayer_4x4 || layoutId == R.layout.widget_prayer_wide) {
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

            // Use shorter time format for compact/wide layouts
            val useShortTime = layoutId == R.layout.widget_prayer_compact || layoutId == R.layout.widget_prayer_wide

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

    private fun setCalendarDates(views: RemoteViews) {
        // Gregorian date
        val gregorianFormat = SimpleDateFormat("EEE, MMM d", Locale.getDefault())
        views.setTextViewText(R.id.gregorian_date, gregorianFormat.format(Date()))

        // Hijri date - use approximation for now
        // The app should ideally save the calculated Hijri date to SharedPreferences
        views.setTextViewText(R.id.hijri_date, getApproximateHijriDate())
    }

    private fun getApproximateHijriDate(): String {
        // Simple approximation - in production, use a proper Hijri calendar library
        // The app should ideally save the calculated Hijri date to SharedPreferences
        val cal = Calendar.getInstance()
        val dayOfMonth = cal.get(Calendar.DAY_OF_MONTH)
        val monthNames = arrayOf(
            "Muharram", "Safar", "Rabi' I", "Rabi' II", "Jumada I", "Jumada II",
            "Rajab", "Sha'ban", "Ramadan", "Shawwal", "Dhul Qi'dah", "Dhul Hijjah"
        )
        // Very rough approximation - Hijri calendar lags ~11 days per solar year
        // This is placeholder - ideally use data from the main app
        val hijriMonth = (cal.get(Calendar.MONTH) + 1) % 12
        return "$dayOfMonth ${monthNames[hijriMonth]} 1446"
    }

    private fun formatTime(timestamp: Long): String {
        val sdf = SimpleDateFormat("h:mm a", Locale.getDefault())
        return sdf.format(Date(timestamp))
    }

    private fun formatTimeShort(timestamp: Long): String {
        val sdf = SimpleDateFormat("h:mm", Locale.getDefault())
        return sdf.format(Date(timestamp))
    }

    private fun formatElapsed(prayerTime: Long): String {
        val now = System.currentTimeMillis()
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

    private fun formatCountdown(targetTime: Long): String {
        val now = System.currentTimeMillis()
        val diff = targetTime - now

        if (diff <= 0) {
            return "Now"
        }

        val hours = diff / (1000 * 60 * 60)
        val minutes = (diff % (1000 * 60 * 60)) / (1000 * 60)

        return when {
            hours > 0 -> "${hours}h ${minutes}m"
            minutes > 0 -> "${minutes}m"
            else -> "<1m"
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
            R.layout.widget_prayer_compact -> "compact"
            R.layout.widget_prayer_wide -> "wide"
            R.layout.widget_prayer_4x2 -> "4x2"
            else -> "unknown"
        }
    }
}
