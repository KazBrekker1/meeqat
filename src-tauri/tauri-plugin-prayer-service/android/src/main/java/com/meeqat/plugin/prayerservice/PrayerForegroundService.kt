package com.meeqat.plugin.prayerservice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * Foreground service that displays a persistent notification with
 * a countdown timer to the next prayer time
 */
class PrayerForegroundService : Service() {

    companion object {
        private const val TAG = "PrayerForegroundService"
        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "prayer_timer_channel"

        const val PREFS_NAME = "prayer_service_prefs"
        const val KEY_SERVICE_ENABLED = "service_enabled"
        const val KEY_PRAYERS_JSON = "prayers_json"
        const val KEY_NEXT_PRAYER_INDEX = "next_prayer_index"

        const val ACTION_START = "com.meeqat.plugin.prayerservice.ACTION_START"
        const val ACTION_STOP = "com.meeqat.plugin.prayerservice.ACTION_STOP"
        const val ACTION_UPDATE = "com.meeqat.plugin.prayerservice.ACTION_UPDATE"

        const val EXTRA_PRAYERS_JSON = "prayers_json"
        const val EXTRA_NEXT_PRAYER_INDEX = "next_prayer_index"

        var isRunning = false
            private set
    }

    private var prayers: List<PrayerTimeData> = emptyList()
    private var nextPrayerIndex: Int = 0

    private val updateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == ACTION_UPDATE) {
                val prayersJson = intent.getStringExtra(EXTRA_PRAYERS_JSON)
                val index = intent.getIntExtra(EXTRA_NEXT_PRAYER_INDEX, 0)

                if (prayersJson != null) {
                    prayers = parsePrayersJson(prayersJson)
                    nextPrayerIndex = index
                    savePrayerState()
                    updateNotification()
                }
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Service onCreate")
        createNotificationChannel()

        // Register broadcast receiver for updates
        val filter = IntentFilter(ACTION_UPDATE)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(updateReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(updateReceiver, filter)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "Service onStartCommand: action=${intent?.action}")

        when (intent?.action) {
            ACTION_START -> {
                val prayersJson = intent.getStringExtra(EXTRA_PRAYERS_JSON)
                val index = intent.getIntExtra(EXTRA_NEXT_PRAYER_INDEX, 0)

                if (prayersJson != null) {
                    prayers = parsePrayersJson(prayersJson)
                    nextPrayerIndex = index
                } else {
                    // Try to restore from saved state
                    restorePrayerState()
                }

                savePrayerState()
                startForeground(NOTIFICATION_ID, buildNotification())
                isRunning = true
            }
            ACTION_STOP -> {
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_UPDATE -> {
                val prayersJson = intent.getStringExtra(EXTRA_PRAYERS_JSON)
                val index = intent.getIntExtra(EXTRA_NEXT_PRAYER_INDEX, 0)

                if (prayersJson != null) {
                    prayers = parsePrayersJson(prayersJson)
                    nextPrayerIndex = index
                    savePrayerState()
                    updateNotification()
                }
            }
        }

        return START_STICKY
    }

    override fun onDestroy() {
        Log.d(TAG, "Service onDestroy")
        isRunning = false

        try {
            unregisterReceiver(updateReceiver)
        } catch (e: Exception) {
            Log.w(TAG, "Error unregistering receiver: ${e.message}")
        }

        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Prayer Timer",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows countdown to next prayer time"
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }

            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        val nextPrayer = if (prayers.isNotEmpty() && nextPrayerIndex < prayers.size) {
            prayers[nextPrayerIndex]
        } else {
            null
        }

        // Create intent to open the app when notification is tapped
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }

        val pendingIntent = launchIntent?.let {
            PendingIntent.getActivity(
                this,
                0,
                it,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .setShowWhen(true)
            .setContentIntent(pendingIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)

        if (nextPrayer != null) {
            builder.setContentTitle("Next: ${nextPrayer.label}")
            builder.setContentText("${nextPrayer.prayerName} at ${formatTime(nextPrayer.prayerTime)}")

            // Use chronometer for countdown
            builder.setUsesChronometer(true)
            builder.setChronometerCountDown(true)
            builder.setWhen(nextPrayer.prayerTime)
        } else {
            builder.setContentTitle("Meeqat")
            builder.setContentText("Prayer times loading...")
        }

        return builder.build()
    }

    private fun updateNotification() {
        val notification = buildNotification()
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, notification)
    }

    private fun savePrayerState() {
        val prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
        prefs.edit().apply {
            putBoolean(KEY_SERVICE_ENABLED, true)
            putString(KEY_PRAYERS_JSON, prayersToJson(prayers))
            putInt(KEY_NEXT_PRAYER_INDEX, nextPrayerIndex)
            apply()
        }
    }

    private fun restorePrayerState() {
        val prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
        val prayersJson = prefs.getString(KEY_PRAYERS_JSON, null)
        nextPrayerIndex = prefs.getInt(KEY_NEXT_PRAYER_INDEX, 0)

        if (prayersJson != null) {
            prayers = parsePrayersJson(prayersJson)
        }
    }

    private fun clearServiceState() {
        val prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
        prefs.edit().apply {
            putBoolean(KEY_SERVICE_ENABLED, false)
            apply()
        }
    }

    private fun parsePrayersJson(json: String): List<PrayerTimeData> {
        return try {
            val result = mutableListOf<PrayerTimeData>()
            // Simple JSON parsing without external library
            val pattern = """\{"prayerName":"([^"]+)","prayerTime":(\d+),"label":"([^"]+)"\}""".toRegex()
            pattern.findAll(json).forEach { match ->
                val (name, time, label) = match.destructured
                result.add(PrayerTimeData(name, time.toLong(), label))
            }
            result
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing prayers JSON: ${e.message}")
            emptyList()
        }
    }

    private fun prayersToJson(prayers: List<PrayerTimeData>): String {
        return prayers.joinToString(",", "[", "]") { prayer ->
            """{"prayerName":"${prayer.prayerName}","prayerTime":${prayer.prayerTime},"label":"${prayer.label}"}"""
        }
    }

    private fun formatTime(timestamp: Long): String {
        val sdf = java.text.SimpleDateFormat("h:mm a", java.util.Locale.getDefault())
        return sdf.format(java.util.Date(timestamp))
    }
}
