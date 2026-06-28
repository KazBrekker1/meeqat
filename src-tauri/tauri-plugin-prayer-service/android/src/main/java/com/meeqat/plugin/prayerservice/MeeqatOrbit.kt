package com.meeqat.plugin.prayerservice

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.SweepGradient
import java.util.Calendar
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin

/**
 * Renders the Meeqat "orbit" (a sky-coloured ring with a dot per prayer, a live
 * now-marker, and a phase-accurate moon at the centre) to a Bitmap for the home-
 * screen widget. RemoteViews can't host the live SVG component, so the widget shows
 * this bitmap via setImageViewBitmap.
 *
 * Mirrors the web prototype (OrbitBumps + MoonPhase): dial top = midnight, clockwise;
 * the ring's conic sky gradient is keyed to the day's sunrise/sunset.
 *
 * Bitmaps are cached per (size, kind) and only re-rendered when the minute, next
 * prayer, or moon phase changes — so the per-second widget tick reuses one bitmap.
 */
object MeeqatOrbit {

    private val cache = HashMap<String, Pair<String, Bitmap>>()

    // Synodic month and a known new moon (2000-01-06 18:14 UTC), for phase 0=new .5=full.
    private const val SYNODIC_MS = 2551442976L
    private const val KNOWN_NEW_MOON_MS = 947182440000L

    fun moonPhase(nowMs: Long): Float {
        var p = ((nowMs - KNOWN_NEW_MOON_MS).toDouble() % SYNODIC_MS) / SYNODIC_MS
        if (p < 0) p += 1.0
        return p.toFloat()
    }

    private fun minutesOfDay(ms: Long): Int {
        val cal = Calendar.getInstance()
        cal.timeInMillis = ms
        return cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)
    }

    /** Cached orbit (drawOrbit=true) or moon-only (false) bitmap, sized sizePx². */
    fun bitmap(
        sizePx: Int,
        prayers: List<PrayerTimeData>,
        nextIndex: Int,
        nowMs: Long,
        drawOrbit: Boolean
    ): Bitmap {
        val phase = moonPhase(nowMs)
        val minute = nowMs / 60000L
        val slot = "$sizePx|$drawOrbit"
        val contentKey = "$minute|$nextIndex|${prayers.size}|${(phase * 1000).toInt()}"
        cache[slot]?.let { (k, bmp) -> if (k == contentKey && !bmp.isRecycled) return bmp }
        val bmp = render(sizePx, prayers, nextIndex, nowMs, phase, drawOrbit)
        cache[slot] = contentKey to bmp
        return bmp
    }

    private fun render(
        sizePx: Int,
        prayers: List<PrayerTimeData>,
        nextIndex: Int,
        nowMs: Long,
        phase: Float,
        drawOrbit: Boolean
    ): Bitmap {
        val bmp = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val cx = sizePx / 2f
        val cy = cx
        val r = sizePx / 2f

        if (drawOrbit && prayers.isNotEmpty()) {
            drawRing(c, cx, cy, r, prayers)
            drawDots(c, cx, cy, r, prayers, nextIndex)
            drawNowMarker(c, cx, cy, r, nowMs)
        }
        drawMoon(c, cx, cy, if (drawOrbit) r * 0.58f else r * 0.80f, phase)
        return bmp
    }

    private const val RING_MID = 0.86f
    private const val RING_THICK = 0.13f

    private fun drawRing(c: Canvas, cx: Float, cy: Float, r: Float, prayers: List<PrayerTimeData>) {
        val (colors, positions) = skyStops(prayers)
        val sweep = SweepGradient(cx, cy, colors, positions)
        // SweepGradient position 0 sits at 3 o'clock; rotate so it starts at the top
        // (midnight) like the web conic-gradient `from 0deg`.
        val m = Matrix().apply { setRotate(-90f, cx, cy) }
        sweep.setLocalMatrix(m)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = r * RING_THICK
            shader = sweep
        }
        c.drawCircle(cx, cy, r * RING_MID, paint)
        // crisp hairline on the outer edge
        c.drawCircle(cx, cy, r * RING_MID + r * RING_THICK / 2f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = r * 0.008f
            color = 0x40FFFFFF
        })
    }

    /** Conic sky stops keyed to the day's prayers — mirrors the web orbit gradient. */
    private fun skyStops(prayers: List<PrayerTimeData>): Pair<IntArray, FloatArray> {
        fun minOf(name: String): Int? =
            prayers.firstOrNull { it.prayerName.equals(name, true) }?.let { minutesOfDay(it.prayerTime) }

        val sr = minOf("sunrise") ?: 360
        val ss = minOf("maghrib") ?: 1080
        val fj = minOf("fajr") ?: (sr - 90)
        val ish = minOf("isha") ?: (ss + 90)
        val noon = minOf("dhuhr") ?: ((sr + ss) / 2)
        fun deg(min: Int) = min / 1440f * 360f

        val raw = listOf(
            0f to 0xFF0C1336.toInt(),
            deg(fj) - 6f to 0xFF16224D.toInt(),
            deg(fj) to 0xFF3A2E6B.toInt(),
            (deg(fj) + deg(sr)) / 2f to 0xFFBD5A6E.toInt(),
            deg(sr) - 3f to 0xFFFF9D5C.toInt(),
            deg(sr) to 0xFFFFD0A0.toInt(),
            deg(sr) + 8f to 0xFF9BD4FF.toInt(),
            deg(noon) to 0xFFBFE0FF.toInt(),
            deg(ss) - 8f to 0xFF9BD4FF.toInt(),
            deg(ss) - 3f to 0xFFFFD0A0.toInt(),
            deg(ss) to 0xFFFF9D5C.toInt(),
            (deg(ss) + deg(ish)) / 2f to 0xFFBD5A6E.toInt(),
            deg(ish) to 0xFF3A2E6B.toInt(),
            deg(ish) + 6f to 0xFF16224D.toInt(),
            360f to 0xFF0C1336.toInt()
        )
        val colors = IntArray(raw.size)
        val positions = FloatArray(raw.size)
        var prev = -1f
        for (i in raw.indices) {
            var dd = raw[i].first.coerceIn(0f, 360f)
            if (dd <= prev) dd = prev + 0.4f
            prev = dd
            positions[i] = (dd / 360f).coerceIn(0f, 1f)
            colors[i] = raw[i].second
        }
        return colors to positions
    }

    private fun drawDots(c: Canvas, cx: Float, cy: Float, r: Float, prayers: List<PrayerTimeData>, nextIndex: Int) {
        val rad = r * RING_MID
        val dotR = r * 0.034f
        val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x99060916.toInt() }
        val white = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xD9FFFFFF.toInt() }
        val amber = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFFCD34D.toInt() }
        for (i in prayers.indices) {
            val frac = minutesOfDay(prayers[i].prayerTime) / 1440f
            val a = frac * 2f * PI.toFloat() - PI.toFloat() / 2f
            val x = cx + rad * cos(a)
            val y = cy + rad * sin(a)
            val isNext = i == nextIndex
            val rr = if (isNext) dotR * 1.45f else dotR
            c.drawCircle(x, y, rr + r * 0.012f, stroke)
            c.drawCircle(x, y, rr, if (isNext) amber else white)
        }
    }

    private fun drawNowMarker(c: Canvas, cx: Float, cy: Float, r: Float, nowMs: Long) {
        val frac = minutesOfDay(nowMs) / 1440f
        val a = frac * 2f * PI.toFloat() - PI.toFloat() / 2f
        val rad = r * RING_MID
        val x = cx + rad * cos(a)
        val y = cy + rad * sin(a)
        // tether to centre
        c.drawLine(x, y, cx, cy, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            strokeWidth = r * 0.006f
            color = 0x4DFFF7E0
        })
        c.drawCircle(x, y, r * 0.05f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE; strokeWidth = r * 0.022f; color = 0x8C06091A.toInt()
        })
        c.drawCircle(x, y, r * 0.046f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE; strokeWidth = r * 0.011f; color = 0xE6FFFFFF.toInt()
        })
        c.drawCircle(x, y, r * 0.031f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF05070F.toInt() })
        c.drawCircle(x, y, r * 0.021f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFFFF7E0.toInt() })
    }

    private fun drawMoon(c: Canvas, cx: Float, cy: Float, moonR: Float, phase: Float) {
        // halo
        c.drawCircle(cx, cy, moonR * 1.45f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            shader = RadialGradient(
                cx, cy, moonR * 1.45f,
                intArrayOf(0x59CDD6FF, 0x00CDD6FF), floatArrayOf(0.55f, 1f), Shader.TileMode.CLAMP
            )
        })
        // unlit disk
        c.drawCircle(cx, cy, moonR, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF0C1226.toInt() })

        // lit region — bright circular limb + elliptical terminator (mirrors web litPath)
        val p = ((phase % 1f) + 1f) % 1f
        val ang = 2.0 * PI * p
        val cosA = cos(ang)
        val a = (abs(cosA).toFloat() * moonR).coerceAtLeast(moonR * 0.01f)
        val waxing = p < 0.5f
        val gibbous = cosA < 0
        val limbSweep = if (waxing) 180f else -180f
        val termSweep = if (waxing == gibbous) 180f else -180f
        val path = Path().apply {
            moveTo(cx, cy - moonR)
            arcTo(RectF(cx - moonR, cy - moonR, cx + moonR, cy + moonR), 270f, limbSweep)
            arcTo(RectF(cx - a, cy - moonR, cx + a, cy + moonR), 90f, termSweep)
            close()
        }
        c.drawPath(path, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            shader = RadialGradient(
                cx - moonR * 0.25f, cy - moonR * 0.35f, moonR * 1.3f,
                intArrayOf(0xFFFFFDF6.toInt(), 0xFFF1EDE0.toInt(), 0xFFCFC7B4.toInt()),
                floatArrayOf(0f, 0.55f, 1f), Shader.TileMode.CLAMP
            )
        })
        // craters, clipped to the lit area
        c.save()
        c.clipPath(path)
        val crater = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x2EA39A86 }
        c.drawCircle(cx - moonR * 0.20f, cy - moonR * 0.26f, moonR * 0.14f, crater)
        c.drawCircle(cx + moonR * 0.28f, cy + moonR * 0.15f, moonR * 0.19f, crater)
        c.drawCircle(cx + moonR * 0.06f, cy + moonR * 0.43f, moonR * 0.10f, crater)
        c.restore()
        // rim
        c.drawCircle(cx, cy, moonR, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE; strokeWidth = moonR * 0.016f; color = 0x24FFFFFF
        })
    }
}
