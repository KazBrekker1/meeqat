import UIKit
import WebKit
import Tauri
import WidgetKit

/// Prayer time data model matching the Rust model
struct PrayerTimeData: Codable {
    let prayerName: String
    let prayerTime: Int64
    let label: String
}

/// Arguments for starting/updating the service
struct ServiceArgs: Decodable {
    let prayers: [PrayerTimeData]
    let nextPrayerIndex: Int
}

/// Status response
struct ServiceStatus: Codable, Encodable {
    let isRunning: Bool
}

/// Permission status response
struct PermissionStatus: Codable, Encodable {
    let granted: Bool
    let canRequest: Bool
}

/// Permission result response
struct PermissionResult: Codable, Encodable {
    let granted: Bool
}

/// Battery optimization status (not applicable on iOS)
struct BatteryOptimizationStatus: Codable, Encodable {
    let isIgnoringBatteryOptimizations: Bool
    let canRequest: Bool
}

/// Battery optimization result (not applicable on iOS)
struct BatteryOptimizationResult: Codable, Encodable {
    let notRequired: Bool?
}

class PrayerServicePlugin: Plugin {
    // App Group identifier for sharing data with widget
    private let appGroupIdentifier = "group.com.meeqat.app"
    private let prayersKey = "prayers_json"
    private let nextPrayerIndexKey = "next_prayer_index"
    private let lastUpdatedKey = "last_updated"
    private let serviceEnabledKey = "service_enabled"

    private var sharedDefaults: UserDefaults? {
        UserDefaults(suiteName: appGroupIdentifier)
    }

    @objc override public func load(webview: WKWebView) {
        // Plugin loaded
    }

    /// Start the "service" - on iOS this just saves data and triggers widget refresh
    @objc public func startService(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(ServiceArgs.self)

        savePrayerData(prayers: args.prayers, nextPrayerIndex: args.nextPrayerIndex)

        // Trigger widget refresh
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }

        invoke.resolve()
    }

    /// Stop the "service" - clear the enabled flag
    @objc public func stopService(_ invoke: Invoke) throws {
        sharedDefaults?.set(false, forKey: serviceEnabledKey)
        sharedDefaults?.synchronize()

        // Refresh widgets to show stopped state
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }

        invoke.resolve()
    }

    /// Update prayer times
    @objc public func updatePrayerTimes(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(ServiceArgs.self)

        savePrayerData(prayers: args.prayers, nextPrayerIndex: args.nextPrayerIndex)

        // Trigger widget refresh
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }

        invoke.resolve()
    }

    /// Check if service is "running" - on iOS we just check the enabled flag
    @objc public func isServiceRunning(_ invoke: Invoke) throws {
        let isEnabled = sharedDefaults?.bool(forKey: serviceEnabledKey) ?? false
        let status = ServiceStatus(isRunning: isEnabled)
        invoke.resolve(status)
    }

    /// Check notification permission status
    @objc public func checkNotificationPermission(_ invoke: Invoke) throws {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let granted = settings.authorizationStatus == .authorized
            let canRequest = settings.authorizationStatus == .notDetermined
            let status = PermissionStatus(granted: granted, canRequest: canRequest)
            invoke.resolve(status)
        }
    }

    /// Request notification permission
    @objc public func requestNotificationPermission(_ invoke: Invoke) throws {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            let result = PermissionResult(granted: granted)
            invoke.resolve(result)
        }
    }

    /// Check battery optimization - not applicable on iOS
    @objc public func checkBatteryOptimization(_ invoke: Invoke) throws {
        // Battery optimization exemption is not a concept on iOS
        let status = BatteryOptimizationStatus(
            isIgnoringBatteryOptimizations: true,
            canRequest: false
        )
        invoke.resolve(status)
    }

    /// Request battery optimization exemption - not applicable on iOS
    @objc public func requestBatteryOptimizationExemption(_ invoke: Invoke) throws {
        // Battery optimization exemption is not a concept on iOS
        let result = BatteryOptimizationResult(notRequired: true)
        invoke.resolve(result)
    }

    /// Open app settings
    @objc public func openAppSettings(_ invoke: Invoke) throws {
        DispatchQueue.main.async {
            if let settingsUrl = URL(string: UIApplication.openSettingsURLString) {
                if UIApplication.shared.canOpenURL(settingsUrl) {
                    UIApplication.shared.open(settingsUrl)
                }
            }
        }
        invoke.resolve()
    }

    // MARK: - Private helpers

    private func savePrayerData(prayers: [PrayerTimeData], nextPrayerIndex: Int) {
        guard let defaults = sharedDefaults else { return }

        if let encoded = try? JSONEncoder().encode(prayers) {
            defaults.set(encoded, forKey: prayersKey)
        }
        defaults.set(nextPrayerIndex, forKey: nextPrayerIndexKey)
        defaults.set(Int64(Date().timeIntervalSince1970 * 1000), forKey: lastUpdatedKey)
        defaults.set(true, forKey: serviceEnabledKey)
        defaults.synchronize()
    }
}

@_cdecl("init_plugin_prayer_service")
func initPlugin() -> Plugin {
    return PrayerServicePlugin()
}
