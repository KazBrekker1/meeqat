package com.meeqat.plugin.prayerservice

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONArray
import org.json.JSONObject

@InvokeArg
class StartServiceArgs {
    lateinit var prayers: Array<PrayerArg>
    var nextPrayerIndex: Int = 0
}

@InvokeArg
class UpdatePrayerTimesArgs {
    lateinit var prayers: Array<PrayerArg>
    var nextPrayerIndex: Int = 0
}

@InvokeArg
class PrayerArg {
    lateinit var prayerName: String
    var prayerTime: Long = 0
    lateinit var label: String
}

@TauriPlugin(
    permissions = [
        Permission(
            strings = [Manifest.permission.FOREGROUND_SERVICE],
            alias = "foregroundService"
        ),
        Permission(
            strings = [Manifest.permission.POST_NOTIFICATIONS],
            alias = "postNotifications"
        ),
        Permission(
            strings = [Manifest.permission.RECEIVE_BOOT_COMPLETED],
            alias = "bootCompleted"
        ),
        Permission(
            strings = [Manifest.permission.WAKE_LOCK],
            alias = "wakeLock"
        )
    ]
)
class PrayerServicePlugin(private val activity: Activity) : Plugin(activity) {

    companion object {
        private const val TAG = "PrayerServicePlugin"
        private const val NOTIFICATION_PERMISSION_REQUEST_CODE = 1001
    }

    // Store pending invoke and args while waiting for permission result
    private var pendingStartInvoke: Invoke? = null
    private var pendingStartArgs: StartServiceArgs? = null

    @Command
    fun startService(invoke: Invoke) {
        try {
            Log.d(TAG, "startService called")

            val args = invoke.parseArgs(StartServiceArgs::class.java)

            // Check notification permission on Android 13+
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                if (ContextCompat.checkSelfPermission(
                        activity,
                        Manifest.permission.POST_NOTIFICATIONS
                    ) != PackageManager.PERMISSION_GRANTED
                ) {
                    // Store pending invoke and args, then request permission
                    pendingStartInvoke = invoke
                    pendingStartArgs = args
                    Log.d(TAG, "Requesting POST_NOTIFICATIONS permission")
                    requestPermissionForAlias("postNotifications", invoke, "onNotificationPermissionResult")
                    return
                }
            }

            // Permission granted or not needed, start service directly
            doStartService(invoke, args)
        } catch (e: Exception) {
            Log.e(TAG, "Error starting service: ${e.message}", e)
            invoke.reject("Failed to start service: ${e.message}")
        }
    }

    @PermissionCallback
    private fun onNotificationPermissionResult(invoke: Invoke) {
        val savedInvoke = pendingStartInvoke
        val savedArgs = pendingStartArgs

        // Clear pending state
        pendingStartInvoke = null
        pendingStartArgs = null

        if (savedInvoke == null || savedArgs == null) {
            Log.w(TAG, "Permission callback but no pending invoke/args")
            invoke.reject("No pending service start request")
            return
        }

        // Check if permission was granted
        val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(
                activity,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }

        if (granted) {
            Log.d(TAG, "POST_NOTIFICATIONS permission granted, starting service")
            doStartService(savedInvoke, savedArgs)
        } else {
            Log.w(TAG, "POST_NOTIFICATIONS permission denied, starting service anyway (notification won't show)")
            // Still start the service - it will run but notification won't be visible
            // This allows the app to function and user can grant permission later
            doStartService(savedInvoke, savedArgs)
        }
    }

    private fun doStartService(invoke: Invoke, args: StartServiceArgs) {
        try {
            val prayersJson = prayersToJson(args.prayers)

            Log.d(TAG, "Starting service with ${args.prayers.size} prayers, next index: ${args.nextPrayerIndex}")

            val serviceIntent = Intent(activity, PrayerForegroundService::class.java).apply {
                action = PrayerForegroundService.ACTION_START
                putExtra(PrayerForegroundService.EXTRA_PRAYERS_JSON, prayersJson)
                putExtra(PrayerForegroundService.EXTRA_NEXT_PRAYER_INDEX, args.nextPrayerIndex)
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                activity.startForegroundService(serviceIntent)
            } else {
                activity.startService(serviceIntent)
            }

            invoke.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "Error in doStartService: ${e.message}", e)
            invoke.reject("Failed to start service: ${e.message}")
        }
    }

    @Command
    fun stopService(invoke: Invoke) {
        try {
            Log.d(TAG, "stopService called")

            val serviceIntent = Intent(activity, PrayerForegroundService::class.java).apply {
                action = PrayerForegroundService.ACTION_STOP
            }
            activity.startService(serviceIntent)

            // Clear the service enabled flag
            val prefs = activity.getSharedPreferences(
                PrayerForegroundService.PREFS_NAME,
                Activity.MODE_PRIVATE
            )
            prefs.edit().putBoolean(PrayerForegroundService.KEY_SERVICE_ENABLED, false).apply()

            invoke.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping service: ${e.message}", e)
            invoke.reject("Failed to stop service: ${e.message}")
        }
    }

    @Command
    fun updatePrayerTimes(invoke: Invoke) {
        try {
            Log.d(TAG, "updatePrayerTimes called")

            val args = invoke.parseArgs(UpdatePrayerTimesArgs::class.java)
            val prayersJson = prayersToJson(args.prayers)

            Log.d(TAG, "Updating service with ${args.prayers.size} prayers, next index: ${args.nextPrayerIndex}")

            // Send update via broadcast
            val updateIntent = Intent(PrayerForegroundService.ACTION_UPDATE).apply {
                setPackage(activity.packageName)
                putExtra(PrayerForegroundService.EXTRA_PRAYERS_JSON, prayersJson)
                putExtra(PrayerForegroundService.EXTRA_NEXT_PRAYER_INDEX, args.nextPrayerIndex)
            }
            activity.sendBroadcast(updateIntent)

            invoke.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "Error updating prayer times: ${e.message}", e)
            invoke.reject("Failed to update prayer times: ${e.message}")
        }
    }

    @Command
    fun isServiceRunning(invoke: Invoke) {
        try {
            val isRunning = PrayerForegroundService.isRunning
            Log.d(TAG, "isServiceRunning: $isRunning")

            val result = JSObject()
            result.put("isRunning", isRunning)
            invoke.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "Error checking service status: ${e.message}", e)
            invoke.reject("Failed to check service status: ${e.message}")
        }
    }

    @Command
    fun checkNotificationPermission(invoke: Invoke) {
        try {
            val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                ContextCompat.checkSelfPermission(
                    activity,
                    Manifest.permission.POST_NOTIFICATIONS
                ) == PackageManager.PERMISSION_GRANTED
            } else {
                // Permission not required before Android 13
                true
            }

            Log.d(TAG, "checkNotificationPermission: granted=$granted")

            val result = JSObject()
            result.put("granted", granted)
            result.put("canRequest", Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
            invoke.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "Error checking notification permission: ${e.message}", e)
            invoke.reject("Failed to check notification permission: ${e.message}")
        }
    }

    @Command
    fun requestNotificationPermission(invoke: Invoke) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                if (ContextCompat.checkSelfPermission(
                        activity,
                        Manifest.permission.POST_NOTIFICATIONS
                    ) != PackageManager.PERMISSION_GRANTED
                ) {
                    Log.d(TAG, "Requesting POST_NOTIFICATIONS permission")
                    requestPermissionForAlias("postNotifications", invoke, "onRequestPermissionResult")
                    return
                }
            }

            // Permission already granted or not needed
            val result = JSObject()
            result.put("granted", true)
            invoke.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "Error requesting notification permission: ${e.message}", e)
            invoke.reject("Failed to request notification permission: ${e.message}")
        }
    }

    @PermissionCallback
    private fun onRequestPermissionResult(invoke: Invoke) {
        val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(
                activity,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }

        Log.d(TAG, "onRequestPermissionResult: granted=$granted")

        val result = JSObject()
        result.put("granted", granted)
        invoke.resolve(result)
    }

    /**
     * Convert prayers array to JSON string using proper JSON encoding.
     * This handles special characters in prayer names/labels correctly.
     */
    private fun prayersToJson(prayers: Array<PrayerArg>): String {
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
}
