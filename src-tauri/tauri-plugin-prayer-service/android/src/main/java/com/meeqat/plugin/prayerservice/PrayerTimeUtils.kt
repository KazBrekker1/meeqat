package com.meeqat.plugin.prayerservice

import android.content.Context
import android.util.Log
import org.json.JSONArray

/**
 * Shared utility for prayer time lookups.
 * Consolidates duplicated logic from WidgetUpdateReceiver, CountdownService,
 * and PrayerWidgetProvider into a single source of truth.
 */
object PrayerTimeUtils {
    private const val TAG = "PrayerTimeUtils"

    // Cache to avoid re-parsing JSON from SharedPreferences every second during countdown
    @Volatile private var cachedJson: String? = null
    @Volatile private var cachedPrayers: List<PrayerTimeData> = emptyList()

    /**
     * Parse prayer times from SharedPreferences JSON.
     * Caches the parsed result to avoid redundant JSON parsing in hot paths
     * (CountdownService updates every second).
     * Returns an empty list if data is missing or malformed.
     */
    fun loadPrayerTimes(context: Context): List<PrayerTimeData> {
        try {
            val prefs = context.getSharedPreferences(
                PrayerWidgetProvider.PREFS_NAME,
                Context.MODE_PRIVATE
            )
            val prayersJson = prefs.getString(PrayerWidgetProvider.KEY_PRAYERS_JSON, null)
                ?: return emptyList()

            // Synchronized to ensure cachedJson and cachedPrayers stay consistent
            // during concurrent reads from CountdownService (1Hz) and writes from main thread
            synchronized(this) {
                // Return cached result if JSON hasn't changed
                if (prayersJson == cachedJson) {
                    return cachedPrayers
                }

                val parsed = parsePrayersJson(prayersJson)
                cachedJson = prayersJson
                cachedPrayers = parsed
                return parsed
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error loading prayer times: ${e.message}", e)
            return emptyList()
        }
    }

    /**
     * Check if all prayers in the list have passed.
     */
    fun allPrayersPassed(context: Context, prayers: List<PrayerTimeData>): Boolean {
        if (prayers.isEmpty()) return false
        val now = DebugTimeProvider.currentTimeMillis(context)
        return prayers.all { it.prayerTime <= now }
    }

    /**
     * Load next-day prayer data from SharedPreferences.
     * Returns a PrayerTimeData if all 3 fields are present, null otherwise.
     */
    fun loadNextDayPrayer(context: Context): PrayerTimeData? {
        val prefs = context.getSharedPreferences(
            PrayerWidgetProvider.PREFS_NAME,
            Context.MODE_PRIVATE
        )
        val name = prefs.getString(PrayerWidgetProvider.KEY_NEXT_DAY_PRAYER_NAME, null) ?: return null
        val time = prefs.getLong(PrayerWidgetProvider.KEY_NEXT_DAY_PRAYER_TIME, 0L)
        val label = prefs.getString(PrayerWidgetProvider.KEY_NEXT_DAY_PRAYER_LABEL, null) ?: return null
        if (time == 0L) return null
        return PrayerTimeData(name, time, label)
    }

    /**
     * Find the absolute time (epoch ms) of the next prayer that hasn't passed.
     * Falls back to next-day prayer from SharedPreferences when all today's prayers have passed.
     * Returns null if no prayer data exists.
     */
    fun getNextPrayerTimeMs(context: Context): Long? {
        val now = DebugTimeProvider.currentTimeMillis(context)
        val prayers = loadPrayerTimes(context)
        val todayNext = prayers.firstOrNull { it.prayerTime > now }?.prayerTime
        if (todayNext != null) return todayNext

        // All today's prayers passed — try next-day prayer
        val nextDay = loadNextDayPrayer(context)
        if (nextDay != null && nextDay.prayerTime > now) {
            return nextDay.prayerTime
        }
        return null
    }

    /**
     * Get the display label of the next upcoming prayer.
     * Returns null if no upcoming prayer is found.
     */
    fun getNextPrayerName(context: Context): String? {
        return getNextPrayerInfo(context)?.first
    }

    /**
     * Get milliseconds remaining until the next prayer.
     * Returns null if no upcoming prayer is found.
     */
    fun getTimeToNextPrayer(context: Context): Long? {
        val now = DebugTimeProvider.currentTimeMillis(context)
        val nextTime = getNextPrayerTimeMs(context) ?: return null
        val remaining = nextTime - now
        return if (remaining > 0) remaining else null
    }

    /**
     * Get both the name and remaining time of the next prayer in a single lookup.
     * Returns Pair(label, remainingMs) or null if no upcoming prayer.
     */
    fun getNextPrayerInfo(context: Context): Pair<String, Long>? {
        val now = DebugTimeProvider.currentTimeMillis(context)
        val prayers = loadPrayerTimes(context)
        val todayNext = prayers.firstOrNull { it.prayerTime > now }
        if (todayNext != null) return Pair(todayNext.label, todayNext.prayerTime - now)

        val nextDay = loadNextDayPrayer(context)
        if (nextDay != null && nextDay.prayerTime > now) {
            return Pair(nextDay.label, nextDay.prayerTime - now)
        }
        return null
    }

    /**
     * Find the index of the next upcoming prayer.
     * Falls back to storedIndex if it's still valid, otherwise scans forward.
     * Returns lastIndex if all prayers have passed (end-of-day state).
     */
    fun findNextPrayerIndex(context: Context, prayers: List<PrayerTimeData>, storedIndex: Int): Int {
        val now = DebugTimeProvider.currentTimeMillis(context)

        // If stored index is valid and that prayer hasn't passed, use it
        if (storedIndex in prayers.indices && prayers[storedIndex].prayerTime > now) {
            return storedIndex
        }

        // Find the first prayer that hasn't passed yet
        for (i in prayers.indices) {
            if (prayers[i].prayerTime > now) {
                return i
            }
        }

        // All prayers have passed
        return prayers.lastIndex.coerceAtLeast(0)
    }

    /**
     * Format a duration in milliseconds as a human-readable countdown string.
     * e.g., "2h 15m 30s", "15m 30s", "45s"
     */
    fun formatDuration(timeMs: Long): String {
        if (timeMs <= 0) return "Now"
        val hours = timeMs / (1000 * 60 * 60)
        val minutes = (timeMs % (1000 * 60 * 60)) / (1000 * 60)
        val seconds = (timeMs % (1000 * 60)) / 1000
        return when {
            hours > 0 -> "${hours}h ${minutes}m ${seconds}s"
            minutes >= 1 -> "${minutes}m ${seconds}s"
            else -> "${seconds}s"
        }
    }

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

            result
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing prayers JSON: ${e.message}", e)
            emptyList()
        }
    }
}
