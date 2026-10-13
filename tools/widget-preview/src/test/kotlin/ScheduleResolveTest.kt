package com.meeqat.plugin.prayerservice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone

/**
 * The widget's day / next-prayer resolution (PrayerTimeUtils.resolve), checked at the
 * moments where it used to go wrong: after Isha, across midnight, the morning after
 * the app was last opened, and once the stored window has run out.
 */
class ScheduleResolveTest {

    private val tz = TimeZone.getTimeZone("Asia/Qatar")
    private val times = listOf(
        "Fajr" to "04:02", "Sunrise" to "05:21", "Dhuhr" to "11:28",
        "Asr" to "14:55", "Maghrib" to "17:34", "Isha" to "19:04",
    )

    @Before fun zone() = TimeZone.setDefault(tz)

    /** Day 0 is 19 Sep 2026; later days are that many days on. */
    private fun at(day: Int, hhmm: String): Long {
        val (h, m) = hhmm.split(":").map(String::toInt)
        return Calendar.getInstance(tz).apply { clear(); set(2026, Calendar.SEPTEMBER, 19 + day, h, m) }.timeInMillis
    }

    /** Each day's times run [day] minutes later than day 0's, so days are told apart. */
    private fun day(day: Int) = PrayerDay(
        times.map { (name, t) -> PrayerTimeData(name, at(day, t) + day * 60_000L, name) },
        hijriDate = "hijri-$day", gregorianDate = "greg-$day"
    )

    private val week = (0..6).map(::day)

    @Test fun midDay_nextIsLaterToday() {
        val s = PrayerTimeUtils.resolve(week, null, at(0, "13:40"))!!
        assertEquals("Asr", s.next!!.prayerName)
        assertEquals(at(0, "14:55"), s.next!!.prayerTime)
        assertEquals(3, s.nextIndex)
        assertEquals("Dhuhr", s.prev!!.prayerName)
        assertEquals("hijri-0", s.day.hijriDate)
    }

    @Test fun afterIsha_nextIsTomorrowsFajrAtItsStoredTime() {
        val s = PrayerTimeUtils.resolve(week, null, at(0, "21:30"))!!
        assertEquals("Fajr", s.next!!.prayerName)
        assertEquals(at(1, "04:03"), s.next!!.prayerTime) // tomorrow's own time, not today's + 24h
        assertEquals(0, s.nextIndex)
        assertEquals("Isha", s.prev!!.prayerName)
        assertEquals("hijri-0", s.day.hijriDate) // still today until midnight
    }

    @Test fun afterMidnight_showsTheNewDayAndItsDates() {
        val s = PrayerTimeUtils.resolve(week, null, at(1, "00:05"))!!
        assertEquals("greg-1", s.day.gregorianDate)
        assertEquals("hijri-1", s.day.hijriDate)
        assertEquals(at(1, "04:03"), s.next!!.prayerTime)
        assertEquals(at(0, "19:04"), s.prev!!.prayerTime) // yesterday's Isha, for the "since" line
    }

    // Item 11: the app wasn't opened; the next day's Fajr has passed.
    @Test fun nextMorning_movesOnPastFajr() {
        val s = PrayerTimeUtils.resolve(week, null, at(1, "09:00"))!!
        assertEquals("Dhuhr", s.next!!.prayerName)
        assertEquals(at(1, "11:29"), s.next!!.prayerTime)
        assertEquals("Sunrise", s.prev!!.prayerName)
        assertEquals("hijri-1", s.day.hijriDate)
    }

    @Test fun lastStoredDay_afterIsha_fallsBackToProjectedFajr() {
        val s = PrayerTimeUtils.resolve(week, null, at(6, "22:00"))!!
        assertFalse(s.day.estimated)
        assertEquals("Fajr", s.next!!.prayerName)
        assertEquals(at(7, "04:08"), s.next!!.prayerTime) // day 6's Fajr (04:08), a day on
    }

    @Test fun dayAfterTheWindow_isProjectedWithoutDates() {
        val s = PrayerTimeUtils.resolve(week, null, at(7, "09:00"))!!
        assertTrue(s.day.estimated)
        assertNull(s.day.hijriDate)
        assertNull(s.day.gregorianDate)
        assertEquals("Dhuhr", s.next!!.prayerName)
        assertEquals(at(7, "11:34"), s.next!!.prayerTime)
        assertEquals("Sunrise", s.prev!!.prayerName)
    }

    @Test fun projectedDay_afterIsha_isExhausted() {
        assertNull(PrayerTimeUtils.resolve(week, null, at(7, "22:00"))!!.next)
    }

    @Test fun twoDaysPastTheWindow_isExhausted() {
        val s = PrayerTimeUtils.resolve(week, null, at(8, "09:00"))!!
        assertNull(s.next)
        assertEquals(-1, s.nextIndex)
    }

    @Test fun noData() = assertNull(PrayerTimeUtils.resolve(emptyList(), null, at(0, "09:00")))

    // Prefs written by a version (or frontend) without the look-ahead window:
    // today's list plus the single next-day prayer.
    private val legacy = listOf(day(0))
    private val legacyFajr = PrayerTimeData("Fajr", at(1, "04:03"), "Fajr")

    @Test fun legacy_afterIsha_usesStoredNextDayPrayer() {
        val s = PrayerTimeUtils.resolve(legacy, legacyFajr, at(0, "21:30"))!!
        assertEquals(at(1, "04:03"), s.next!!.prayerTime)
        assertEquals(0, s.nextIndex)
    }

    @Test fun legacy_beforeIsha_ignoresNextDayPrayer() {
        assertEquals("Isha", PrayerTimeUtils.resolve(legacy, legacyFajr, at(0, "17:52"))!!.next!!.prayerName)
    }

    @Test fun legacy_nextMorning_runsOnProjectedDayThenExpires() {
        // loadNextDayPrayer() already drops a passed next-day prayer, hence null here.
        val morning = PrayerTimeUtils.resolve(legacy, null, at(1, "09:00"))!!
        assertTrue(morning.day.estimated)
        assertEquals(at(1, "11:28"), morning.next!!.prayerTime)
        assertNull(morning.day.hijriDate)

        assertNull(PrayerTimeUtils.resolve(legacy, null, at(1, "22:00"))!!.next)
        assertNull(PrayerTimeUtils.resolve(legacy, null, at(2, "09:00"))!!.next)
    }

    @Test fun beforeFajr_onFirstStoredDay_estimatesYesterdaysIsha() {
        val s = PrayerTimeUtils.resolve(week, null, at(0, "02:00"))!!
        assertEquals("Fajr", s.next!!.prayerName)
        assertEquals("Isha", s.prev!!.prayerName)
        assertEquals(at(-1, "19:04"), s.prev!!.prayerTime)
    }

    // Travel: the stored days keep their identity when the zone moves a few hours.
    @Test fun timezoneChange_keepsTheRightDay() {
        val moment = at(2, "13:00")
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Tokyo")) // +6h
        val s = PrayerTimeUtils.resolve(week, null, moment)!!
        assertEquals("hijri-2", s.day.hijriDate)
        assertEquals("Asr", s.next!!.prayerName)
    }

    @Test fun midnightBoundary_isStartOfTomorrowLocally() {
        assertEquals(at(1, "00:00"), PrayerTimeUtils.nextLocalMidnight(at(0, "21:30")))
        assertEquals(at(1, "00:00"), PrayerTimeUtils.nextLocalMidnight(at(0, "00:00")))
    }
}
