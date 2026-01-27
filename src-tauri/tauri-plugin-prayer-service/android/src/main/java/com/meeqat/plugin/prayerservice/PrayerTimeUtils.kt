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
    private var cachedJson: String? = null
    private var cachedPrayers: List<PrayerTimeData> = emptyList()

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

            // Return cached result if JSON hasn't changed
            if (prayersJson == cachedJson) {
                return cachedPrayers
            }

            val parsed = parsePrayersJson(prayersJson)
            cachedJson = prayersJson
            cachedPrayers = parsed
            return parsed
        } catch (e: Exception) {
            Log.e(TAG, "Error loading prayer times: ${e.message}", e)
            return emptyList()
        }
    }

    /**
     * Find the absolute time (epoch ms) of the next prayer that hasn't passed.
     * Returns null if no prayer data exists or all prayers have passed.
     */
    fun getNextPrayerTimeMs(context: Context): Long? {
        val now = DebugTimeProvider.currentTimeMillis(context)
        val prayers = loadPrayerTimes(context)
        return prayers.firstOrNull { it.prayerTime > now }?.prayerTime
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
