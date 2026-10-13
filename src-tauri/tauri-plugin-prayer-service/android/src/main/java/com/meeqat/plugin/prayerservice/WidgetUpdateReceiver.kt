package com.meeqat.plugin.prayerservice

import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.SystemClock
import android.util.Log

/**
 * Keeps the widgets current without anything running in between.
 *
 * The countdown and the clock tick by themselves (Chronometer / TextClock), so the
 * widget only needs a full redraw when something else changes:
 *
 * - **Boundary alarm** — one exact alarm at the next prayer time or local midnight,
 *   whichever comes first. The only thing here that wakes the device (a handful of
 *   times a day), so the next prayer is already showing when the screen comes on.
 * - **Periodic alarm** — a non-wakeup repeating alarm that moves the orbit's
 *   now-dot, pill text, progress bar and "since" line along. It never wakes the
 *   device; one that came due during sleep is delivered as the device wakes up.
 * - Safety nets: the provider's `updatePeriodMillis` and [WidgetKeepAliveWorker]
 *   re-arm both alarms should they ever be lost.
 *
 * Everything is gated on a widget actually being placed.
 */
class WidgetUpdateReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "WidgetUpdateReceiver"
        const val ACTION_UPDATE_WIDGET = "com.meeqat.plugin.prayerservice.UPDATE_WIDGET"
        private const val ACTION_PERIODIC_UPDATE = "com.meeqat.plugin.prayerservice.PERIODIC_UPDATE"
        private const val REQUEST_CODE_BOUNDARY = 1001
        private const val REQUEST_CODE_PERIODIC = 1002

        // The orbit pill ("Isha in 1h 12m") is baked into the bitmap, so it is only as
        // fresh as the last redraw. Inexact: the system may batch it up to ~75% later.
        private const val PERIODIC_INTERVAL_MS = 3 * 60 * 1000L

        // Notification channel of the per-second foreground service older versions ran.
        private const val LEGACY_CHANNEL_ID = "countdown_channel"
        private const val KEY_LEGACY_CLEANED = "legacy_countdown_cleaned"

        /**
         * Arm (or re-arm) the alarms and the keep-alive worker — or tear everything
         * down when there is nothing to keep current: no widget placed, or no next
         * prayer to count down to (no data yet / stored window exhausted; the widget
         * then shows a static message until the app pushes data, which calls this again).
         */
        fun ensureUpdatesActive(context: Context) {
            removeLegacyChannel(context)
            if (!PrayerWidgetProvider.hasWidgets(context) || !scheduleBoundary(context)) {
                cancelScheduledUpdates(context)
                return
            }
            schedulePeriodic(context)
            WidgetKeepAliveWorker.enqueue(context)
        }

        /**
         * Schedule the exact alarm for the next moment the widget's content changes.
         * Returns false (and schedules nothing) when there is no upcoming prayer.
         */
        private fun scheduleBoundary(context: Context): Boolean {
            val now = DebugTimeProvider.currentTimeMillis(context)
            val next = PrayerTimeUtils.resolveSchedule(context, now)?.next ?: return false
            val boundary = minOf(next.prayerTime, PrayerTimeUtils.nextLocalMidnight(now))
            // AlarmManager runs on the real clock, not the debug-shifted one.
            val triggerTime = System.currentTimeMillis() + (boundary - now)

            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val pendingIntent = alarmPendingIntent(context, ACTION_UPDATE_WIDGET, REQUEST_CODE_BOUNDARY)
            try {
                val exactAllowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager.canScheduleExactAlarms()
                try {
                    if (exactAllowed) {
                        alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerTime, pendingIntent)
                        return true
                    }
                } catch (e: SecurityException) {
                    // Permission revoked between the check and the call — fall through.
                }
                // Exact alarms denied (Android 12+): the boundary may land a little late;
                // the periodic redraw still catches up while the device is awake.
                Log.w(TAG, "Exact alarm permission not granted, falling back to inexact alarm")
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerTime, pendingIntent)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to schedule boundary alarm: ${e.message}", e)
            }
            return true
        }

        private fun schedulePeriodic(context: Context) {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            try {
                // ELAPSED_REALTIME (not _WAKEUP): never wakes the device.
                alarmManager.setRepeating(
                    AlarmManager.ELAPSED_REALTIME,
                    SystemClock.elapsedRealtime() + PERIODIC_INTERVAL_MS,
                    PERIODIC_INTERVAL_MS,
                    alarmPendingIntent(context, ACTION_PERIODIC_UPDATE, REQUEST_CODE_PERIODIC)
                )
            } catch (e: Exception) {
                Log.e(TAG, "Failed to schedule periodic alarm: ${e.message}", e)
            }
        }

        private fun alarmPendingIntent(context: Context, action: String, requestCode: Int): PendingIntent {
            val intent = Intent(context, WidgetUpdateReceiver::class.java).apply {
                this.action = action
            }
            return PendingIntent.getBroadcast(
                context,
                requestCode,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        /**
         * Cancel the alarms and the keep-alive worker.
         */
        fun cancelScheduledUpdates(context: Context) {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            alarmManager.cancel(alarmPendingIntent(context, ACTION_UPDATE_WIDGET, REQUEST_CODE_BOUNDARY))
            alarmManager.cancel(alarmPendingIntent(context, ACTION_PERIODIC_UPDATE, REQUEST_CODE_PERIODIC))
            WidgetKeepAliveWorker.cancel(context)
            Log.d(TAG, "Cancelled all scheduled widget updates")
        }

        /** One-time: drop the "Prayer Times" countdown channel the old service created. */
        private fun removeLegacyChannel(context: Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val prefs = context.getSharedPreferences(PrayerWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
            if (prefs.getBoolean(KEY_LEGACY_CLEANED, false)) return
            try {
                context.getSystemService(NotificationManager::class.java)
                    ?.deleteNotificationChannel(LEGACY_CHANNEL_ID)
            } catch (e: Exception) {
                Log.w(TAG, "Failed to remove legacy channel: ${e.message}")
            }
            prefs.edit().putBoolean(KEY_LEGACY_CLEANED, true).apply()
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            ACTION_UPDATE_WIDGET -> {
                // A prayer time or midnight has passed: redraw, then aim at the next one
                // (or stand down if the last widget is gone / the window just ran out).
                PrayerWidgetProvider.updateAllWidgets(context)
                ensureUpdatesActive(context)
            }
            ACTION_PERIODIC_UPDATE -> {
                if (!PrayerWidgetProvider.hasWidgets(context)) {
                    cancelScheduledUpdates(context)
                    return
                }
                PrayerWidgetProvider.updateAllWidgets(context)
            }
        }
    }
}
