package com.meeqat.plugin.prayerservice

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import android.util.Log
import org.json.JSONArray

/**
 * BroadcastReceiver that handles scheduled widget updates.
 * Uses AlarmManager.setExactAndAllowWhileIdle() to ensure updates
 * happen even when the device is in Doze mode.
 *
 * For per-second updates in the final minute, starts CountdownService.
 */
class WidgetUpdateReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "WidgetUpdateReceiver"
        const val ACTION_UPDATE_WIDGET = "com.meeqat.plugin.prayerservice.UPDATE_WIDGET"
        const val ACTION_START_COUNTDOWN = "com.meeqat.plugin.prayerservice.START_COUNTDOWN"
        private const val REQUEST_CODE_MINUTE = 1001
        private const val REQUEST_CODE_COUNTDOWN = 1002

        /**
         * Schedule the next widget update alarm.
         * Uses setExactAndAllowWhileIdle to work during Doze mode.
         *
         * When <= 1 minute remains until next prayer, starts CountdownService
         * for reliable per-second updates.
         */
        fun scheduleNextUpdate(context: Context) {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val now = DebugTimeProvider.currentTimeMillis(context)
            val nextPrayerTime = getNextPrayerTime(context)

            // If within countdown threshold, start the countdown service
            if (nextPrayerTime != null) {
                val timeToNextPrayer = nextPrayerTime - now
                if (timeToNextPrayer in 1..CountdownService.COUNTDOWN_THRESHOLD_MS) {
                    cancelCountdownAlarm(context, alarmManager)
                    Log.d(TAG, "Within countdown threshold: ${timeToNextPrayer}ms, starting CountdownService")
                    try {
                        CountdownService.startIfNeeded(context)
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to start CountdownService: ${e.message}", e)
                    }
                } else if (timeToNextPrayer > CountdownService.COUNTDOWN_THRESHOLD_MS) {
                    val countdownStartTime = nextPrayerTime - CountdownService.COUNTDOWN_THRESHOLD_MS
                    if (countdownStartTime > now) {
                        scheduleSingleAlarm(
                            context,
                            alarmManager,
                            countdownStartTime,
                            ACTION_START_COUNTDOWN,
                            REQUEST_CODE_COUNTDOWN
                        )
                        Log.d(TAG, "Scheduled countdown start at: ${countdownStartTime}ms")
                    } else {
                        cancelCountdownAlarm(context, alarmManager)
                    }
                }
            } else {
                cancelCountdownAlarm(context, alarmManager)
            }

            // Always schedule next minute update as backup
            val triggerTime = ((now / 60_000) + 1) * 60_000
            scheduleSingleAlarm(
                context,
                alarmManager,
                triggerTime,
                ACTION_UPDATE_WIDGET,
                REQUEST_CODE_MINUTE
            )
            Log.d(TAG, "Scheduled next widget update at minute boundary: ${triggerTime}ms")
        }

        /**
         * Schedule a single alarm at the given time.
         */
        private fun scheduleSingleAlarm(
            context: Context,
            alarmManager: AlarmManager,
            triggerTime: Long,
            action: String,
            requestCode: Int
        ) {
            val intent = Intent(context, WidgetUpdateReceiver::class.java).apply {
                this.action = action
            }

            val pendingIntent = PendingIntent.getBroadcast(
                context,
                requestCode,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    if (alarmManager.canScheduleExactAlarms()) {
                        alarmManager.setExactAndAllowWhileIdle(
                            AlarmManager.RTC_WAKEUP,
                            triggerTime,
                            pendingIntent
                        )
                    } else {
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

        private fun cancelCountdownAlarm(context: Context, alarmManager: AlarmManager) {
            val countdownIntent = Intent(context, WidgetUpdateReceiver::class.java).apply {
                action = ACTION_START_COUNTDOWN
            }
            val countdownPendingIntent = PendingIntent.getBroadcast(
                context,
                REQUEST_CODE_COUNTDOWN,
                countdownIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            alarmManager.cancel(countdownPendingIntent)
        }

        /**
         * Get time remaining until the next prayer in milliseconds.
         * Returns null if no prayer data is available or all prayers have passed.
         */
        private fun getNextPrayerTime(context: Context): Long? {
            try {
                val prefs = context.getSharedPreferences(
                    PrayerWidgetProvider.PREFS_NAME,
                    Context.MODE_PRIVATE
                )
                val prayersJson = prefs.getString(PrayerWidgetProvider.KEY_PRAYERS_JSON, null)
                    ?: return null

                val now = DebugTimeProvider.currentTimeMillis(context)
                val jsonArray = JSONArray(prayersJson)

                // Find the first prayer that hasn't passed yet
                for (i in 0 until jsonArray.length()) {
                    val obj = jsonArray.getJSONObject(i)
                    val prayerTime = obj.getLong("prayerTime")
                    if (prayerTime > now) {
                        return prayerTime
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error getting next prayer time: ${e.message}", e)
            }
            return null
        }

        /**
         * Cancel any pending widget update alarms.
         */
        fun cancelScheduledUpdates(context: Context) {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

            val minuteIntent = Intent(context, WidgetUpdateReceiver::class.java).apply {
                action = ACTION_UPDATE_WIDGET
            }
            val minutePendingIntent = PendingIntent.getBroadcast(
                context,
                REQUEST_CODE_MINUTE,
                minuteIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            alarmManager.cancel(minutePendingIntent)

            cancelCountdownAlarm(context, alarmManager)

            // Also stop countdown service if running
            CountdownService.stop(context)

            Log.d(TAG, "Cancelled all scheduled widget updates")
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

                    // Schedule the next update (may start CountdownService if within threshold)
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
            ACTION_START_COUNTDOWN -> {
                val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
                val wakeLock = powerManager.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK,
                    "meeqat:countdown_start"
                )

                try {
                    wakeLock.acquire(10_000)
                    CountdownService.startIfNeeded(context)
                    PrayerWidgetProvider.updateAllWidgets(context)
                    scheduleNextUpdate(context)
                    Log.d(TAG, "Countdown start handled")
                } catch (e: Exception) {
                    Log.e(TAG, "Error during countdown start: ${e.message}", e)
                } finally {
                    if (wakeLock.isHeld) {
                        wakeLock.release()
                    }
                }
            }
        }
    }
}
