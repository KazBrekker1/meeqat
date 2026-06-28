import WidgetKit
import SwiftUI

// MARK: - Widget Entry

struct PrayerEntry: TimelineEntry {
    let date: Date
    let data: PrayerWidgetData
    let nextPrayer: PrayerTimeData?
    let previousPrayer: PrayerTimeData?
}

// MARK: - Timeline Provider

struct PrayerTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> PrayerEntry {
        PrayerEntry(
            date: Date(),
            data: .empty,
            nextPrayer: PrayerTimeData(prayerName: "Dhuhr", prayerTime: Int64(Date().timeIntervalSince1970 * 1000) + 3600000, label: "Dhuhr"),
            previousPrayer: PrayerTimeData(prayerName: "Fajr", prayerTime: Int64(Date().timeIntervalSince1970 * 1000) - 3600000, label: "Fajr")
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (PrayerEntry) -> Void) {
        let data = PrayerDataManager.shared.loadPrayerData()
        let entry = PrayerEntry(
            date: Date(),
            data: data,
            nextPrayer: PrayerDataManager.shared.getNextPrayer(from: data),
            previousPrayer: PrayerDataManager.shared.getPreviousPrayer(from: data)
        )
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PrayerEntry>) -> Void) {
        let data = PrayerDataManager.shared.loadPrayerData()
        let currentDate = Date()

        var entries: [PrayerEntry] = []

        // Create entries for the next hour, updating every minute
        for minuteOffset in 0..<60 {
            let entryDate = Calendar.current.date(byAdding: .minute, value: minuteOffset, to: currentDate)!
            let entry = PrayerEntry(
                date: entryDate,
                data: data,
                nextPrayer: PrayerDataManager.shared.getNextPrayer(from: data),
                previousPrayer: PrayerDataManager.shared.getPreviousPrayer(from: data)
            )
            entries.append(entry)
        }

        // Refresh timeline after 1 hour
        let nextUpdate = Calendar.current.date(byAdding: .hour, value: 1, to: currentDate)!
        let timeline = Timeline(entries: entries, policy: .after(nextUpdate))
        completion(timeline)
    }
}

// MARK: - Widget Colors

struct WidgetColors {
    // Aurora glass — celestial navy surfaces, amber next-prayer highlight.
    static let background = Color(red: 0x0a/255, green: 0x0e/255, blue: 0x22/255)  // #0A0E22
    static let backgroundGradient = LinearGradient(
        gradient: Gradient(colors: [
            Color(red: 0x1f/255, green: 0x2a/255, blue: 0x63/255),  // #1F2A63
            Color(red: 0x14/255, green: 0x1c/255, blue: 0x40/255),  // #141C40
            Color(red: 0x0a/255, green: 0x0e/255, blue: 0x22/255)   // #0A0E22
        ]),
        startPoint: .topTrailing,
        endPoint: .bottomLeading
    )
    static let cardBackground = Color.white.opacity(0.06)  // glass
    static let accent = Color(red: 0xfc/255, green: 0xd3/255, blue: 0x4d/255)  // amber #FCD34D
    static let accentLight = Color(red: 0xfd/255, green: 0xe6/255, blue: 0x8a/255)  // amber-200
    static let textPrimary = Color.white
    static let textSecondary = Color.white.opacity(0.7)
    static let textTertiary = Color.white.opacity(0.5)
    static let highlightBackground = Color(red: 0xfc/255, green: 0xd3/255, blue: 0x4d/255).opacity(0.15)
}

// MARK: - Formatting Helpers

struct TimeFormatter {
    static func formatTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "h:mm a"
        return formatter.string(from: date)
    }

    static func formatTimeShort(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "h:mm"
        return formatter.string(from: date)
    }

    static func formatCountdown(to targetDate: Date) -> String {
        let now = Date()
        let diff = targetDate.timeIntervalSince(now)

        if diff <= 0 {
            return "Now"
        }

        let hours = Int(diff) / 3600
        let minutes = (Int(diff) % 3600) / 60

        if hours > 0 {
            return "\(hours)h \(minutes)m"
        } else if minutes > 0 {
            return "\(minutes)m"
        } else {
            return "<1m"
        }
    }

    static func formatElapsed(from pastDate: Date) -> String {
        let now = Date()
        let diff = now.timeIntervalSince(pastDate)

        if diff <= 0 {
            return "now"
        }

        let hours = Int(diff) / 3600
        let minutes = (Int(diff) % 3600) / 60

        if hours > 0 {
            return "\(hours)h \(minutes)m ago"
        } else {
            return "\(minutes)m ago"
        }
    }

    static func formatGregorianDate() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE, MMM d"
        return formatter.string(from: Date())
    }

    static func formatHijriDate() -> String {
        let islamic = Calendar(identifier: .islamicUmmAlQura)
        let components = islamic.dateComponents([.day, .month, .year], from: Date())

        let hijriMonths = [
            "Muharram", "Safar", "Rabi' I", "Rabi' II", "Jumada I", "Jumada II",
            "Rajab", "Sha'ban", "Ramadan", "Shawwal", "Dhul Qi'dah", "Dhul Hijjah"
        ]

        let day = components.day ?? 1
        let monthIndex = (components.month ?? 1) - 1
        let year = components.year ?? 1446

        let monthName = monthIndex >= 0 && monthIndex < hijriMonths.count ? hijriMonths[monthIndex] : ""
        return "\(day) \(monthName) \(year)"
    }
}

// MARK: - Countdown Text

struct CountdownText: View {
    let date: Date
    let size: CGFloat

    var body: some View {
        Text(TimeFormatter.formatCountdown(to: date))
            .font(.system(size: size, weight: .bold))
            .monospacedDigit()
            .foregroundColor(WidgetColors.textPrimary)
    }
}

// MARK: - Progress bar (previous → next prayer)

struct PrayerProgressBar: View {
    let previous: Date?
    let next: Date?

    private var fraction: Double {
        guard let prev = previous, let nxt = next else { return 0 }
        let total = nxt.timeIntervalSince(prev)
        guard total > 0 else { return 0 }
        let elapsed = Date().timeIntervalSince(prev)
        return min(1, max(0, elapsed / total))
    }

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.12))
                Capsule()
                    .fill(LinearGradient(
                        gradient: Gradient(colors: [WidgetColors.accentLight, WidgetColors.accent]),
                        startPoint: .leading, endPoint: .trailing))
                    .frame(width: max(4, geo.size.width * fraction))
            }
        }
        .frame(height: 5)
    }
}

// MARK: - Moon phase glyph (current synodic phase via SF Symbols)

struct MoonView: View {
    var size: CGFloat = 30

    // 0 = new, 0.5 = full — mean synodic month from a known new moon.
    private var fraction: Double {
        let synodic = 29.530588853
        let refNewMoon = Date(timeIntervalSince1970: 947182440) // 2000-01-06 18:14 UTC
        var p = (Date().timeIntervalSince(refNewMoon) / 86400.0 / synodic).truncatingRemainder(dividingBy: 1)
        if p < 0 { p += 1 }
        return p
    }

    private var symbolName: String {
        let f = fraction
        switch f {
        case ..<0.03, 0.97...: return "moonphase.new.moon"
        case ..<0.22: return "moonphase.waxing.crescent"
        case ..<0.28: return "moonphase.first.quarter"
        case ..<0.47: return "moonphase.waxing.gibbous"
        case ..<0.53: return "moonphase.full.moon"
        case ..<0.72: return "moonphase.waning.gibbous"
        case ..<0.78: return "moonphase.last.quarter"
        default: return "moonphase.waning.crescent"
        }
    }

    var body: some View {
        Group {
            if #available(iOS 16.0, *) {
                Image(systemName: symbolName)
                    .symbolRenderingMode(.palette)
                    .foregroundStyle(Color(red: 0xee/255, green: 0xf2/255, blue: 1.0), Color.white.opacity(0.18))
            } else {
                Image(systemName: "moon.fill")
                    .foregroundColor(Color(red: 0xcd/255, green: 0xd6/255, blue: 1.0))
            }
        }
        .font(.system(size: size))
    }
}

// MARK: - Compact Widget View (Small)

struct CompactWidgetView: View {
    let entry: PrayerEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Dates + moon
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(TimeFormatter.formatGregorianDate())
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(WidgetColors.textSecondary)
                    Text(TimeFormatter.formatHijriDate())
                        .font(.system(size: 10))
                        .foregroundColor(WidgetColors.textTertiary)
                }
                Spacer()
                MoonView(size: 26)
            }

            Spacer()

            // Next prayer + progress
            if let nextPrayer = entry.nextPrayer {
                VStack(alignment: .leading, spacing: 5) {
                    Text("Until \(nextPrayer.label) · \(TimeFormatter.formatTimeShort(nextPrayer.date))")
                        .font(.system(size: 10))
                        .foregroundColor(WidgetColors.textTertiary)
                    CountdownText(date: nextPrayer.date, size: 24)
                    PrayerProgressBar(previous: entry.previousPrayer?.date, next: nextPrayer.date)
                }
            } else {
                Text("Loading...")
                    .font(.system(size: 14))
                    .foregroundColor(WidgetColors.textSecondary)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(WidgetColors.backgroundGradient)
    }
}

// MARK: - Medium Widget View

struct MediumWidgetView: View {
    let entry: PrayerEntry

    var body: some View {
        HStack(spacing: 16) {
            // Left side: Next prayer info
            VStack(alignment: .leading, spacing: 8) {
                // Dates + moon
                HStack(alignment: .top, spacing: 6) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(TimeFormatter.formatGregorianDate())
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(WidgetColors.textSecondary)
                        Text(TimeFormatter.formatHijriDate())
                            .font(.system(size: 10))
                            .foregroundColor(WidgetColors.textTertiary)
                    }
                    Spacer()
                    MoonView(size: 22)
                }

                Spacer()

                // Next prayer + progress
                if let nextPrayer = entry.nextPrayer {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("Until \(nextPrayer.label) · \(TimeFormatter.formatTimeShort(nextPrayer.date))")
                            .font(.system(size: 10))
                            .foregroundColor(WidgetColors.textTertiary)
                        CountdownText(date: nextPrayer.date, size: 28)
                        PrayerProgressBar(previous: entry.previousPrayer?.date, next: nextPrayer.date)
                    }
                }

                // Previous prayer
                if let prevPrayer = entry.previousPrayer {
                    HStack(spacing: 4) {
                        Text(prevPrayer.label)
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(WidgetColors.textTertiary)
                        Text(TimeFormatter.formatElapsed(from: prevPrayer.date))
                            .font(.system(size: 10))
                            .foregroundColor(WidgetColors.textTertiary)
                    }
                }
            }

            // Right side: Prayer list
            VStack(spacing: 4) {
                ForEach(Array(entry.data.prayers.prefix(6).enumerated()), id: \.offset) { index, prayer in
                    PrayerRowView(
                        prayer: prayer,
                        isHighlighted: index == entry.data.nextPrayerIndex,
                        showShortTime: true
                    )
                }
            }
            .frame(maxWidth: .infinity)
        }
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(WidgetColors.backgroundGradient)
    }
}

// MARK: - Large Widget View

struct LargeWidgetView: View {
    let entry: PrayerEntry

    var body: some View {
        VStack(spacing: 12) {
            // Header: dates · current time · moon
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(TimeFormatter.formatGregorianDate())
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(WidgetColors.textSecondary)
                    Text(TimeFormatter.formatHijriDate())
                        .font(.system(size: 12))
                        .foregroundColor(WidgetColors.textTertiary)
                }
                Spacer()
                HStack(spacing: 8) {
                    Text(TimeFormatter.formatTime(Date()))
                        .font(.system(size: 12))
                        .monospacedDigit()
                        .foregroundColor(WidgetColors.textSecondary)
                    MoonView(size: 28)
                }
            }

            // Next prayer card + progress
            if let nextPrayer = entry.nextPrayer {
                VStack(spacing: 10) {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Until \(nextPrayer.label)")
                                .font(.system(size: 11))
                                .foregroundColor(WidgetColors.textTertiary)
                            Text(nextPrayer.label)
                                .font(.system(size: 20, weight: .semibold))
                                .foregroundColor(WidgetColors.textPrimary)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 4) {
                            CountdownText(date: nextPrayer.date, size: 32)
                            Text("at \(TimeFormatter.formatTime(nextPrayer.date))")
                                .font(.system(size: 13))
                                .foregroundColor(WidgetColors.textSecondary)
                        }
                    }
                    PrayerProgressBar(previous: entry.previousPrayer?.date, next: nextPrayer.date)
                }
                .padding(14)
                .background(WidgetColors.cardBackground)
                .cornerRadius(14)
            }

            // Previous prayer
            if let prevPrayer = entry.previousPrayer {
                HStack(spacing: 4) {
                    Text(prevPrayer.label)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(WidgetColors.textTertiary)
                    Text(TimeFormatter.formatElapsed(from: prevPrayer.date))
                        .font(.system(size: 11))
                        .foregroundColor(WidgetColors.textTertiary)
                    Spacer()
                }
            }

            // Prayer list
            VStack(spacing: 6) {
                ForEach(Array(entry.data.prayers.prefix(6).enumerated()), id: \.offset) { index, prayer in
                    PrayerRowView(
                        prayer: prayer,
                        isHighlighted: index == entry.data.nextPrayerIndex,
                        showShortTime: false
                    )
                }
            }

            Spacer()
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(WidgetColors.backgroundGradient)
    }
}

// MARK: - Prayer Row View

struct PrayerRowView: View {
    let prayer: PrayerTimeData
    let isHighlighted: Bool
    let showShortTime: Bool

    var body: some View {
        HStack {
            Text(prayer.label)
                .font(.system(size: 13, weight: isHighlighted ? .semibold : .regular))
                .foregroundColor(isHighlighted ? WidgetColors.accentLight : WidgetColors.textSecondary)
            Spacer()
            Text(showShortTime ? TimeFormatter.formatTimeShort(prayer.date) : TimeFormatter.formatTime(prayer.date))
                .font(.system(size: 13, weight: isHighlighted ? .semibold : .regular))
                .foregroundColor(isHighlighted ? WidgetColors.accent : WidgetColors.textSecondary)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(isHighlighted ? WidgetColors.highlightBackground : Color.clear)
        .cornerRadius(8)
    }
}

// MARK: - Widget View Selector

struct MeeqatWidgetEntryView: View {
    var entry: PrayerEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        switch family {
        case .systemSmall:
            CompactWidgetView(entry: entry)
        case .systemMedium:
            MediumWidgetView(entry: entry)
        case .systemLarge:
            LargeWidgetView(entry: entry)
        default:
            CompactWidgetView(entry: entry)
        }
    }
}

// MARK: - Widget Configuration

@main
struct MeeqatWidget: Widget {
    let kind: String = "MeeqatWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: PrayerTimelineProvider()) { entry in
            MeeqatWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Prayer Times")
        .description("Shows upcoming prayer times with countdown")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

// MARK: - Widget Previews

struct MeeqatWidget_Previews: PreviewProvider {
    static var samplePrayers: [PrayerTimeData] {
        let now = Date()
        return [
            PrayerTimeData(prayerName: "Fajr", prayerTime: Int64((now.timeIntervalSince1970 - 3600) * 1000), label: "Fajr"),
            PrayerTimeData(prayerName: "Sunrise", prayerTime: Int64((now.timeIntervalSince1970 - 1800) * 1000), label: "Sunrise"),
            PrayerTimeData(prayerName: "Dhuhr", prayerTime: Int64((now.timeIntervalSince1970 + 3600) * 1000), label: "Dhuhr"),
            PrayerTimeData(prayerName: "Asr", prayerTime: Int64((now.timeIntervalSince1970 + 7200) * 1000), label: "Asr"),
            PrayerTimeData(prayerName: "Maghrib", prayerTime: Int64((now.timeIntervalSince1970 + 10800) * 1000), label: "Maghrib"),
            PrayerTimeData(prayerName: "Isha", prayerTime: Int64((now.timeIntervalSince1970 + 14400) * 1000), label: "Isha")
        ]
    }

    static var sampleEntry: PrayerEntry {
        let data = PrayerWidgetData(prayers: samplePrayers, nextPrayerIndex: 2, lastUpdated: Int64(Date().timeIntervalSince1970 * 1000))
        return PrayerEntry(
            date: Date(),
            data: data,
            nextPrayer: samplePrayers[2],
            previousPrayer: samplePrayers[1]
        )
    }

    static var previews: some View {
        Group {
            MeeqatWidgetEntryView(entry: sampleEntry)
                .previewContext(WidgetPreviewContext(family: .systemSmall))
                .previewDisplayName("Small")

            MeeqatWidgetEntryView(entry: sampleEntry)
                .previewContext(WidgetPreviewContext(family: .systemMedium))
                .previewDisplayName("Medium")

            MeeqatWidgetEntryView(entry: sampleEntry)
                .previewContext(WidgetPreviewContext(family: .systemLarge))
                .previewDisplayName("Large")
        }
    }
}
