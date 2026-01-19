package com.meeqat.plugin.prayerservice

/**
 * Data class representing a single prayer time
 */
data class PrayerTimeData(
    val prayerName: String,
    val prayerTime: Long, // Unix timestamp in milliseconds
    val label: String
)

/**
 * Container for prayer service state
 */
data class PrayerServiceState(
    val prayers: List<PrayerTimeData>,
    val nextPrayerIndex: Int
)
