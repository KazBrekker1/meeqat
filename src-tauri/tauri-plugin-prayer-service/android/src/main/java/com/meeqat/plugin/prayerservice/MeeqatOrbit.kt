package com.meeqat.plugin.prayerservice

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PathMeasure
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.SweepGradient
import android.graphics.Typeface
import java.util.Calendar
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.min
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
            drawComet(c, cx, cy, r, prayers, nextIndex, nowMs)
        }
        drawMoon(c, cx, cy, if (drawOrbit) r * 0.52f else r * 0.80f, phase)
        if (drawOrbit && prayers.isNotEmpty()) {
            drawBottomBanner(c, cx, cy, r, prayers, nextIndex, nowMs)
        }
        return bmp
    }

    // Pretty prayer names to match the web orbit (ʿAṣr, ʿIshāʾ, …).
    private val PRETTY = mapOf(
        "fajr" to "Fajr", "sunrise" to "Sunrise", "dhuhr" to "Dhuhr",
        "asr" to "ʿAṣr", "maghrib" to "Maghrib", "isha" to "ʿIshāʾ"
    )
    private fun pretty(name: String) = PRETTY[name.lowercase()] ?: name

    private fun fmtDur(min: Int): String {
        val m = if (min < 0) 0 else min
        val h = m / 60
        val r = m % 60
        return if (h > 0) "${h}h ${r}m" else "${r}m"
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
    private const val SPAN_CAP = 0.42f

    private fun drawBottomBanner(
        c: Canvas, cx: Float, cy: Float, r: Float,
        prayers: List<PrayerTimeData>, nextIndex: Int, nowMs: Long
    ) {
        val nowM = minutesOfDay(nowMs)
        val nextIdx = nextIndex.coerceIn(0, prayers.size - 1)
        val prevIdx = if (nextIdx - 1 < 0) prayers.size - 1 else nextIdx - 1
        val nextM = minutesOfDay(prayers[nextIdx].prayerTime)
        val prevM = minutesOfDay(prayers[prevIdx].prayerTime)
        var sinceMin = nowM - prevM; if (sinceMin < 0) sinceMin += 1440
        var untilMin = nextM - nowM; if (untilMin < 0) untilMin += 1440

        val text = "${pretty(prayers[prevIdx].prayerName)} ${fmtDur(sinceMin)} · " +
            "${pretty(prayers[nextIdx].prayerName)} ${fmtDur(untilMin)}"

        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            textAlign = Paint.Align.CENTER
            typeface = Typeface.DEFAULT
        }
        var font = (r * 0.17f).coerceAtLeast(12f)
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
        val hOffset = PathMeasure(path, false).length / 2f // centre the text on the arc
        c.drawTextOnPath(text, path, hOffset, font * 0.35f, paint)
    }

    // Beacon colour as the next prayer nears: cool blue → amber → hot coral.
    private fun urgencyColor(u: Float): Int =
        if (u < 0.5f) mixColor(0xFF7DB0FF.toInt(), 0xFFFCD34D.toInt(), u / 0.5f)
        else mixColor(0xFFFCD34D.toInt(), 0xFFFF6B4A.toInt(), (u - 0.5f) / 0.5f)

    private fun mixColor(c1: Int, c2: Int, t: Float): Int {
        val r = ((c1 shr 16 and 0xFF) + ((c2 shr 16 and 0xFF) - (c1 shr 16 and 0xFF)) * t).toInt()
        val g = ((c1 shr 8 and 0xFF) + ((c2 shr 8 and 0xFF) - (c1 shr 8 and 0xFF)) * t).toInt()
        val b = ((c1 and 0xFF) + ((c2 and 0xFF) - (c1 and 0xFF)) * t).toInt()
        return (0xFF shl 24) or (r shl 16) or (g shl 8) or b
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

    private const val TAIL_CAP = 150f   // minutes the tail spans before it saturates
    private const val BEACON_RANGE = 100f // minutes out at which the beacon reacts

    /**
     * Comet · beacon now-cue, mirroring the web OrbitBumps. A gold head sits at the
     * current time on the ring; a tapered gold tail trails behind it toward the
     * previous prayer (= time since). The next-prayer dot carries a beacon that
     * warms from blue → coral as the prayer nears (= time until). The web version's
     * animated sonar pings can't run in a per-minute static bitmap, so the beacon
     * is a single static ring instead.
     */
    private fun drawComet(
        c: Canvas, cx: Float, cy: Float, r: Float,
        prayers: List<PrayerTimeData>, nextIndex: Int, nowMs: Long
    ) {
        val ringR = r * RING_MID
        val nowM = minutesOfDay(nowMs)
        val nowFrac = nowM / 1440f
        val nextIdx = nextIndex.coerceIn(0, prayers.size - 1)
        val prevIdx = if (nextIdx - 1 < 0) prayers.size - 1 else nextIdx - 1
        val nextM = minutesOfDay(prayers[nextIdx].prayerTime)
        val prevM = minutesOfDay(prayers[prevIdx].prayerTime)
        var sinceMin = nowM - prevM; if (sinceMin < 0) sinceMin += 1440
        var untilMin = nextM - nowM; if (untilMin < 0) untilMin += 1440

        // ── tail: gold, tapered, riding the ring from now back over `since` ──
        val covered = min(sinceMin.toFloat(), TAIL_CAP)
        val segs = 28
        val halfW = r * 0.02f
        for (i in 1..segs) {
            val fa = (i - 1f) / segs
            val fb = i.toFloat() / segs
            val ta = (nowM - fa * covered) / 1440f
            val tb = (nowM - fb * covered) / 1440f
            val hwa = halfW * Math.pow((1f - fa).toDouble(), 0.7).toFloat()
            val hwb = halfW * Math.pow((1f - fb).toDouble(), 0.7).toFloat()
            val oa = onCircle(cx, cy, ringR + hwa, ta)
            val ob = onCircle(cx, cy, ringR + hwb, tb)
            val ib = onCircle(cx, cy, ringR - hwb, tb)
            val ia = onCircle(cx, cy, ringR - hwa, ta)
            val o = Math.pow((1f - fa).toDouble(), 1.3).toFloat()
            val alpha = (o * 255f).toInt().coerceIn(0, 255)
            val quad = Path().apply {
                moveTo(oa[0], oa[1]); lineTo(ob[0], ob[1]); lineTo(ib[0], ib[1]); lineTo(ia[0], ia[1]); close()
            }
            c.drawPath(quad, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = (alpha shl 24) or 0xFCD34D })
        }

        // ── beacon on the next prayer dot (static; web pulses a sonar here) ──
        val urgency = (1f - untilMin / BEACON_RANGE).coerceIn(0f, 1f)
        val beacon = urgencyColor(urgency)
        val np = onCircle(cx, cy, ringR, nextM / 1440f)
        c.drawCircle(np[0], np[1], r * 0.085f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE; strokeWidth = r * 0.013f
            color = (0x55 shl 24) or (beacon and 0xFFFFFF)
        })
        c.drawCircle(np[0], np[1], r * 0.028f + urgency * r * 0.02f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = beacon
        })

        // ── head at now ──
        val hp = onCircle(cx, cy, ringR, nowFrac)
        val headR = r * 0.032f
        c.drawCircle(hp[0], hp[1], headR * 1.5f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x40FFF7D6 }) // glow
        c.drawCircle(hp[0], hp[1], headR, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFFCD34D.toInt() })
        c.drawCircle(hp[0], hp[1], headR, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE; strokeWidth = headR * 0.4f; color = 0x9908060A.toInt()
        })
        c.drawCircle(hp[0], hp[1], headR * 0.5f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFFFFFFF.toInt() })
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
