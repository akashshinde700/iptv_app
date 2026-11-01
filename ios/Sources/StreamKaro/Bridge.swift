import Foundation
import SafariServices
import UIKit
import WebKit

/// The two-way bridge between the StreamKaro website and the native shell.
///
/// Nothing in the web app *has* to know about the shell — it works inside
/// WKWebView with zero changes. But when the page wants to look native it can:
///
/// ```js
/// window.StreamKaroNative?.share({ url, title })   // iOS share sheet
/// window.StreamKaroNative?.haptic("medium")        // tap feedback
/// window.StreamKaroNative?.keepAwake(true)         // stop the screen dimming
/// window.StreamKaroNative?.openSettings()          // point the app at another server
/// ```
///
/// Messages arrive on the native side in `WebContainer.Coordinator`.
enum Bridge {
    /// `WKScriptMessageHandler` name used in both directions.
    static let handlerName = "streamkaro"

    /// Injected at `documentStart` so the web app can feature-detect the shell
    /// before React hydrates (`window.StreamKaroNative`, `.streamkaro-ios` class).
    ///
    /// It also keeps the screen awake while video is *actually* playing — the
    /// native side never guesses, it listens to the video elements.
    static let injectedScript = """
    (function () {
      if (window.StreamKaroNative) { return; }
      var handler = window.webkit && window.webkit.messageHandlers
        ? window.webkit.messageHandlers.\(handlerName)
        : null;

      function post(name, body) {
        try {
          if (handler) { handler.postMessage({ name: name, body: body || {} }); }
        } catch (e) { /* handler gone after page swap — ignore */ }
      }

      var awake = false;

      function isPlaying() {
        var videos = document.getElementsByTagName('video');
        for (var i = 0; i < videos.length; i++) {
          var v = videos[i];
          if (!v.paused && !v.ended && v.readyState >= 2) { return true; }
        }
        return false;
      }

      function syncAwake() {
        var next = isPlaying();
        if (next === awake) { return; }
        awake = next;
        post('keepAwake', { on: next });
      }

      window.StreamKaroNative = {
        version: 1,
        platform: 'ios',
        post: post,
        share: function (payload) { post('share', payload || {}); },
        haptic: function (style) { post('haptic', { style: style || 'light' }); },
        keepAwake: function (on) { post('keepAwake', { on: !!on }); },
        openExternal: function (url) { post('openExternal', { url: String(url || '') }); },
        openSettings: function () { post('openSettings', {}); },
        // Set by the shell: called when the app comes back to the foreground.
        onAppForeground: null
      };

      ['play', 'playing', 'pause', 'ended', 'emptied'].forEach(function (event) {
        document.addEventListener(event, syncAwake, true);
      });
      document.addEventListener('visibilitychange', syncAwake, true);
      setInterval(syncAwake, 2500);

      document.documentElement.classList.add('streamkaro-native', 'streamkaro-ios');
      post('ready', { url: String(location.href) });
    })();
    """

    /// Fired when the shell regains focus, so a stalled player can re-check itself.
    static let foregroundScript = """
    (function () {
      try {
        if (window.StreamKaroNative && window.StreamKaroNative.onAppForeground) {
          window.StreamKaroNative.onAppForeground();
        }
      } catch (e) {}
    })();
    """
}

/// Small helpers that need a UIKit thread and no stored state.
enum NativeActions {
    /// Shows the system share sheet for a link/title pair coming from the web app.
    @MainActor
    static func share(url: URL?, title: String?, from view: UIView?) {
        var items: [Any] = []
        if let title, !title.isEmpty { items.append(title) }
        if let url { items.append(url) }
        guard !items.isEmpty else { return }

        let controller = UIActivityViewController(activityItems: items, applicationActivities: nil)
        controller.popoverPresentationController?.sourceView = view
        controller.popoverPresentationController?.sourceRect = view?.bounds ?? .zero
        topViewController()?.present(controller, animated: true)
    }

    /// Opens a link in Safari (or the matching app for tel:/mailto: links).
    @MainActor
    static func openExternally(_ url: URL, from view: UIView?) {
        if ["http", "https"].contains(url.scheme?.lowercased() ?? "") {
            topViewController()?.present(SFSafariViewController(url: url), animated: true)
        } else {
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
        }
    }

    @MainActor
    static func haptic(_ style: String) {
        switch style {
        case "success": UINotificationFeedbackGenerator().notificationOccurred(.success)
        case "warning": UINotificationFeedbackGenerator().notificationOccurred(.warning)
        case "error": UINotificationFeedbackGenerator().notificationOccurred(.error)
        case "heavy":
            let generator = UIImpactFeedbackGenerator(style: .heavy)
            generator.impactOccurred()
        case "medium":
            let generator = UIImpactFeedbackGenerator(style: .medium)
            generator.impactOccurred()
        default:
            let generator = UIImpactFeedbackGenerator(style: .light)
            generator.impactOccurred()
        }
    }

    @MainActor
    static func topViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let window = scenes.flatMap { $0.windows }.first { $0.isKeyWindow }
            ?? scenes.first?.windows.first
        var top = window?.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        return top
    }
}
