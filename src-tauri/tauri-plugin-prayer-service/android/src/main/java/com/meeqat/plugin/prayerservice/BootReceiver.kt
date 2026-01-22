package com.meeqat.plugin.prayerservice

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * BroadcastReceiver that restarts the prayer service after device boot
 */
class BootReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "PrayerBootReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == "android.intent.action.QUICKBOOT_POWERON") {

            Log.d(TAG, "Boot completed, checking if service should restart")

            val prefs = context.getSharedPreferences(
                PrayerForegroundService.PREFS_NAME,
                Context.MODE_PRIVATE
            )

            val shouldRestart = prefs.getBoolean(PrayerForegroundService.KEY_SERVICE_ENABLED, false)

            if (shouldRestart) {
                Log.d(TAG, "Service was running before reboot, restarting...")

                val serviceIntent = Intent(context, PrayerForegroundService::class.java).apply {
                    action = PrayerForegroundService.ACTION_START
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent)
                } else {
                    context.startService(serviceIntent)
                }
            } else {
                Log.d(TAG, "Service was not running before reboot, not restarting")
            }

            // Always update widgets on boot (they may have stale data)
            PrayerWidgetProvider.updateAllWidgets(context)
        }
    }
}
