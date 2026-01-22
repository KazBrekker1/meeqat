package com.meeqat.plugin.prayerservice

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import android.util.Log

/**
 * BroadcastReceiver that handles scheduled widget updates.
 * Uses AlarmManager.setExactAndAllowWhileIdle() to ensure updates
 * happen even when the device is in Doze mode.
 */
class WidgetUpdateReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "WidgetUpdateReceiver"
        const val ACTION_UPDATE_WIDGET = "com.meeqat.plugin.prayerservice.UPDATE_WIDGET"

        // Update interval in milliseconds (60 seconds for live countdown)
        private const val UPDATE_INTERVAL_MS = 60_000L

        /**
         * Schedule the next widget update alarm.
         * Uses setExactAndAllowWhileIdle to work during Doze mode.
         */
        fun scheduleNextUpdate(context: Context) {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

            val intent = Intent(context, WidgetUpdateReceiver::class.java).apply {
                action = ACTION_UPDATE_WIDGET
            }

            val pendingIntent = PendingIntent.getBroadcast(
                context,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val triggerTime = System.currentTimeMillis() + UPDATE_INTERVAL_MS

            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    // Android 12+ requires checking if we can schedule exact alarms
                    if (alarmManager.canScheduleExactAlarms()) {
                        alarmManager.setExactAndAllowWhileIdle(
                            AlarmManager.RTC_WAKEUP,
                            triggerTime,
                            pendingIntent
                        )
                    } else {
                        // Fall back to inexact alarm
                        alarmManager.setAndAllowWhileIdle(
                            AlarmManager.RTC_WAKEUP,
                            triggerTime,
                            pendingIntent
                        )
                    }
                } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    // Android 6+ supports setExactAndAllowWhileIdle
                    alarmManager.setExactAndAllowWhileIdle(
                        AlarmManager.RTC_WAKEUP,
                        triggerTime,
                        pendingIntent
                    )
                } else {
                    // Older versions use setExact
                    alarmManager.setExact(
                        AlarmManager.RTC_WAKEUP,
                        triggerTime,
                        pendingIntent
                    )
                }

                Log.d(TAG, "Scheduled next widget update for ${triggerTime}ms")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to schedule alarm: ${e.message}", e)
            }
        }

        /**
         * Cancel any pending widget update alarms.
         */
        fun cancelScheduledUpdates(context: Context) {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

            val intent = Intent(context, WidgetUpdateReceiver::class.java).apply {
                action = ACTION_UPDATE_WIDGET
            }

            val pendingIntent = PendingIntent.getBroadcast(
                context,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            alarmManager.cancel(pendingIntent)
            Log.d(TAG, "Cancelled scheduled widget updates")
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        Log.d(TAG, "onReceive: action=${intent.action}")

        when (intent.action) {
            ACTION_UPDATE_WIDGET -> {
                // Acquire a partial wake lock to ensure the update completes
                val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
                val wakeLock = powerManager.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK,
                    "meeqat:widget_update"
                )

                try {
                    wakeLock.acquire(10_000) // 10 second timeout

                    // Update all widgets
                    PrayerWidgetProvider.updateAllWidgets(context)

                    // Schedule the next update
                    scheduleNextUpdate(context)

                    Log.d(TAG, "Widget update completed")
                } catch (e: Exception) {
                    Log.e(TAG, "Error during widget update: ${e.message}", e)
                } finally {
                    if (wakeLock.isHeld) {
                        wakeLock.release()
                    }
                }
            }
        }
    }
}
