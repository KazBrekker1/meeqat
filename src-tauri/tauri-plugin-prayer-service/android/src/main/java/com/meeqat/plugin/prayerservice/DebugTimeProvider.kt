package com.meeqat.plugin.prayerservice

import android.content.Context

/**
 * Centralized time provider that supports debug time offset.
 * All time-dependent code should use this instead of System.currentTimeMillis().
 *
 * The offset approach allows time to still flow naturally (seconds tick) while shifted.
 * Setting offset to +3600000 means "pretend it's 1 hour later".
 */
object DebugTimeProvider {
    private const val PREFS_NAME = "debug_prefs"
    private const val KEY_OFFSET_MS = "mock_time_offset_ms"

    private var cachedOffset: Long? = null

    /**
     * Get the current time in milliseconds, adjusted by the debug offset.
     * Use this instead of System.currentTimeMillis() for all time-dependent operations.
     */
    fun currentTimeMillis(context: Context): Long {
        return System.currentTimeMillis() + getOffset(context)
    }

    /**
     * Get the current debug time offset in milliseconds.
     * Returns 0 if no offset is set.
     */
    fun getOffset(context: Context): Long {
        if (cachedOffset == null) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            cachedOffset = prefs.getLong(KEY_OFFSET_MS, 0L)
        }
        return cachedOffset ?: 0L
    }

    /**
     * Set the debug time offset in milliseconds.
     * Positive values move time forward, negative values move time backward.
     *
     * @param offsetMs The offset to apply to all time calculations
     */
    fun setOffset(context: Context, offsetMs: Long) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putLong(KEY_OFFSET_MS, offsetMs).apply()
        cachedOffset = offsetMs
    }

    /**
     * Clear the debug time offset (reset to real time).
     */
    fun clearOffset(context: Context) {
        setOffset(context, 0L)
    }
}
