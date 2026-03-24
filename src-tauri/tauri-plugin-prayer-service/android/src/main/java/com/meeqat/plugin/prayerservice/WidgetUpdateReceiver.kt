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
 * BroadcastReceiver that serves as a safety net for the CountdownService.
 * Schedules periodic minute-boundary alarms to ensure the CountdownService
 * is restarted if killed by the system.
 *
 * The CountdownService is the primary update mechanism (per-second updates).
 * This receiver just ensures it stays alive.
 */
class WidgetUpdateReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "WidgetUpdateReceiver"
        const val ACTION_UPDATE_WIDGET = "com.meeqat.plugin.prayerservice.UPDATE_WIDGET"
        private const val REQUEST_CODE_MINUTE = 1001

        /**
         * Schedule the next safety-net alarm at the next minute boundary.
         * This alarm ensures CountdownService is restarted if killed.
         */
        fun scheduleNextUpdate(context: Context) {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            // Use real system time — AlarmManager operates on wall-clock time, not debug time
            val now = System.currentTimeMillis()

            val triggerTime = ((now / 60_000) + 1) * 60_000
            scheduleSingleAlarm(context, alarmManager, triggerTime)
            Log.d(TAG, "Scheduled safety-net alarm at minute boundary: ${triggerTime}ms")
        }

        /**
         * Ensure the per-second service and safety-net alarms are both active.
         * Consolidates the pattern used across BootReceiver, PrayerServicePlugin,
         * PrayerWidgetProvider, and WidgetKeepAliveWorker.
         */
        fun ensureUpdatesActive(context: Context) {
            CountdownService.start(context)
            scheduleNextUpdate(context)
            WidgetKeepAliveWorker.enqueue(context)
        }

        private fun getAlarmPendingIntent(context: Context): PendingIntent {
            val intent = Intent(context, WidgetUpdateReceiver::class.java).apply {
                action = ACTION_UPDATE_WIDGET
            }
            return PendingIntent.getBroadcast(
                context,
                REQUEST_CODE_MINUTE,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        private fun scheduleSingleAlarm(
            context: Context,
            alarmManager: AlarmManager,
            triggerTime: Long
        ) {
            val pendingIntent = getAlarmPendingIntent(context)

            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    if (alarmManager.canScheduleExactAlarms()) {
                        alarmManager.setExactAndAllowWhileIdle(
                            AlarmManager.RTC_WAKEUP,
                            triggerTime,
                            pendingIntent
                        )
                    } else {
                        Log.w(TAG, "Exact alarm permission not granted, falling back to inexact alarm")
                        alarmManager.setAndAllowWhileIdle(
                            AlarmManager.RTC_WAKEUP,
                            triggerTime,
                            pendingIntent
                        )
                    }
                } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    alarmManager.setExactAndAllowWhileIdle(
                        AlarmManager.RTC_WAKEUP,
                        triggerTime,
                        pendingIntent
                    )
                } else {
                    alarmManager.setExact(
                        AlarmManager.RTC_WAKEUP,
                        triggerTime,
                        pendingIntent
                    )
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to schedule alarm: ${e.message}", e)
            }
        }

        /**
         * Cancel any pending widget update alarms and stop CountdownService.
         */
        fun cancelScheduledUpdates(context: Context) {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            alarmManager.cancel(getAlarmPendingIntent(context))

            CountdownService.stop(context)

            Log.d(TAG, "Cancelled all scheduled widget updates")
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        Log.d(TAG, "onReceive: action=${intent.action}")

        if (intent.action == ACTION_UPDATE_WIDGET) {
            val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            val wakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "meeqat:widget_update"
            )

            try {
                wakeLock.acquire(10_000) // 10 second timeout

                // Ensure CountdownService is running (restarts if killed) and schedule next alarm
                ensureUpdatesActive(context)

                // Update all widgets immediately as well
                PrayerWidgetProvider.updateAllWidgets(context)

                Log.d(TAG, "Safety-net update completed, service ensured running")
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
