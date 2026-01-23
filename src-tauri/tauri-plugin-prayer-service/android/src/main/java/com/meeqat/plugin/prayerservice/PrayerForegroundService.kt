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
        const val KEY_HIJRI_DATE = "hijri_date"
        const val KEY_GREGORIAN_DATE = "gregorian_date"

        const val ACTION_START = "com.meeqat.plugin.prayerservice.ACTION_START"
        const val ACTION_STOP = "com.meeqat.plugin.prayerservice.ACTION_STOP"
        const val ACTION_UPDATE = "com.meeqat.plugin.prayerservice.ACTION_UPDATE"

        const val EXTRA_PRAYERS_JSON = "prayers_json"
        const val EXTRA_NEXT_PRAYER_INDEX = "next_prayer_index"
        const val EXTRA_HIJRI_DATE = "hijri_date"
        const val EXTRA_GREGORIAN_DATE = "gregorian_date"

        // Thread-safe running flag using AtomicBoolean
        private val _isRunning = AtomicBoolean(false)
        val isRunning: Boolean
            get() = _isRunning.get()
    }

    private var prayers: List<PrayerTimeData> = emptyList()
    private var nextPrayerIndex: Int = 0
    private var hijriDate: String? = null
    private var gregorianDate: String? = null

    // Receiver for prayer time updates via broadcast
    private val updateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == ACTION_UPDATE) {
                val prayersJson = intent.getStringExtra(EXTRA_PRAYERS_JSON)
                val index = intent.getIntExtra(EXTRA_NEXT_PRAYER_INDEX, 0)

                if (prayersJson != null) {
                    prayers = parsePrayersJson(prayersJson)
                    nextPrayerIndex = index
                    intent.getStringExtra(EXTRA_HIJRI_DATE)?.let { hijriDate = it }
                    intent.getStringExtra(EXTRA_GREGORIAN_DATE)?.let { gregorianDate = it }
                    savePrayerState()
                    updateNotification()
                }
            }
        }
    }

    // Receiver for system time changes (NTP sync, manual adjustment, timezone change)
    // and minute ticks for precise widget updates
    private val timeChangeReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.action) {
                Intent.ACTION_TIME_TICK -> {
                    // Minute tick - update widget only (no log spam)
                    PrayerWidgetProvider.updateAllWidgets(context)
                }
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

        // Register broadcast receiver for system time changes and minute ticks
        val timeFilter = IntentFilter().apply {
            addAction(Intent.ACTION_TIME_TICK)      // Fires every minute at :00 seconds (screen on only)
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
                    intent.getStringExtra(EXTRA_HIJRI_DATE)?.let { hijriDate = it }
                    intent.getStringExtra(EXTRA_GREGORIAN_DATE)?.let { gregorianDate = it }
                } else {
                    // Try to restore from saved state (e.g., after boot)
                    restorePrayerState()
                }

                savePrayerState()
                startForeground(NOTIFICATION_ID, buildNotification())
                _isRunning.set(true)

                // Schedule periodic widget updates via AlarmManager
                // This ensures updates happen even in Doze mode
                WidgetUpdateReceiver.scheduleNextUpdate(this)
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
                    intent.getStringExtra(EXTRA_HIJRI_DATE)?.let { hijriDate = it }
                    intent.getStringExtra(EXTRA_GREGORIAN_DATE)?.let { gregorianDate = it }
                    savePrayerState()
                    updateNotification()

                    // Reschedule widget updates to ensure they continue
                    WidgetUpdateReceiver.scheduleNextUpdate(this)
                }
            }
            else -> {
                // Service restarted by system after being killed (START_STICKY)
                // Restore state and resume operation
                Log.d(TAG, "Service restarted by system, restoring state")
                restorePrayerState()

                if (prayers.isNotEmpty()) {
                    startForeground(NOTIFICATION_ID, buildNotification())
                    _isRunning.set(true)

                    // Resume widget updates
                    WidgetUpdateReceiver.scheduleNextUpdate(this)
                } else {
                    Log.w(TAG, "No prayer data to restore, stopping service")
                    stopSelf()
                    return START_NOT_STICKY
                }
            }
        }

        return START_STICKY
    }

    override fun onDestroy() {
        Log.d(TAG, "Service onDestroy")
        _isRunning.set(false)

        // Cancel scheduled widget update alarms
        WidgetUpdateReceiver.cancelScheduledUpdates(this)

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

        // Use dedicated notification icon for status bar (white silhouette)
        // Falls back to ic_launcher if ic_notification not found
        val iconResId = try {
            resources.getIdentifier("ic_notification", "drawable", packageName).takeIf { it != 0 }
                ?: resources.getIdentifier("ic_launcher", "mipmap", packageName).takeIf { it != 0 }
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
        // Check if we need to advance to the next prayer
        checkAndAdvancePrayerIndex()

        val notification = buildNotification()
        getSystemService(NotificationManager::class.java)?.notify(NOTIFICATION_ID, notification)
            ?: Log.e(TAG, "NotificationManager is null, cannot update notification")

        // Also update home screen widgets
        PrayerWidgetProvider.updateAllWidgets(this)
    }

    /**
     * Check if the current "next prayer" has passed and advance to the actual next prayer.
     * This handles the case where the app is in background and prayer time passes.
     */
    private fun checkAndAdvancePrayerIndex() {
        if (prayers.isEmpty()) return

        val now = System.currentTimeMillis()

        // If current next prayer hasn't passed, nothing to do
        if (nextPrayerIndex in prayers.indices && prayers[nextPrayerIndex].prayerTime > now) {
            return
        }

        // Find the first prayer that hasn't passed yet
        var newIndex = -1
        for (i in prayers.indices) {
            if (prayers[i].prayerTime > now) {
                newIndex = i
                break
            }
        }

        // If found a new next prayer, update the index
        if (newIndex >= 0 && newIndex != nextPrayerIndex) {
            Log.d(TAG, "Advancing prayer index from $nextPrayerIndex to $newIndex")
            nextPrayerIndex = newIndex
            savePrayerState()
        } else if (newIndex < 0 && nextPrayerIndex != prayers.lastIndex) {
            // All prayers have passed - set to last prayer (end of day state)
            Log.d(TAG, "All prayers passed, setting index to last prayer")
            nextPrayerIndex = prayers.lastIndex
            savePrayerState()
        }
    }

    private fun savePrayerState() {
        val prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
        prefs.edit().apply {
            putBoolean(KEY_SERVICE_ENABLED, true)
            putString(KEY_PRAYERS_JSON, prayersToJson(prayers))
            putInt(KEY_NEXT_PRAYER_INDEX, nextPrayerIndex)
            hijriDate?.let { putString(KEY_HIJRI_DATE, it) }
            gregorianDate?.let { putString(KEY_GREGORIAN_DATE, it) }
            apply()
        }

        // Update home screen widgets with new prayer data
        PrayerWidgetProvider.updateAllWidgets(this)
    }

    private fun restorePrayerState() {
        val prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
        val prayersJson = prefs.getString(KEY_PRAYERS_JSON, null)
        nextPrayerIndex = prefs.getInt(KEY_NEXT_PRAYER_INDEX, 0)
        hijriDate = prefs.getString(KEY_HIJRI_DATE, null)
        gregorianDate = prefs.getString(KEY_GREGORIAN_DATE, null)

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
