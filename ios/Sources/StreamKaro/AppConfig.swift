import Foundation

/// Where the app points and what it calls itself.
///
/// The StreamKaro iOS app is a native shell around the deployed website, so the
/// only piece of configuration that matters is the base URL. It can be:
///
///   1. baked in at build time  → `ios/Support/Info.plist` → `StreamKaroBaseURL`
///   2. changed at runtime      → in-app “Server settings” (stored in UserDefaults)
///
/// (2) exists because self-hosted deployments move: if your domain changes you
/// can fix a phone that is already in someone’s pocket instead of shipping a
/// new build.
enum AppConfig {
    /// Info.plist key holding the build-time URL.
    static let plistBaseURLKey = "StreamKaroBaseURL"

    /// UserDefaults key holding the runtime override.
    static let overrideKey = "streamkaro.baseURLOverride"

    /// Last-resort default, used only when the Info.plist key is missing.
    static let fallbackURLString = "https://www.streamkaro.aetherdevsolutions.in"

    /// The URL to load: runtime override, else Info.plist, else the fallback.
    static var baseURL: URL {
        for candidate in [overrideURLString, plistURLString, fallbackURLString] {
            if let url = normalise(candidate) {
                return url
            }
        }
        // Unreachable in practice: `normalise` always accepts the fallback.
        return URL(string: fallbackURLString)!
    }

    static var plistURLString: String? {
        Bundle.main.object(forInfoDictionaryKey: plistBaseURLKey) as? String
    }

    static var overrideURLString: String? {
        UserDefaults.standard.string(forKey: overrideKey)
    }

    /// True when the viewer pointed the app somewhere themselves.
    static var hasOverride: Bool {
        normalise(overrideURLString) != nil
    }

    /// Saves (or clears) the runtime override. Returns `false` if the URL is junk.
    @discardableResult
    static func setOverride(_ raw: String?) -> Bool {
        let trimmed = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            UserDefaults.standard.removeObject(forKey: overrideKey)
            return true
        }
        guard let url = normalise(trimmed) else { return false }
        UserDefaults.standard.set(url.absoluteString, forKey: overrideKey)
        return true
    }

    static func resetOverride() {
        UserDefaults.standard.removeObject(forKey: overrideKey)
    }

    /// “1.0 (1)” style version string for the settings sheet.
    static var versionDescription: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "0.0"
        let build = info?["CFBundleVersion"] as? String ?? "0"
        return "\(short) (\(build))"
    }

    /// Adds the scheme when it is missing and rejects anything that is not http(s).
    static func normalise(_ raw: String?) -> URL? {
        guard var text = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else {
            return nil
        }
        if !text.contains("://") {
            text = "https://" + text
        }
        guard let url = URL(string: text),
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https",
              let host = url.host, !host.isEmpty
        else { return nil }

        // Keep the base URL free of trailing slashes so path joins stay clean.
        var components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        if components?.path.hasSuffix("/") == true, components?.path != "/" {
            components?.path = components!.path.replacingOccurrences(of: "/+$", with: "", options: .regularExpression)
        }
        return components?.url ?? url
    }

    /// The app is a real installable client, not Safari — tell the website so it
    /// can skip “add to home screen” nags and enable app-only affordances.
    static let userAgentSuffix = "StreamKaro-iOS/\(versionDescription.components(separatedBy: " ").first ?? "1.0")"
}
