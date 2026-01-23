package com.meeqat.plugin.prayerservice

import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * BroadcastReceiver that restarts widget updates after device boot.
 * Ensures widgets continue to update even after a device restart.
 */
class BootReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "PrayerBootReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == "android.intent.action.QUICKBOOT_POWERON") {

            Log.d(TAG, "Boot completed, resuming widget updates")

            // Check if there are any active widgets
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val widgetIds = appWidgetManager.getAppWidgetIds(
                ComponentName(context, PrayerWidgetProvider::class.java)
            )

            if (widgetIds.isNotEmpty()) {
                Log.d(TAG, "Found ${widgetIds.size} active widgets, scheduling updates")

                // Update all widgets immediately (they may have stale data)
                PrayerWidgetProvider.updateAllWidgets(context)

                // Resume periodic widget updates
                WidgetUpdateReceiver.scheduleNextUpdate(context)
            } else {
                Log.d(TAG, "No active widgets found, skipping update scheduling")
            }
        }
    }
}
