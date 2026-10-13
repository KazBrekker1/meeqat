package com.meeqat.plugin.prayerservice

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * BroadcastReceiver that restarts widget updates after device boot,
 * and refreshes widgets when the system time, date, or timezone changes.
 *
 * Handles:
 * - BOOT_COMPLETED / QUICKBOOT_POWERON: alarms don't survive a reboot
 * - DATE_CHANGED: midnight rollover (also covered by the boundary alarm)
 * - TIME_SET: user manually changed clock or NTP sync
 * - TIMEZONE_CHANGED: the day, the clock times and the next midnight all shift
 *
 * Each one redraws every widget in full and re-aims the alarms: the countdown's
 * base and the boundary alarm were both computed from the old clock.
 */
class BootReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "PrayerBootReceiver"
        private const val ACTION_QUICKBOOT_POWERON = "android.intent.action.QUICKBOOT_POWERON"
    }

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED,
            ACTION_QUICKBOOT_POWERON,
            Intent.ACTION_DATE_CHANGED,
            Intent.ACTION_TIME_CHANGED,
            Intent.ACTION_TIMEZONE_CHANGED -> {
                Log.d(TAG, "${intent.action}: refreshing widgets")
                try {
                    // Both are no-ops (and schedule nothing) when no widget is placed.
                    PrayerWidgetProvider.updateAllWidgets(context)
                    WidgetUpdateReceiver.ensureUpdatesActive(context)
                } catch (e: Exception) {
                    Log.e(TAG, "Error refreshing widgets: ${e.message}", e)
                }
            }
        }
    }
}
