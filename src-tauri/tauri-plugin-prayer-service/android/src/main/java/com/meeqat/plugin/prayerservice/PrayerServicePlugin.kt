package com.meeqat.plugin.prayerservice

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONArray
import org.json.JSONObject

@InvokeArg
class SetMockTimeOffsetArgs {
    var offsetMs: Long = 0
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
    var use24Hour: Boolean? = null
    // Today first, ascending, up to a week. Null from frontends that predate it.
    var upcomingDays: Array<UpcomingDayArg>? = null
}

@InvokeArg
class UpcomingDayArg {
    var prayers: Array<PrayerArg>? = null
    var hijriDate: String? = null
    var gregorianDate: String? = null
}

@InvokeArg
class PrayerArg {
    lateinit var prayerName: String
    var prayerTime: Long = 0
    lateinit var label: String
}

@InvokeArg
class InstallApkArgs {
    lateinit var url: String
    // Receives {downloaded, total} in bytes while the APK downloads (total = -1 if unknown).
    lateinit var onProgress: Channel
}

@TauriPlugin
class PrayerServicePlugin(private val activity: Activity) : Plugin(activity) {

    private val appContext: Context get() = activity.applicationContext

    companion object {
        private const val TAG = "PrayerServicePlugin"
        private const val KEY_UPDATE_APK_URL = "update_apk_url"
        private const val PROGRESS_INTERVAL_MS = 150L
        // useAppUpdate.ts matches this marker to show "allow installs" rather than a failure.
        private const val ERR_INSTALL_PERMISSION = "[install-permission]"
        // The only place an update APK may come from: this app's GitHub release assets.
        private const val UPDATE_HOST = "github.com"
        private const val UPDATE_PATH_PREFIX = "/KazBrekker1/meeqat/releases/download/"
        private const val MAX_REDIRECTS = 5
    }

    /**
     * Update prayer times in SharedPreferences and refresh widgets.
     */
    @Command
    fun updatePrayerTimes(invoke: Invoke) {
        try {
            Log.d(TAG, "updatePrayerTimes called")

            val args = invoke.parseArgs(UpdatePrayerTimesArgs::class.java)
            savePrayerData(args)

            refreshWidgets()

            invoke.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "Error updating prayer times: ${e.message}", e)
            invoke.reject("Failed to update prayer times: ${e.message}")
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
     * Redraw all widgets and (re)aim their update alarms at the new data. Both are
     * no-ops when no widget is placed — nothing is started for a user without one.
     */
    private fun refreshWidgets() {
        PrayerWidgetProvider.updateAllWidgets(appContext)
        WidgetUpdateReceiver.ensureUpdatesActive(appContext)
    }

    /**
     * Save prayer data to SharedPreferences for widget access.
     */
    private fun savePrayerData(args: UpdatePrayerTimesArgs) {
        val prayers = args.prayers
        if (prayers.isEmpty()) {
            Log.w(TAG, "savePrayerData called with empty prayers array, skipping save")
            return
        }
        for (prayer in prayers) {
            if (prayer.prayerTime <= 0) {
                Log.w(TAG, "Invalid prayer time for ${prayer.prayerName}: ${prayer.prayerTime}, skipping save")
                return
            }
        }

        val prefs = appContext.getSharedPreferences(
            PrayerWidgetProvider.PREFS_NAME,
            Context.MODE_PRIVATE
        )

        val prayersJson = prayersToJson(prayers).toString()
        val upcomingDaysJson = upcomingDaysToJson(args.upcomingDays)
        Log.d(TAG, "Saving ${prayers.size} prayers, ${args.upcomingDays?.size ?: 0} upcoming days, nextDayPrayer: ${args.nextDayPrayerName}")

        val hijriDate = args.hijriDate
        val gregorianDate = args.gregorianDate
        val city = args.city
        val countryCode = args.countryCode
        val use24Hour = args.use24Hour
        val nextDayPrayerName = args.nextDayPrayerName
        val nextDayPrayerTime = args.nextDayPrayerTime
        val nextDayPrayerLabel = args.nextDayPrayerLabel

        prefs.edit().apply {
            putString(PrayerWidgetProvider.KEY_PRAYERS_JSON, prayersJson)
            // Always written or cleared, so a window from an earlier push can't outlive
            // the single-day list it belonged to.
            if (upcomingDaysJson != null) putString(PrayerWidgetProvider.KEY_UPCOMING_DAYS_JSON, upcomingDaysJson) else remove(PrayerWidgetProvider.KEY_UPCOMING_DAYS_JSON)
            if (hijriDate != null) putString(PrayerWidgetProvider.KEY_HIJRI_DATE, hijriDate) else remove(PrayerWidgetProvider.KEY_HIJRI_DATE)
            if (gregorianDate != null) putString(PrayerWidgetProvider.KEY_GREGORIAN_DATE, gregorianDate) else remove(PrayerWidgetProvider.KEY_GREGORIAN_DATE)
            if (city != null) putString(PrayerWidgetProvider.KEY_CITY, city) else remove(PrayerWidgetProvider.KEY_CITY)
            if (countryCode != null) putString(PrayerWidgetProvider.KEY_COUNTRY_CODE, countryCode) else remove(PrayerWidgetProvider.KEY_COUNTRY_CODE)
            if (use24Hour != null) putBoolean(PrayerWidgetProvider.KEY_USE_24_HOUR, use24Hour) else remove(PrayerWidgetProvider.KEY_USE_24_HOUR)

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

            // No longer read: the widget works the next prayer out from the times itself.
            remove("next_prayer_index")
            remove("data_timestamp")

            // synchronous commit() is intentional: Tauri plugin commands run on a background
            // thread, and we need data written before the widget reads it. Do NOT use apply().
            commit()
        }
    }

    /**
     * The look-ahead window as JSON, or null when the frontend didn't send one.
     * Days that are empty or carry an invalid time are dropped rather than stored.
     */
    private fun upcomingDaysToJson(days: Array<UpcomingDayArg>?): String? {
        if (days == null) return null
        val jsonArray = JSONArray()
        for (day in days) {
            val prayers = day.prayers
            if (prayers == null || prayers.isEmpty() || prayers.any { it.prayerTime <= 0 }) continue
            jsonArray.put(JSONObject().apply {
                put("prayers", prayersToJson(prayers))
                day.hijriDate?.let { put("hijriDate", it) }
                day.gregorianDate?.let { put("gregorianDate", it) }
            })
        }
        return if (jsonArray.length() > 0) jsonArray.toString() else null
    }

    /**
     * Convert prayers array to JSON.
     * Lets exceptions propagate so callers report errors to the frontend
     * instead of silently wiping prayer data with "[]".
     */
    private fun prayersToJson(prayers: Array<PrayerArg>): JSONArray {
        val jsonArray = JSONArray()
        for (prayer in prayers) {
            val obj = JSONObject().apply {
                put("prayerName", prayer.prayerName)
                put("prayerTime", prayer.prayerTime)
                put("label", prayer.label)
            }
            jsonArray.put(obj)
        }
        return jsonArray
    }

    /**
     * Set a mock time offset for debugging.
     * Positive values move time forward, negative values move time backward.
     * Ignored in release builds (see [DebugTimeProvider]).
     */
    @Command
    fun setMockTimeOffset(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(SetMockTimeOffsetArgs::class.java)
            Log.d(TAG, "setMockTimeOffset: ${args.offsetMs}ms")

            DebugTimeProvider.setOffset(appContext, args.offsetMs)

            // Redraw at the shifted time and re-aim the alarms at it
            refreshWidgets()

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

            // Redraw at real time and re-aim the alarms at it
            refreshWidgets()

            invoke.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "Error clearing mock time offset: ${e.message}", e)
            invoke.reject("Failed to clear mock time offset: ${e.message}")
        }
    }

    /**
     * Telegram-style in-app update for Android: download the release APK and hand
     * it to the system package installer, which shows its own confirm dialog.
     * Resolves once the installer is on screen; download progress streams over
     * [InstallApkArgs.onProgress].
     *
     * On Android 8+ the app must hold the "install unknown apps" grant; if it
     * doesn't, we route the user to that settings screen and ask them to retry.
     */
    @Command
    fun installApk(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(InstallApkArgs::class.java)

            if (!isTrustedUpdateUrl(args.url)) {
                Log.w(TAG, "installApk: refusing untrusted URL")
                invoke.reject("Update failed: untrusted download URL")
                return
            }

            // Android 8+ (API 26): require the per-app "install unknown apps" grant.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                !appContext.packageManager.canRequestPackageInstalls()
            ) {
                val settingsIntent = Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:${appContext.packageName}")
                ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                appContext.startActivity(settingsIntent)
                invoke.reject("$ERR_INSTALL_PERMISSION Allow Meeqat to install apps, then tap Install again.")
                return
            }

            // Download off the main thread, then launch the installer.
            Thread {
                try {
                    val apkFile = downloadApk(args.url, args.onProgress)
                    launchInstaller(apkFile)
                    invoke.resolve()
                } catch (e: Exception) {
                    Log.e(TAG, "APK download/install failed: ${e.message}", e)
                    invoke.reject("Download failed: ${e.message}")
                }
            }.start()
        } catch (e: Exception) {
            Log.e(TAG, "installApk error: ${e.message}", e)
            invoke.reject("Update failed: ${e.message}")
        }
    }

    private fun sendProgress(channel: Channel, downloaded: Long, total: Long) {
        channel.send(JSObject().apply {
            put("downloaded", downloaded)
            put("total", total)
        })
    }

    /**
     * Only an https link to one of this repo's GitHub release assets may be
     * downloaded and handed to the installer — never an arbitrary URL from JS.
     */
    private fun isTrustedUpdateUrl(url: String): Boolean {
        val uri = try { java.net.URI(url) } catch (e: Exception) { return false }
        val path = uri.path ?: return false // decoded, so "%2e%2e" is seen as ".."
        return uri.scheme.equals("https", ignoreCase = true) &&
            uri.host.equals(UPDATE_HOST, ignoreCase = true) &&
            uri.userInfo == null &&
            (uri.port == -1 || uri.port == 443) &&
            path.startsWith(UPDATE_PATH_PREFIX) &&
            // no dot segments, so the prefix can't be climbed back out of
            path.split('/').none { it == ".." || it == "." }
    }

    /**
     * Open [url], following redirects by hand so every hop is checked: GitHub sends
     * release downloads on to its asset CDN (objects / release-assets
     * .githubusercontent.com), and that is fine — but only ever over https.
     */
    private fun openHttps(url: String): java.net.HttpURLConnection {
        var current = java.net.URL(url)
        repeat(MAX_REDIRECTS + 1) {
            if (!current.protocol.equals("https", ignoreCase = true)) {
                throw java.io.IOException("insecure redirect")
            }
            val connection = (current.openConnection() as java.net.HttpURLConnection).apply {
                instanceFollowRedirects = false
                connectTimeout = 30_000
                readTimeout = 60_000
                connect()
            }
            if (connection.responseCode !in 300..399) return connection
            val location = connection.getHeaderField("Location")
            connection.disconnect()
            if (location == null) throw java.io.IOException("redirect without a location")
            current = java.net.URL(current, location)
        }
        throw java.io.IOException("too many redirects")
    }

    private fun downloadApk(url: String, progress: Channel): java.io.File {
        val outFile = java.io.File(appContext.cacheDir, "meeqat-update.apk")
        val prefs = appContext.getSharedPreferences(PrayerWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)

        // A finished download of this same release is still here (the user backed out
        // of the system install dialog and tapped Install again) — don't fetch it twice.
        if (outFile.exists() && prefs.getString(KEY_UPDATE_APK_URL, null) == url) {
            sendProgress(progress, outFile.length(), outFile.length())
            return outFile
        }
        prefs.edit().remove(KEY_UPDATE_APK_URL).apply()

        val connection = openHttps(url)
        try {
            if (connection.responseCode !in 200..299) {
                throw java.io.IOException("HTTP ${connection.responseCode}")
            }
            val total = connection.contentLengthLong // -1 when the server doesn't say
            // Write to .part and rename at the end, so an interrupted download can
            // never be mistaken for a complete APK.
            val partFile = java.io.File(appContext.cacheDir, "meeqat-update.apk.part")
            var downloaded = 0L
            var lastSent = 0L
            sendProgress(progress, 0, total)
            connection.inputStream.use { input ->
                partFile.outputStream().use { output ->
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        val n = input.read(buffer)
                        if (n < 0) break
                        output.write(buffer, 0, n)
                        downloaded += n
                        val now = SystemClock.uptimeMillis()
                        if (now - lastSent >= PROGRESS_INTERVAL_MS) {
                            lastSent = now
                            sendProgress(progress, downloaded, total)
                        }
                    }
                }
            }
            if (total > 0 && downloaded != total) {
                partFile.delete()
                throw java.io.IOException("connection dropped ($downloaded of $total bytes)")
            }
            sendProgress(progress, downloaded, downloaded)
            outFile.delete()
            if (!partFile.renameTo(outFile)) throw java.io.IOException("couldn't save the update")
            prefs.edit().putString(KEY_UPDATE_APK_URL, url).apply()
            return outFile
        } finally {
            connection.disconnect()
        }
    }

    private fun launchInstaller(apkFile: java.io.File) {
        // Reuse the app's existing FileProvider (declared in the app manifest).
        val apkUri = androidx.core.content.FileProvider.getUriForFile(
            appContext,
            "${appContext.packageName}.fileprovider",
            apkFile
        )
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(apkUri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        appContext.startActivity(intent)
    }
}
