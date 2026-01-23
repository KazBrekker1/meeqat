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
    static let background = Color(red: 30/255, green: 30/255, blue: 30/255)  // #1E1E1E
    static let cardBackground = Color(red: 40/255, green: 40/255, blue: 40/255)  // #282828
    static let accent = Color(red: 99/255, green: 102/255, blue: 241/255)  // Indigo #6366F1
    static let accentLight = Color(red: 129/255, green: 140/255, blue: 248/255)  // Light indigo
    static let textPrimary = Color.white
    static let textSecondary = Color.white.opacity(0.7)
    static let textTertiary = Color.white.opacity(0.5)
    static let highlightBackground = Color(red: 99/255, green: 102/255, blue: 241/255).opacity(0.2)
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

// MARK: - Compact Widget View (Small)

struct CompactWidgetView: View {
    let entry: PrayerEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Dates
            VStack(alignment: .leading, spacing: 2) {
                Text(TimeFormatter.formatGregorianDate())
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(WidgetColors.textSecondary)
                Text(TimeFormatter.formatHijriDate())
                    .font(.system(size: 10))
                    .foregroundColor(WidgetColors.textTertiary)
            }

            Spacer()

            // Next prayer
            if let nextPrayer = entry.nextPrayer {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Next Prayer")
                        .font(.system(size: 10))
                        .foregroundColor(WidgetColors.textTertiary)
                    Text(nextPrayer.label)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(WidgetColors.textPrimary)
                    Text(TimeFormatter.formatCountdown(to: nextPrayer.date))
                        .font(.system(size: 24, weight: .bold))
                        .foregroundColor(WidgetColors.accent)
                }
            } else {
                Text("Loading...")
                    .font(.system(size: 14))
                    .foregroundColor(WidgetColors.textSecondary)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(WidgetColors.background)
    }
}

// MARK: - Medium Widget View

struct MediumWidgetView: View {
    let entry: PrayerEntry

    var body: some View {
        HStack(spacing: 16) {
            // Left side: Next prayer info
            VStack(alignment: .leading, spacing: 8) {
                // Dates
                VStack(alignment: .leading, spacing: 2) {
                    Text(TimeFormatter.formatGregorianDate())
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(WidgetColors.textSecondary)
                    Text(TimeFormatter.formatHijriDate())
                        .font(.system(size: 10))
                        .foregroundColor(WidgetColors.textTertiary)
                }

                Spacer()

                // Next prayer
                if let nextPrayer = entry.nextPrayer {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Next Prayer")
                            .font(.system(size: 10))
                            .foregroundColor(WidgetColors.textTertiary)
                        Text(nextPrayer.label)
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundColor(WidgetColors.textPrimary)
                        Text(TimeFormatter.formatCountdown(to: nextPrayer.date))
                            .font(.system(size: 28, weight: .bold))
                            .foregroundColor(WidgetColors.accent)
                        Text(TimeFormatter.formatTime(nextPrayer.date))
                            .font(.system(size: 12))
                            .foregroundColor(WidgetColors.textSecondary)
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
        .background(WidgetColors.background)
    }
}

// MARK: - Large Widget View

struct LargeWidgetView: View {
    let entry: PrayerEntry

    var body: some View {
        VStack(spacing: 12) {
            // Header: Dates
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(TimeFormatter.formatGregorianDate())
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(WidgetColors.textSecondary)
                    Text(TimeFormatter.formatHijriDate())
                        .font(.system(size: 12))
                        .foregroundColor(WidgetColors.textTertiary)
                }
                Spacer()
            }

            // Next prayer card
            if let nextPrayer = entry.nextPrayer {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Next Prayer")
                            .font(.system(size: 11))
                            .foregroundColor(WidgetColors.textTertiary)
                        Text(nextPrayer.label)
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundColor(WidgetColors.textPrimary)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 4) {
                        Text(TimeFormatter.formatCountdown(to: nextPrayer.date))
                            .font(.system(size: 32, weight: .bold))
                            .foregroundColor(WidgetColors.accent)
                        Text(TimeFormatter.formatTime(nextPrayer.date))
                            .font(.system(size: 13))
                            .foregroundColor(WidgetColors.textSecondary)
                    }
                }
                .padding(12)
                .background(WidgetColors.highlightBackground)
                .cornerRadius(12)
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
        .background(WidgetColors.background)
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
                .foregroundColor(isHighlighted ? WidgetColors.textPrimary : WidgetColors.textSecondary)
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
