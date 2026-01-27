package com.meeqat.plugin.prayerservice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * Lightweight foreground service that only runs during the final minute
 * before a prayer to provide reliable per-second widget updates.
 *
 * This service automatically stops once the prayer time passes.
 */
class CountdownService : Service() {

    companion object {
        private const val TAG = "CountdownService"
        private const val NOTIFICATION_ID = 2001
        private const val CHANNEL_ID = "countdown_channel"

        // Threshold to start the service (60 seconds)
        const val COUNTDOWN_THRESHOLD_MS = 60_000L

        /**
         * Start the countdown service if within threshold of next prayer.
         */
        fun startIfNeeded(context: Context) {
            val timeToNextPrayer = getTimeToNextPrayer(context)

            if (timeToNextPrayer != null && timeToNextPrayer in 1..COUNTDOWN_THRESHOLD_MS) {
                Log.d(TAG, "Starting countdown service: ${timeToNextPrayer}ms to prayer")
                val intent = Intent(context, CountdownService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            }
        }

        /**
         * Stop the countdown service.
         */
        fun stop(context: Context) {
            Log.d(TAG, "Stopping countdown service")
            context.stopService(Intent(context, CountdownService::class.java))
        }

        private fun getTimeToNextPrayer(context: Context): Long? {
            return PrayerTimeUtils.getTimeToNextPrayer(context)
        }
    }

    private val handler = Handler(Looper.getMainLooper())
    private var isRunning = false

    private val updateRunnable = object : Runnable {
        override fun run() {
            if (!isRunning) return

            val timeToNextPrayer = getTimeToNextPrayer(this@CountdownService)

            if (timeToNextPrayer == null || timeToNextPrayer <= 0) {
                // Prayer time has passed - refresh widget to show new state, reschedule alarms, then stop
                Log.d(TAG, "Prayer time passed, refreshing widget and stopping service")
                PrayerWidgetProvider.updateAllWidgets(this@CountdownService)
                WidgetUpdateReceiver.scheduleNextUpdate(this@CountdownService)
                stopSelf()
                return
            }

            if (timeToNextPrayer > COUNTDOWN_THRESHOLD_MS) {
                // We're outside the countdown window - refresh widget and stop
                Log.d(TAG, "Outside countdown window, refreshing widget and stopping service")
                PrayerWidgetProvider.updateAllWidgets(this@CountdownService)
                WidgetUpdateReceiver.scheduleNextUpdate(this@CountdownService)
                stopSelf()
                return
            }

            // Update widgets
            PrayerWidgetProvider.updateAllWidgets(this@CountdownService)

            // Schedule next update in 1 second
            handler.postDelayed(this, 1000)
        }
    }

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Service created")
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "Service started")

        // Start as foreground with minimal notification
        startForeground(NOTIFICATION_ID, createNotification())

        // Start the update loop (remove any prior callbacks to prevent duplicate chains)
        isRunning = true
        handler.removeCallbacks(updateRunnable)
        handler.post(updateRunnable)

        return START_NOT_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "Service destroyed")
        isRunning = false
        handler.removeCallbacks(updateRunnable)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Prayer Countdown",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows during final minute before prayer"
                setShowBadge(false)
                enableLights(false)
                enableVibration(false)
            }

            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        // Create intent to open app when notification is tapped
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = if (launchIntent != null) {
            PendingIntent.getActivity(
                this,
                0,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        } else null

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Prayer time approaching")
            .setContentText("Countdown in progress...")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .build()
    }
}
