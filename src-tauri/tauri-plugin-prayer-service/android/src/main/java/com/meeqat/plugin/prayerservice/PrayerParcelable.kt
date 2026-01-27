package com.meeqat.plugin.prayerservice

/**
 * Prayer time data models.
 * Filename "PrayerParcelable.kt" is legacy - file does not contain Parcelable implementations.
 */

/**
 * Data class representing a single prayer time
 */
data class PrayerTimeData(
    val prayerName: String,
    val prayerTime: Long, // Unix timestamp in milliseconds
    val label: String
)
