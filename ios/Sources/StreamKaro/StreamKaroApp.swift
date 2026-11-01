import AVFoundation
import SwiftUI
import UIKit

@main
struct StreamKaroApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}

/// `ObservableObject` is required by `@UIApplicationDelegateAdaptor`.
final class AppDelegate: NSObject, UIApplicationDelegate, ObservableObject {
    /// A link that launched the app before any view existed (cold start from a
    /// QR code or a share sheet). `RootView` picks it up on appear.
    static var pendingURL: URL?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        configureAudioSession()
        return true
    }

    /// `streamkaro://watch/123` from a QR code, a share sheet or a notification.
    func application(
        _ app: UIApplication,
        open url: URL,
        options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    ) -> Bool {
        AppDelegate.pendingURL = url
        NotificationCenter.default.post(name: .streamKaroOpenURL, object: url)
        return true
    }

    /// Universal links (https://your-site/watch/123) — needs the associated
    /// domains entitlement; see docs/IOS_APP.md §Universal links.
    func application(
        _ application: UIApplication,
        continue userActivity: NSUserActivity,
        restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
    ) -> Bool {
        guard userActivity.activityType == NSUserActivityTypeBrowsingWeb,
              let url = userActivity.webpageURL
        else { return false }
        AppDelegate.pendingURL = url
        NotificationCenter.default.post(name: .streamKaroOpenURL, object: url)
        return true
    }

    /// Video keeps playing (and PiP keeps working) when the viewer backgrounds
    /// the app or flips the silent switch.
    private func configureAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .moviePlayback, options: [.allowAirPlay, .allowBluetoothA2DP])
            try session.setActive(true)
        } catch {
            // Not fatal: playback still works, it just may pause in the background.
        }
    }
}

extension Notification.Name {
    /// Posted with the `URL` as the notification object.
    static let streamKaroOpenURL = Notification.Name("StreamKaroOpenURL")
}

extension AppConfig {
    /// Display name from the bundle ("StreamKaro"), used in native dialogs.
    static var appName: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String ?? "StreamKaro"
    }
}
