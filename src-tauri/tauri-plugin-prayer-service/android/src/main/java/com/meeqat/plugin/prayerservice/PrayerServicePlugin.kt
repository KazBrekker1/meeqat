package com.meeqat.plugin.prayerservice

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONArray
import org.json.JSONObject

@InvokeArg
class SetMockTimeOffsetArgs {
    var offsetMs: Long = 0
}

// Note: StartServiceArgs and UpdatePrayerTimesArgs are intentionally identical.
// Tauri's @InvokeArg annotation and parseArgs() deserialize by class type,
// so we cannot unify them via typealias or inheritance.
@InvokeArg
class StartServiceArgs {
    lateinit var prayers: Array<PrayerArg>
    var nextPrayerIndex: Int = 0
    var hijriDate: String? = null
    var gregorianDate: String? = null
    var nextDayPrayerName: String? = null
    var nextDayPrayerTime: Long? = null
    var nextDayPrayerLabel: String? = null
    var city: String? = null
    var countryCode: String? = null
}

@InvokeArg
class UpdatePrayerTimesArgs {
    lateinit var prayers: Array<PrayerArg>
    var nextPrayerIndex: Int = 0
    var hijriDate: String? = null
    var gregorianDate: String? = null
    var nextDayPrayerName: String? = null
    var nextDayPrayerTime: Long? = null
    var nextDayPrayerLabel: String? = null
    var city: String? = null
    var countryCode: String? = null
}

@InvokeArg
class PrayerArg {
    lateinit var prayerName: String
    var prayerTime: Long = 0
    lateinit var label: String
}

@TauriPlugin
class PrayerServicePlugin(private val activity: Activity) : Plugin(activity) {

    private val appContext: Context get() = activity.applicationContext

    companion object {
        private const val TAG = "PrayerServicePlugin"
    }

    /**
     * Save prayer data to SharedPreferences and trigger widget update.
     * This replaces the old foreground service - now widgets work independently.
     */
    @Command
    fun startService(invoke: Invoke) {
        try {
            Log.d(TAG, "startService called (widget-only mode)")

            val args = invoke.parseArgs(StartServiceArgs::class.java)
            savePrayerData(args.prayers, args.nextPrayerIndex, args.hijriDate, args.gregorianDate, args.nextDayPrayerName, args.nextDayPrayerTime, args.nextDayPrayerLabel, args.city, args.countryCode)

            // Update all widgets immediately
            PrayerWidgetProvider.updateAllWidgets(appContext)

            // Schedule periodic widget updates
            WidgetUpdateReceiver.scheduleNextUpdate(appContext)

            invoke.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "Error saving prayer data: ${e.message}", e)
            invoke.reject("Failed to save prayer data: ${e.message}")
        }
    }

    /**
     * No-op - service no longer exists.
     * Widgets continue to run independently via AlarmManager.
     */
    @Command
    fun stopService(invoke: Invoke) {
        Log.d(TAG, "stopService called (no-op, widgets continue independently)")
        invoke.resolve()
    }

    /**
     * Update prayer times in SharedPreferences and refresh widgets.
     */
    @Command
    fun updatePrayerTimes(invoke: Invoke) {
        try {
            Log.d(TAG, "updatePrayerTimes called")

            val args = invoke.parseArgs(UpdatePrayerTimesArgs::class.java)
            savePrayerData(args.prayers, args.nextPrayerIndex, args.hijriDate, args.gregorianDate, args.nextDayPrayerName, args.nextDayPrayerTime, args.nextDayPrayerLabel, args.city, args.countryCode)

            // Update all widgets
            PrayerWidgetProvider.updateAllWidgets(appContext)

            // Ensure periodic updates are scheduled
            WidgetUpdateReceiver.scheduleNextUpdate(appContext)

            invoke.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "Error updating prayer times: ${e.message}", e)
            invoke.reject("Failed to update prayer times: ${e.message}")
        }
    }

    /**
     * Check if widgets are active (replaces service running check).
     */
    @Command
    fun isServiceRunning(invoke: Invoke) {
        try {
            // Check if there are any active widgets
            val appWidgetManager = AppWidgetManager.getInstance(appContext)
            val widgetIds = appWidgetManager.getAppWidgetIds(
                ComponentName(appContext, PrayerWidgetProvider::class.java)
            )
            val hasWidgets = widgetIds.isNotEmpty()

            Log.d(TAG, "isServiceRunning: hasWidgets=$hasWidgets")

            val result = JSObject()
            result.put("isRunning", hasWidgets)
            invoke.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "Error checking widget status: ${e.message}", e)
            invoke.reject("Failed to check widget status: ${e.message}")
        }
    }

    /**
     * Open the app's system settings page.
     */
    @Command
    fun openAppSettings(invoke: Invoke) {
        try {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:${activity.packageName}")
            }
            activity.startActivity(intent)

            Log.d(TAG, "Opened app settings")
            invoke.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "Error opening app settings: ${e.message}", e)
            invoke.reject("Failed to open app settings: ${e.message}")
        }
    }

    /**
     * Check if notification permission is granted.
     */
    @Command
    fun checkNotificationPermission(invoke: Invoke) {
        try {
            val isGranted = NotificationManagerCompat.from(appContext).areNotificationsEnabled()
            Log.d(TAG, "Notification permission: $isGranted")

            val result = JSObject()
            result.put("granted", isGranted)
            invoke.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "Error checking notification permission: ${e.message}", e)
            invoke.reject("Failed to check notification permission: ${e.message}")
        }
    }

    /**
     * Request notification permission (opens settings on Android 13+).
     */
    @Command
    fun requestNotificationPermission(invoke: Invoke) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                // Android 13+ - open notification settings
                val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                    putExtra(Settings.EXTRA_APP_PACKAGE, activity.packageName)
                }
                activity.startActivity(intent)
            } else {
                // Older versions - open app settings
                val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.parse("package:${activity.packageName}")
                }
                activity.startActivity(intent)
            }

            Log.d(TAG, "Opened notification settings")
            invoke.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "Error requesting notification permission: ${e.message}", e)
            invoke.reject("Failed to request notification permission: ${e.message}")
        }
    }

    /**
     * Check if battery optimization is disabled (app is whitelisted).
     */
    @Command
    fun checkBatteryOptimization(invoke: Invoke) {
        try {
            val powerManager = appContext.getSystemService(Context.POWER_SERVICE) as PowerManager
            val isIgnoring = powerManager.isIgnoringBatteryOptimizations(appContext.packageName)
            Log.d(TAG, "Battery optimization ignored: $isIgnoring")

            val result = JSObject()
            result.put("isIgnoring", isIgnoring)
            invoke.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "Error checking battery optimization: ${e.message}", e)
            invoke.reject("Failed to check battery optimization: ${e.message}")
        }
    }

    /**
     * Request battery optimization exemption.
     */
    @Command
    fun requestBatteryOptimizationExemption(invoke: Invoke) {
        try {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:${activity.packageName}")
            }
            activity.startActivity(intent)

            Log.d(TAG, "Requested battery optimization exemption")
            invoke.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "Error requesting battery optimization exemption: ${e.message}", e)
            invoke.reject("Failed to request battery optimization exemption: ${e.message}")
        }
    }

    /**
     * Save prayer data to SharedPreferences for widget access.
     */
    private fun savePrayerData(
        prayers: Array<PrayerArg>,
        nextPrayerIndex: Int,
        hijriDate: String?,
        gregorianDate: String?,
        nextDayPrayerName: String? = null,
        nextDayPrayerTime: Long? = null,
        nextDayPrayerLabel: String? = null,
        city: String? = null,
        countryCode: String? = null
    ) {
        val prefs = appContext.getSharedPreferences(
            PrayerWidgetProvider.PREFS_NAME,
            Context.MODE_PRIVATE
        )

        val prayersJson = prayersToJson(prayers)
        Log.d(TAG, "Saving ${prayers.size} prayers, next index: $nextPrayerIndex, nextDayPrayer: $nextDayPrayerName")

        prefs.edit().apply {
            putString(PrayerWidgetProvider.KEY_PRAYERS_JSON, prayersJson)
            putInt(PrayerWidgetProvider.KEY_NEXT_PRAYER_INDEX, nextPrayerIndex)
            if (hijriDate != null) putString(PrayerWidgetProvider.KEY_HIJRI_DATE, hijriDate) else remove(PrayerWidgetProvider.KEY_HIJRI_DATE)
            if (gregorianDate != null) putString(PrayerWidgetProvider.KEY_GREGORIAN_DATE, gregorianDate) else remove(PrayerWidgetProvider.KEY_GREGORIAN_DATE)
            if (city != null) putString(PrayerWidgetProvider.KEY_CITY, city) else remove(PrayerWidgetProvider.KEY_CITY)
            if (countryCode != null) putString(PrayerWidgetProvider.KEY_COUNTRY_CODE, countryCode) else remove(PrayerWidgetProvider.KEY_COUNTRY_CODE)

            // Save or clear next-day prayer fields
            if (nextDayPrayerName != null && nextDayPrayerTime != null && nextDayPrayerLabel != null) {
                putString(PrayerWidgetProvider.KEY_NEXT_DAY_PRAYER_NAME, nextDayPrayerName)
                putLong(PrayerWidgetProvider.KEY_NEXT_DAY_PRAYER_TIME, nextDayPrayerTime)
                putString(PrayerWidgetProvider.KEY_NEXT_DAY_PRAYER_LABEL, nextDayPrayerLabel)
            } else {
                remove(PrayerWidgetProvider.KEY_NEXT_DAY_PRAYER_NAME)
                remove(PrayerWidgetProvider.KEY_NEXT_DAY_PRAYER_TIME)
                remove(PrayerWidgetProvider.KEY_NEXT_DAY_PRAYER_LABEL)
            }

            commit() // synchronous to ensure data is written before widget reads it
        }
    }

    /**
     * Convert prayers array to JSON string.
     */
    /**
     * Convert prayers array to JSON string.
     * Throws on failure so callers report the error to the frontend
     * instead of silently wiping prayer data with "[]".
     */
    private fun prayersToJson(prayers: Array<PrayerArg>): String {
        val jsonArray = JSONArray()
        for (prayer in prayers) {
            val obj = JSONObject().apply {
                put("prayerName", prayer.prayerName)
                put("prayerTime", prayer.prayerTime)
                put("label", prayer.label)
            }
            jsonArray.put(obj)
        }
        return jsonArray.toString()
    }

    /**
     * Set a mock time offset for debugging.
     * Positive values move time forward, negative values move time backward.
     */
    @Command
    fun setMockTimeOffset(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(SetMockTimeOffsetArgs::class.java)
            Log.d(TAG, "setMockTimeOffset: ${args.offsetMs}ms")

            DebugTimeProvider.setOffset(appContext, args.offsetMs)

            // Trigger widget refresh to show new time
            PrayerWidgetProvider.updateAllWidgets(appContext)

            invoke.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "Error setting mock time offset: ${e.message}", e)
            invoke.reject("Failed to set mock time offset: ${e.message}")
        }
    }

    /**
     * Get the current mock time offset.
     */
    @Command
    fun getMockTimeOffset(invoke: Invoke) {
        try {
            val offsetMs = DebugTimeProvider.getOffset(appContext)
            Log.d(TAG, "getMockTimeOffset: ${offsetMs}ms")

            val result = JSObject()
            result.put("offsetMs", offsetMs)
            invoke.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "Error getting mock time offset: ${e.message}", e)
            invoke.reject("Failed to get mock time offset: ${e.message}")
        }
    }

    /**
     * Clear the mock time offset (reset to real time).
     */
    @Command
    fun clearMockTimeOffset(invoke: Invoke) {
        try {
            Log.d(TAG, "clearMockTimeOffset")

            DebugTimeProvider.clearOffset(appContext)

            // Trigger widget refresh to show real time
            PrayerWidgetProvider.updateAllWidgets(appContext)

            invoke.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "Error clearing mock time offset: ${e.message}", e)
            invoke.reject("Failed to clear mock time offset: ${e.message}")
        }
    }
}
