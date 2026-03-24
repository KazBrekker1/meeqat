package com.meeqat.plugin.prayerservice

import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * BroadcastReceiver that restarts widget updates after device boot,
 * and refreshes widgets when the system time, date, or timezone changes.
 *
 * Handles:
 * - BOOT_COMPLETED / QUICKBOOT_POWERON: resume alarms after reboot
 * - DATE_CHANGED: midnight rollover, stale prayer data from previous day
 * - TIME_SET: user manually changed clock or NTP sync
 * - TIMEZONE_CHANGED: user changed timezone (prayer times shift)
 */
class BootReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "PrayerBootReceiver"
        private const val ACTION_QUICKBOOT_POWERON = "android.intent.action.QUICKBOOT_POWERON"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return

        when (action) {
            Intent.ACTION_BOOT_COMPLETED,
            ACTION_QUICKBOOT_POWERON -> {
                Log.d(TAG, "Boot completed, resuming widget updates")
                refreshWidgetsIfActive(context)
            }
            Intent.ACTION_DATE_CHANGED -> {
                Log.d(TAG, "Date changed, refreshing widgets for new day")
                refreshWidgetsIfActive(context)
            }
            Intent.ACTION_TIME_CHANGED -> {
                Log.d(TAG, "System time changed, refreshing widgets")
                refreshWidgetsIfActive(context)
            }
            Intent.ACTION_TIMEZONE_CHANGED -> {
                Log.d(TAG, "Timezone changed, refreshing widgets")
                refreshWidgetsIfActive(context)
            }
        }
    }

    private fun refreshWidgetsIfActive(context: Context) {
        try {
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val widgetIds = appWidgetManager.getAppWidgetIds(
                ComponentName(context, PrayerWidgetProvider::class.java)
            )

            if (widgetIds.isNotEmpty()) {
                Log.d(TAG, "Found ${widgetIds.size} active widgets, refreshing")

                // Resume per-second updates and all safety nets
                WidgetUpdateReceiver.ensureUpdatesActive(context)
            } else {
                Log.d(TAG, "No active widgets found, skipping refresh")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error in refreshWidgetsIfActive: ${e.message}", e)
        }
    }
}
