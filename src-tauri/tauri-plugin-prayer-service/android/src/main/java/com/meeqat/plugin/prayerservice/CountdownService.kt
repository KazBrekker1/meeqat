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
import android.os.SystemClock
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * Persistent foreground service that provides per-second widget updates.
 * Runs whenever widgets are active, stops when last widget is removed.
 *
 * Uses a Handler-based 1-second loop to update all widgets.
 * Periodically self-restarts to prevent memory leaks from long-running Handler chains.
 */
class CountdownService : Service() {

    companion object {
        private const val TAG = "CountdownService"
        private const val NOTIFICATION_ID = 2001
        private const val CHANNEL_ID = "countdown_channel"

        // Self-restart after 4 hours to prevent memory leaks from long Handler chains
        private const val MAX_SERVICE_DURATION_MS = 4 * 60 * 60 * 1000L

        /**
         * Start the countdown service.
         */
        fun start(context: Context) {
            Log.d(TAG, "Starting countdown service")
            val intent = Intent(context, CountdownService::class.java)
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start CountdownService: ${e.message}", e)
            }
        }

        /**
         * Stop the countdown service.
         */
        fun stop(context: Context) {
            Log.d(TAG, "Stopping countdown service")
            context.stopService(Intent(context, CountdownService::class.java))
        }
    }

    private val handler = Handler(Looper.getMainLooper())
    private var isRunning = false
    private var serviceStartTime = 0L
    private var tickCount = 0L
    private var cachedPendingIntent: PendingIntent? = null

    private val updateRunnable = object : Runnable {
        override fun run() {
            if (!isRunning) return

            // Periodic reset: re-deliver onStartCommand to reset the Handler chain and
            // serviceStartTime. Since the service is already running, start() just triggers
            // a new onStartCommand (which clears/re-posts callbacks) without destroying the service.
            if (SystemClock.elapsedRealtime() - serviceStartTime > MAX_SERVICE_DURATION_MS) {
                Log.d(TAG, "Resetting Handler chain after ${MAX_SERVICE_DURATION_MS / (1000 * 60 * 60)}h")
                start(this@CountdownService)
                return
            }

            // Update all widgets every second
            PrayerWidgetProvider.updateAllWidgets(this@CountdownService)

            // Update notification less frequently (every 30s) to save battery
            if (tickCount % 30 == 0L) {
                updateNotification()
            }
            tickCount++

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

        serviceStartTime = SystemClock.elapsedRealtime()
        tickCount = 0

        // Start as foreground with notification
        startForeground(NOTIFICATION_ID, createNotification())

        // Start the update loop (remove any prior callbacks to prevent duplicate chains)
        isRunning = true
        handler.removeCallbacks(updateRunnable)
        handler.post(updateRunnable)

        // START_STICKY: Android will restart the service if killed
        return START_STICKY
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
                "Prayer Times",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows next prayer countdown"
                setShowBadge(false)
                enableLights(false)
                enableVibration(false)
            }

            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun updateNotification() {
        try {
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.notify(NOTIFICATION_ID, createNotification())
        } catch (e: Exception) {
            Log.w(TAG, "Failed to update notification: ${e.message}")
        }
    }

    private fun createNotification(): Notification {
        // Cache the PendingIntent to avoid repeated packageManager queries
        val pendingIntent = cachedPendingIntent ?: run {
            val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
            launchIntent?.let {
                PendingIntent.getActivity(
                    this, 0, it,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                ).also { pi -> cachedPendingIntent = pi }
            }
        }

        // Build informative notification with prayer info (single lookup)
        val prayerInfo = PrayerTimeUtils.getNextPrayerInfo(this)
        val prayerName = prayerInfo?.first
        val timeToNext = prayerInfo?.second

        val title: String
        val text: String

        if (prayerName != null && timeToNext != null) {
            title = "Next: $prayerName"
            text = formatCountdownText(timeToNext)
        } else {
            title = "Meeqat"
            text = "Prayer times active"
        }

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_notification)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .build()
    }

    private fun formatCountdownText(timeMs: Long): String {
        return PrayerTimeUtils.formatDuration(timeMs)
    }
}
