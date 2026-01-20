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
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Foreground service that displays a persistent notification with
 * a countdown timer to the next prayer time.
 *
 * Lifecycle:
 * - Started via ACTION_START with prayer data
 * - Updated via ACTION_UPDATE or broadcast receiver
 * - Stopped via ACTION_STOP
 * - Auto-restarts on device boot if previously enabled (via BootReceiver)
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

        // Thread-safe running flag using AtomicBoolean
        private val _isRunning = AtomicBoolean(false)
        val isRunning: Boolean
            get() = _isRunning.get()
    }

    private var prayers: List<PrayerTimeData> = emptyList()
    private var nextPrayerIndex: Int = 0

    // Receiver for prayer time updates via broadcast
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

    // Receiver for system time changes (NTP sync, manual adjustment, timezone change)
    private val timeChangeReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.action) {
                Intent.ACTION_TIME_CHANGED,
                Intent.ACTION_TIMEZONE_CHANGED,
                Intent.ACTION_DATE_CHANGED -> {
                    Log.d(TAG, "System time changed, updating notification")
                    updateNotification()
                }
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Service onCreate")
        createNotificationChannel()

        // Register broadcast receiver for prayer updates
        val updateFilter = IntentFilter(ACTION_UPDATE)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(updateReceiver, updateFilter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(updateReceiver, updateFilter)
        }

        // Register broadcast receiver for system time changes
        val timeFilter = IntentFilter().apply {
            addAction(Intent.ACTION_TIME_CHANGED)
            addAction(Intent.ACTION_TIMEZONE_CHANGED)
            addAction(Intent.ACTION_DATE_CHANGED)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(timeChangeReceiver, timeFilter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(timeChangeReceiver, timeFilter)
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
                    // Try to restore from saved state (e.g., after boot)
                    restorePrayerState()
                }

                savePrayerState()
                startForeground(NOTIFICATION_ID, buildNotification())
                _isRunning.set(true)
            }
            ACTION_STOP -> {
                _isRunning.set(false)
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
        _isRunning.set(false)

        // Safely unregister receivers
        safeUnregisterReceiver(updateReceiver)
        safeUnregisterReceiver(timeChangeReceiver)

        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun safeUnregisterReceiver(receiver: BroadcastReceiver) {
        try {
            unregisterReceiver(receiver)
        } catch (e: IllegalArgumentException) {
            Log.w(TAG, "Receiver not registered: ${e.message}")
        }
    }

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

            getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        val nextPrayer = if (prayers.isNotEmpty() && nextPrayerIndex in prayers.indices) {
            prayers[nextPrayerIndex]
        } else {
            if (prayers.isNotEmpty()) {
                Log.w(TAG, "Invalid prayer index: $nextPrayerIndex (size: ${prayers.size})")
            }
            null
        }

        // Create intent to open the app when notification is tapped
        val launchIntent = try {
            packageManager.getLaunchIntentForPackage(packageName)?.apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get launch intent: ${e.message}")
            null
        }

        val pendingIntent = launchIntent?.let {
            PendingIntent.getActivity(
                this,
                0,
                it,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        // Use app's launcher icon for notification
        val iconResId = try {
            resources.getIdentifier("ic_launcher", "mipmap", packageName).takeIf { it != 0 }
                ?: android.R.drawable.ic_dialog_info
        } catch (e: Exception) {
            android.R.drawable.ic_dialog_info
        }

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(iconResId)
            .setOngoing(true)
            .setShowWhen(true)
            .setContentIntent(pendingIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)

        if (nextPrayer != null) {
            builder.setContentTitle("Next: ${nextPrayer.label}")
            builder.setContentText("${nextPrayer.prayerName} at ${formatTime(nextPrayer.prayerTime)}")

            // Use chronometer for countdown - Android handles the display automatically
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
        getSystemService(NotificationManager::class.java)?.notify(NOTIFICATION_ID, notification)
            ?: Log.e(TAG, "NotificationManager is null, cannot update notification")
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

    /**
     * Parse prayers JSON using Android's built-in JSONArray/JSONObject.
     * Expected format: [{"prayerName":"Fajr","prayerTime":1234567890,"label":"Fajr"}]
     */
    private fun parsePrayersJson(json: String): List<PrayerTimeData> {
        return try {
            val result = mutableListOf<PrayerTimeData>()
            val jsonArray = JSONArray(json)

            for (i in 0 until jsonArray.length()) {
                val obj = jsonArray.getJSONObject(i)
                val prayerName = obj.getString("prayerName")
                val prayerTime = obj.getLong("prayerTime")
                val label = obj.getString("label")
                result.add(PrayerTimeData(prayerName, prayerTime, label))
            }

            Log.d(TAG, "Parsed ${result.size} prayers from JSON")
            result
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing prayers JSON: ${e.message}", e)
            emptyList()
        }
    }

    /**
     * Convert prayers list to JSON string using Android's built-in JSONArray/JSONObject.
     */
    private fun prayersToJson(prayers: List<PrayerTimeData>): String {
        return try {
            val jsonArray = JSONArray()
            for (prayer in prayers) {
                val obj = JSONObject().apply {
                    put("prayerName", prayer.prayerName)
                    put("prayerTime", prayer.prayerTime)
                    put("label", prayer.label)
                }
                jsonArray.put(obj)
            }
            jsonArray.toString()
        } catch (e: Exception) {
            Log.e(TAG, "Error converting prayers to JSON: ${e.message}", e)
            "[]"
        }
    }

    private fun formatTime(timestamp: Long): String {
        val sdf = java.text.SimpleDateFormat("h:mm a", java.util.Locale.getDefault())
        return sdf.format(java.util.Date(timestamp))
    }
}
