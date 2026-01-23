import Foundation

/// Shared data model for prayer times between main app and widget
struct PrayerTimeData: Codable {
    let prayerName: String
    let prayerTime: Int64  // Unix timestamp in milliseconds
    let label: String

    var date: Date {
        Date(timeIntervalSince1970: Double(prayerTime) / 1000.0)
    }
}

/// Container for all prayer data stored in shared UserDefaults
struct PrayerWidgetData: Codable {
    let prayers: [PrayerTimeData]
    let nextPrayerIndex: Int
    let lastUpdated: Int64

    static let empty = PrayerWidgetData(prayers: [], nextPrayerIndex: 0, lastUpdated: 0)
}

/// Manages shared data between the main app and widget via App Groups
class PrayerDataManager {
    static let shared = PrayerDataManager()

    // IMPORTANT: This must match the App Group configured in both app and widget entitlements
    private let appGroupIdentifier = "group.com.meeqat.app"
    private let prayersKey = "prayers_json"
    private let nextPrayerIndexKey = "next_prayer_index"
    private let lastUpdatedKey = "last_updated"

    private var sharedDefaults: UserDefaults? {
        UserDefaults(suiteName: appGroupIdentifier)
    }

    /// Save prayer data to shared UserDefaults (called from main app)
    func savePrayerData(_ data: PrayerWidgetData) {
        guard let defaults = sharedDefaults else { return }

        if let encoded = try? JSONEncoder().encode(data.prayers) {
            defaults.set(encoded, forKey: prayersKey)
        }
        defaults.set(data.nextPrayerIndex, forKey: nextPrayerIndexKey)
        defaults.set(data.lastUpdated, forKey: lastUpdatedKey)
        defaults.synchronize()
    }

    /// Load prayer data from shared UserDefaults (called from widget)
    func loadPrayerData() -> PrayerWidgetData {
        guard let defaults = sharedDefaults else { return .empty }

        let nextPrayerIndex = defaults.integer(forKey: nextPrayerIndexKey)
        let lastUpdated = defaults.object(forKey: lastUpdatedKey) as? Int64 ?? 0

        guard let data = defaults.data(forKey: prayersKey),
              let prayers = try? JSONDecoder().decode([PrayerTimeData].self, from: data) else {
            return .empty
        }

        return PrayerWidgetData(
            prayers: prayers,
            nextPrayerIndex: nextPrayerIndex,
            lastUpdated: lastUpdated
        )
    }

    /// Get the next prayer based on current time
    func getNextPrayer(from data: PrayerWidgetData) -> PrayerTimeData? {
        let now = Date()
        return data.prayers.first { $0.date > now } ?? data.prayers.first
    }

    /// Get the previous prayer (most recent passed prayer)
    func getPreviousPrayer(from data: PrayerWidgetData) -> PrayerTimeData? {
        let now = Date()
        return data.prayers.filter { $0.date <= now }.last
    }
}
