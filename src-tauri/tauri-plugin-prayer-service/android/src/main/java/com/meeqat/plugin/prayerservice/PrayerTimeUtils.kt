package com.meeqat.plugin.prayerservice

import android.content.Context
import android.util.Log
import org.json.JSONArray
import java.util.Calendar
import java.util.TimeZone

/**
 * One calendar day of prayers, with that day's pre-formatted header dates when the
 * app supplied them. [estimated] marks a day projected from the previous one because
 * the stored window ran out (see [PrayerTimeUtils.resolve]).
 */
data class PrayerDay(
    val prayers: List<PrayerTimeData>,
    val hijriDate: String? = null,
    val gregorianDate: String? = null,
    val estimated: Boolean = false
)

/**
 * What the widget should show right now.
 *
 * @param day the day whose times fill the list / orbit
 * @param next the next prayer at its absolute time (possibly the following day's
 *   first prayer), or null when the stored window is exhausted ("Tap to refresh")
 * @param nextIndex row of [day] to highlight for [next]; -1 when there is none
 * @param prev the most recent prayer that has passed, at its absolute time
 */
data class WidgetSchedule(
    val day: PrayerDay,
    val next: PrayerTimeData?,
    val nextIndex: Int,
    val prev: PrayerTimeData?
)

/**
 * Shared utility for prayer time lookups: loads what the app stored and works out
 * which day and which next prayer apply at a given moment.
 */
object PrayerTimeUtils {
    private const val TAG = "PrayerTimeUtils"
    private const val MS_PER_DAY = 24 * 60 * 60 * 1000L

    // Cache keyed on the raw stored strings, so a redraw doesn't re-parse JSON.
    private var cachedKey: String? = null
    private var cachedDays: List<PrayerDay> = emptyList()

    /**
     * Every day the app has stored, ascending: the look-ahead window when the app
     * sent one, merged with the legacy single-day list (older frontends, or prefs
     * written before the window existed). Empty if there is no usable data.
     */
    fun loadDays(context: Context): List<PrayerDay> {
        try {
            val prefs = context.getSharedPreferences(PrayerWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
            val todayJson = prefs.getString(PrayerWidgetProvider.KEY_PRAYERS_JSON, null)
            val upcomingJson = prefs.getString(PrayerWidgetProvider.KEY_UPCOMING_DAYS_JSON, null)
            val hijri = prefs.getString(PrayerWidgetProvider.KEY_HIJRI_DATE, null)
            val greg = prefs.getString(PrayerWidgetProvider.KEY_GREGORIAN_DATE, null)
            if (todayJson == null && upcomingJson == null) return emptyList()

            // The zone is part of the key: which stored day is "the same day" depends on it.
            val key = "$todayJson|$upcomingJson|$hijri|$greg|${TimeZone.getDefault().id}"
            synchronized(this) {
                if (key == cachedKey) return cachedDays

                val legacyToday = todayJson?.let { parsePrayers(JSONArray(it)) }
                    ?.takeIf { it.isNotEmpty() }
                    ?.let { PrayerDay(it, hijri, greg) }
                // A malformed window must not take the legacy list down with it.
                val upcoming = try {
                    upcomingJson?.let { parseDays(it) } ?: emptyList()
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing upcoming days: ${e.message}", e)
                    emptyList()
                }
                val days = mergeDays(legacyToday, upcoming)
                cachedKey = key
                cachedDays = days
                return days
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error loading prayer times: ${e.message}", e)
            return emptyList()
        }
    }

    /**
     * The legacy single "tomorrow's first prayer" the app stores alongside today's
     * list. Null when missing — or already passed, which is the same as missing.
     */
    fun loadNextDayPrayer(context: Context, now: Long): PrayerTimeData? {
        val prefs = context.getSharedPreferences(PrayerWidgetProvider.PREFS_NAME, Context.MODE_PRIVATE)
        val name = prefs.getString(PrayerWidgetProvider.KEY_NEXT_DAY_PRAYER_NAME, null) ?: return null
        val time = prefs.getLong(PrayerWidgetProvider.KEY_NEXT_DAY_PRAYER_TIME, 0L)
        val label = prefs.getString(PrayerWidgetProvider.KEY_NEXT_DAY_PRAYER_LABEL, null) ?: return null
        if (time <= now) return null
        return PrayerTimeData(name, time, label)
    }

    /** [resolve] over the stored data. Null when the app hasn't stored anything yet. */
    fun resolveSchedule(context: Context, now: Long): WidgetSchedule? =
        resolve(loadDays(context), loadNextDayPrayer(context, now), now)

    /**
     * Pick the day that contains [now] and the next prayer after it.
     *
     * - A stored day matches today: show it; the next prayer is the first later one,
     *   crossing into the following stored day (or [nextDayPrayer]) after Isha.
     * - Today is the day right after the last stored one: show that last day
     *   projected forward by a day (times drift by a minute or two per day), so the
     *   widget degrades gently instead of going blank the moment the window ends.
     * - Anything later: the window is exhausted — [WidgetSchedule.next] is null and
     *   the widget asks to be refreshed.
     *
     * Pure (no Context) so the preview harness can exercise it directly.
     */
    fun resolve(days: List<PrayerDay>, nextDayPrayer: PrayerTimeData?, now: Long): WidgetSchedule? {
        if (days.isEmpty()) return null
        val today = localDay(now)
        val last = days.last()
        val projected = project(last)

        val shown = days.firstOrNull { dayKey(it) == today }
            ?: when {
                today < dayKey(days.first()) -> days.first() // clock moved backwards
                today == dayKey(last) + 1 -> projected
                else -> return WidgetSchedule(last, null, -1, null)
            }

        // Stored days first, then the legacy single next-day prayer (often itself an
        // estimate); the projected day only fills in behind both.
        val real = days.flatMap { it.prayers }
        val next = real.filter { it.prayerTime > now }.minByOrNull { it.prayerTime }
            ?: nextDayPrayer?.takeIf { it.prayerTime > now }
            ?: projected.prayers.filter { it.prayerTime > now }.minByOrNull { it.prayerTime }
            ?: return WidgetSchedule(shown, null, -1, null)

        val known = if (shown.estimated) real + shown.prayers else real
        val prev = known.filter { it.prayerTime <= now }.maxByOrNull { it.prayerTime }
            // Before the first stored prayer: yesterday's last one, a day back.
            ?: shown.prayers.maxByOrNull { it.prayerTime }
                ?.let { it.copy(prayerTime = shiftDays(it.prayerTime, -1)) }

        // `next` may belong to the following day — highlight the same-named row.
        val nextIndex = shown.prayers.indexOf(next).takeIf { it >= 0 }
            ?: shown.prayers.indexOfFirst { it.prayerName.equals(next.prayerName, true) }
        return WidgetSchedule(shown, next, nextIndex, prev)
    }

    /** Start of the next local day after [now] — when the widget's day rolls over. */
    fun nextLocalMidnight(now: Long): Long = Calendar.getInstance().apply {
        timeInMillis = now
        set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
        add(Calendar.DAY_OF_YEAR, 1)
    }.timeInMillis

    // ---- helpers ---------------------------------------------------------------

    /** Local calendar day number of [ms] in the current zone (consecutive per day). */
    private fun localDay(ms: Long): Long =
        Math.floorDiv(ms + TimeZone.getDefault().getOffset(ms), MS_PER_DAY)

    /**
     * The day a [PrayerDay] belongs to, read off its middle prayer (around noon) so a
     * timezone change of a few hours can't push the whole day onto a neighbour.
     */
    private fun dayKey(day: PrayerDay): Long = localDay(day.prayers[day.prayers.size / 2].prayerTime)

    /** Same wall-clock time [days] later (DST-safe). */
    private fun shiftDays(ms: Long, days: Int): Long = Calendar.getInstance().apply {
        timeInMillis = ms
        add(Calendar.DAY_OF_YEAR, days)
    }.timeInMillis

    private fun project(day: PrayerDay) = PrayerDay(
        prayers = day.prayers.map { it.copy(prayerTime = shiftDays(it.prayerTime, 1)) },
        estimated = true
    )

    /**
     * One entry per calendar day, ascending. The look-ahead window wins over the
     * legacy list for the same day, but inherits its header dates if it has none
     * (the top-level dates describe today).
     */
    private fun mergeDays(legacyToday: PrayerDay?, upcoming: List<PrayerDay>): List<PrayerDay> {
        val byDay = sortedMapOf<Long, PrayerDay>()
        if (legacyToday != null) byDay[dayKey(legacyToday)] = legacyToday
        for (day in upcoming) {
            val key = dayKey(day)
            val legacy = byDay[key]
            byDay[key] = day.copy(
                hijriDate = day.hijriDate ?: legacy?.hijriDate,
                gregorianDate = day.gregorianDate ?: legacy?.gregorianDate
            )
        }
        return byDay.values.toList()
    }

    private fun parseDays(json: String): List<PrayerDay> {
        val result = mutableListOf<PrayerDay>()
        val array = JSONArray(json)
        for (i in 0 until array.length()) {
            val obj = array.getJSONObject(i)
            val prayers = parsePrayers(obj.getJSONArray("prayers"))
            if (prayers.isEmpty()) continue
            result.add(
                PrayerDay(
                    prayers,
                    obj.optString("hijriDate", "").ifEmpty { null },
                    obj.optString("gregorianDate", "").ifEmpty { null }
                )
            )
        }
        return result
    }

    private fun parsePrayers(array: JSONArray): List<PrayerTimeData> {
        val result = mutableListOf<PrayerTimeData>()
        for (i in 0 until array.length()) {
            val obj = array.getJSONObject(i)
            result.add(PrayerTimeData(obj.getString("prayerName"), obj.getLong("prayerTime"), obj.getString("label")))
        }
        return result
    }
}
