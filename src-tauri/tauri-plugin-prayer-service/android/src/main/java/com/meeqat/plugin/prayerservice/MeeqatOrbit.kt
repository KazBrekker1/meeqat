package com.meeqat.plugin.prayerservice

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.Shader
import android.graphics.SweepGradient
import android.graphics.Typeface
import java.util.Calendar
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Renders the Meeqat "orbit" (a sky-coloured ring with a dot per prayer, a
 * now-marker, and the app's soft-glass moon at the centre) to a Bitmap for the home-
 * screen widget. RemoteViews can't host the live SVG component, so the widget shows
 * this bitmap via setImageViewBitmap.
 *
 * Mirrors the web orbit (OrbitBumps + the "glass" moon style): dial top = midnight,
 * clockwise; the ring's conic sky gradient is keyed to the day's sunrise/sunset.
 *
 * Bitmaps are cached per (size, kind) and only re-rendered when the minute, the
 * day's prayers, next prayer, caption or moon phase changes — so several widgets of
 * one size share a render.
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

    /**
     * Cached orbit (drawOrbit=true) or moon-only (false) bitmap, sized sizePx².
     * [caption] is the text of the pill at the dial's bottom ("Asr in 3h 08m", or a
     * status message); the provider builds it from the real next-prayer time.
     *
     * Synchronized: widget redraws arrive on the main thread (receivers) and on the
     * Tauri command thread (data pushes), and both go through this cache.
     */
    @Synchronized
    fun bitmap(
        sizePx: Int,
        prayers: List<PrayerTimeData>,
        nextIndex: Int,
        nowMs: Long,
        drawOrbit: Boolean,
        caption: String? = null
    ): Bitmap {
        val phase = moonPhase(nowMs)
        val minute = nowMs / 60000L
        val slot = "$sizePx|$drawOrbit"
        val contentKey = "$minute|$nextIndex|${prayers.hashCode()}|${(phase * 1000).toInt()}|$caption"
        cache[slot]?.let { (k, bmp) -> if (k == contentKey && !bmp.isRecycled) return bmp }
        val bmp = render(sizePx, prayers, nextIndex, nowMs, phase, drawOrbit, caption)
        cache[slot] = contentKey to bmp
        return bmp
    }

    private fun render(
        sizePx: Int,
        prayers: List<PrayerTimeData>,
        nextIndex: Int,
        nowMs: Long,
        phase: Float,
        drawOrbit: Boolean,
        caption: String?
    ): Bitmap {
        val bmp = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val cx = sizePx / 2f
        val cy = cx
        val r = sizePx / 2f

        if (drawOrbit && prayers.isNotEmpty()) {
            drawRing(c, cx, cy, r, prayers)
            drawDots(c, cx, cy, r, prayers, nextIndex)
            drawNow(c, cx, cy, r, nowMs)
        }
        // Inside the orbit the moon stays clear of the caption band beneath it.
        drawMoon(c, cx, cy, if (drawOrbit) r * 0.46f else r * 0.66f, phase)
        // The caption also stands in for the ring when there is no data yet ("Open Meeqat").
        if (drawOrbit && caption != null) {
            drawBottomBanner(c, cx, cy, r, caption)
        }
        return bmp
    }

    /** A point on the dial at fraction `fc` (0 = top / midnight, clockwise). */
    private fun onCircle(cx: Float, cy: Float, radius: Float, fc: Float): FloatArray {
        val a = fc * 2.0 * PI - PI / 2.0
        return floatArrayOf(cx + radius * cos(a).toFloat(), cy + radius * sin(a).toFloat())
    }

    /**
     * since / until read out as a caption banner anchored at the dial's bottom
     * (6 o'clock), mirroring the web OrbitBumps. Fixing the position there keeps
     * the curved text upright — it never twists — and the span is capped (font
     * shrinks to fit) so a long caption can't wrap round into the vertical zones.
     * On the widget the ring nearly fills the bitmap, so it rides just INSIDE the
     * ring (over the sky, with a soft dark band for legibility). One packed line,
     * like the tray.
     */
    private const val SPAN_CAP = 0.30f

    private fun drawBottomBanner(c: Canvas, cx: Float, cy: Float, r: Float, text: String) {
        // Next prayer only ("Asr in 3h 08m", the first line of the web caption):
        // short enough to stay large AND gently curved. The widget's list/strip
        // shows every prayer's clock time.
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            textAlign = Paint.Align.CENTER
            typeface = Typeface.DEFAULT
        }
        var font = (r * 0.15f).coerceAtLeast(12f)
        // Pull the label radius inward as the font grows so the dark band always
        // clears the ring (outer edge) and the moon (inner edge).
        val ringInner = (RING_MID - RING_THICK / 2f) * r
        val labelR = min(r * 0.70f, ringInner - font * 0.8f - r * 0.02f)
        // Shrink the font until the caption fits inside SPAN_CAP, rather than
        // letting it wrap round and twist.
        paint.textSize = font
        var span = (paint.measureText(text) * 1.15f) / (2f * PI.toFloat() * labelR)
        if (span > SPAN_CAP) {
            font = (font * SPAN_CAP / span).coerceAtLeast(11f)
            paint.textSize = font
            span = min(SPAN_CAP, (paint.measureText(text) * 1.15f) / (2f * PI.toFloat() * labelR))
        }

        // Arc centred on the bottom (frac 0.5), swept right→left so glyphs read
        // left→right upright.
        val n = 24
        val path = Path()
        for (i in 0..n) {
            val f = 0.5f + span / 2f - span * (i.toFloat() / n)
            val p = onCircle(cx, cy, labelR, f)
            if (i == 0) path.moveTo(p[0], p[1]) else path.lineTo(p[0], p[1])
        }

        // soft dark band behind the text (curved analog of the web scrim)
        c.drawPath(path, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = font + font * 0.6f
            strokeCap = Paint.Cap.ROUND
            this.color = 0xBD05070F.toInt()
        })
        paint.color = 0xF2FFFFFF.toInt()
        // Align.CENTER already centres the text on the path, so hOffset must stay 0.
        // Adding length/2 pushed the second half past the path's end, where Android
        // piles the overflowing glyphs on top of each other.
        c.drawTextOnPath(text, path, 0f, font * 0.35f, paint)
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
        val glow = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x38FCD34D }
        for (i in prayers.indices) {
            val frac = minutesOfDay(prayers[i].prayerTime) / 1440f
            val a = frac * 2f * PI.toFloat() - PI.toFloat() / 2f
            val x = cx + rad * cos(a)
            val y = cy + rad * sin(a)
            val isNext = i == nextIndex
            val rr = if (isNext) dotR * 1.45f else dotR
            if (isNext) c.drawCircle(x, y, rr * 2.1f, glow)
            c.drawCircle(x, y, rr + r * 0.012f, stroke)
            c.drawCircle(x, y, rr, if (isNext) amber else white)
        }
    }

    /** Now-marker, as on the web orbit: an ink dot with a white ring riding the day ring. */
    private fun drawNow(c: Canvas, cx: Float, cy: Float, r: Float, nowMs: Long) {
        val p = onCircle(cx, cy, r * RING_MID, minutesOfDay(nowMs) / 1440f)
        val dot = r * 0.042f
        c.drawCircle(p[0], p[1], dot * 1.7f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x33FFFFFF })
        c.drawCircle(p[0], p[1], dot, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF141C40.toInt() })
        c.drawCircle(p[0], p[1], dot, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE; strokeWidth = dot * 0.5f; color = 0xFFFFFFFF.toInt()
        })
    }

    // Soft-glass palette (app/utils/moon/styles.ts `glass`).
    private val LAV = floatArrayOf(185f, 192f, 244f)
    private val WHITE = floatArrayOf(247f, 246f, 255f)
    private val DEEP = floatArrayOf(11f, 16f, 48f)
    private val MID = floatArrayOf(22f, 29f, 77f)
    private val RIM = floatArrayOf(143f, 155f, 245f)

    private fun smooth(a: Float, b: Float, x: Float): Float {
        val t = ((x - a) / (b - a)).coerceIn(0f, 1f)
        return t * t * (3f - 2f * t)
    }

    /**
     * The app's default "soft glass" moon: a luminous, near-flat sphere with a soft
     * terminator and rim light, shaded per pixel. The widget has no location, so the
     * sun sits on the horizontal for the phase (no parallactic tilt, no maria).
     */
    private fun drawMoon(c: Canvas, cx: Float, cy: Float, moonR: Float, phase: Float) {
        // halo
        c.drawCircle(cx, cy, moonR * 1.45f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            shader = RadialGradient(
                cx, cy, moonR * 1.45f,
                intArrayOf(0x30C9CFFB, 0x00C9CFFB), floatArrayOf(0.68f, 1f), Shader.TileMode.CLAMP
            )
        })

        val ang = 2.0 * PI * (((phase % 1f) + 1f) % 1f)
        val sx = sin(ang).toFloat()      // waxing → lit from the right
        val sz = -cos(ang).toFloat()     // new moon → sun behind the disc
        val hz = sz + 1f
        val hn = hypot(sx, hz).coerceAtLeast(1e-4f)

        val d = (moonR * 2f).toInt() + 2
        val px = IntArray(d * d)
        val col = FloatArray(3)
        fun mix(to: FloatArray, t: Float) { for (k in 0..2) col[k] += (to[k] - col[k]) * t }
        for (j in 0 until d) for (i in 0 until d) {
            val x = (i + 0.5f - d / 2f) / moonR
            val y = (j + 0.5f - d / 2f) / moonR
            val rr = x * x + y * y
            val cov = ((1f - sqrt(rr)) * moonR + 0.5f).coerceIn(0f, 1f) // 1px anti-aliased limb
            if (cov <= 0f) continue
            val z = sqrt((1f - rr).coerceAtLeast(0f))
            val day = smooth(-0.14f, 0.3f, x * sx + z * sz)
            val fres = (1f - z).pow(2.4f)

            // night side, then the lit side over it
            for (k in 0..2) col[k] = DEEP[k] + (MID[k] - DEEP[k]) * z.pow(1.5f) * 0.7f
            val lz = z.pow(0.8f) * 0.92f
            val spec = ((x * sx + z * hz) / hn).coerceIn(0f, 1f).pow(24f) * 0.2f
            for (k in 0..2) {
                var lit = LAV[k] + (WHITE[k] - LAV[k]) * lz
                lit += (255f - lit) * spec
                col[k] += (lit - col[k]) * day
            }
            mix(RIM, fres * (1f - day) * 0.45f)   // cool rim on the night side
            mix(WHITE, fres * day * 0.3f)         // bright rim on the day side
            px[j * d + i] = ((cov * 255f).toInt() shl 24) or
                (col[0].toInt() shl 16) or (col[1].toInt() shl 8) or col[2].toInt()
        }
        val disc = Bitmap.createBitmap(px, d, d, Bitmap.Config.ARGB_8888)
        c.drawBitmap(disc, cx - d / 2f, cy - d / 2f, Paint(Paint.FILTER_BITMAP_FLAG))
        disc.recycle()
    }
}
