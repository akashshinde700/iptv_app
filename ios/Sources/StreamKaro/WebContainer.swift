import Foundation
import SwiftUI
import UIKit
import WebKit

/// UI state shared between the SwiftUI chrome and the `WKWebView`.
@MainActor
final class WebStore: ObservableObject {
    /// 0…1 loading progress of the page that is currently coming in.
    @Published var progress: Double = 0
    /// True only until the first successful load (that is when the splash goes).
    @Published var showingSplash = true
    /// Non-nil → the shell shows its own "can't reach the server" screen.
    @Published var failure: String?
    /// True once a page has rendered at least once; later loads use a thin bar.
    @Published var hasLoadedOnce = false
    @Published var showSettings = false
    @Published var canGoBack = false
    @Published var isLoading = false

    /// Bumped by SwiftUI to ask the web view to reload / navigate.
    @Published var command: WebCommand?
    /// Pending deep link path (`/watch/123`) from `streamkaro://watch/123`.
    @Published var pendingPath: String?

    /// The server the shell is pointed at. Changed only by the settings sheet.
    @Published private(set) var baseURL: URL = AppConfig.baseURL

    weak var webView: WKWebView?

    func reload() {
        failure = nil
        if let webView, webView.url != nil {
            webView.reload()
        } else {
            command = WebCommand(kind: .load(baseURL))
        }
    }

    func retry() {
        failure = nil
        showingSplash = !hasLoadedOnce
        progress = 0
        command = WebCommand(kind: .load(baseURL))
    }

    func goHome() {
        pendingNavigation(to: "/")
    }

    /// Applies a new server URL from the settings sheet.
    func updateBaseURL(_ raw: String) -> Bool {
        guard AppConfig.setOverride(raw) else { return false }
        baseURL = AppConfig.baseURL
        hasLoadedOnce = false
        showingSplash = true
        failure = nil
        progress = 0
        command = WebCommand(kind: .load(baseURL))
        return true
    }

    func resetBaseURL() {
        AppConfig.resetOverride()
        baseURL = AppConfig.baseURL
        hasLoadedOnce = false
        showingSplash = true
        failure = nil
        progress = 0
        command = WebCommand(kind: .load(baseURL))
    }

    /// Deep links (`streamkaro://…`, universal links) route inside the app.
    func open(deepLink url: URL) {
        // streamkaro://watch/123 → path `/watch/123` (+ query/fragment)
        if url.scheme?.lowercased() == "streamkaro" {
            var path = "/" + (url.host ?? "") + url.path
            if path == "/" { path = "/" }
            if let query = url.query { path += "?" + query }
            if let fragment = url.fragment { path += "#" + fragment }
            pendingNavigation(to: path)
            return
        }

        // Universal links arrive as normal https URLs on the same host.
        guard url.host == baseURL.host else { return }
        pendingNavigation(to: url.absoluteString)
    }

    func pendingNavigation(to pathOrURL: String) {
        pendingPath = nil
        guard hasLoadedOnce else {
            // Not loaded yet: remember the destination and let RootView apply it.
            pendingPath = pathOrURL
            return
        }
        if pathOrURL.hasPrefix("http") {
            command = WebCommand(kind: .load(URL(string: pathOrURL) ?? baseURL))
        } else if let url = URL(string: pathOrURL, relativeTo: baseURL) {
            command = WebCommand(kind: .load(url))
        }
    }

    /// Called by the coordinator as the page loads.
    func update(progress value: Double) {
        progress = min(max(value, 0), 1)
        isLoading = value < 1
    }

    func didFinishLoading() {
        progress = 1
        isLoading = false
        hasLoadedOnce = true
        showingSplash = false
        failure = nil
    }

    func didFail(with message: String) {
        isLoading = false
        progress = 0
        failure = message
        // Keep the splash up while the error screen fades in behind it.
        if !hasLoadedOnce { showingSplash = false }
    }
}

/// One-shot instruction for the web view (loading a URL, or reloading).
struct WebCommand: Equatable {
    enum Kind: Equatable {
        case load(URL)
        case reload
    }

    let id = UUID()
    let kind: Kind
}

/// SwiftUI wrapper around the `WKWebView` that renders StreamKaro.
struct WebContainer: UIViewRepresentable {
    @ObservedObject var store: WebStore

    func makeCoordinator() -> Coordinator {
        Coordinator(store: store)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()

        // Video: plays inline unless the viewer taps the fullscreen button,
        // no tap-to-start requirement, and Picture-in-Picture is allowed.
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.allowsPictureInPictureMediaPlayback = true
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        if #available(iOS 15.4, *) {
            configuration.preferences.isElementFullscreenEnabled = true
        }

        let controller = configuration.userContentController
        controller.addUserScript(
            WKUserScript(
                source: Bridge.injectedScript,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )
        controller.add(context.coordinator, name: Bridge.handlerName)

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        // The website keeps its own navigation stack (it treats the iOS shell as
        // a native shell), so a native history gesture would fight it. Instead a
        // left-edge swipe is forwarded to `window.__skBack()` below.
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsLinkPreview = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.underPageBackgroundColor = UIColor(red: 0.035, green: 0.035, blue: 0.043, alpha: 1)
        webView.customUserAgent = context.coordinator.userAgent

        context.coordinator.observe(webView)
        context.coordinator.loadedURL = store.baseURL.absoluteString
        context.coordinator.attach(webView)
        context.coordinator.installEdgeSwipe(on: webView)

        webView.load(URLRequest(url: store.baseURL, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 30))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        // The base URL changed from the settings sheet.
        let target = store.baseURL.absoluteString
        if context.coordinator.loadedURL != target {
            context.coordinator.loadedURL = target
            webView.load(URLRequest(url: store.baseURL))
            return
        }

        // A command from SwiftUI (deep link, retry, reload).
        guard let command = store.command, command.id != context.coordinator.lastCommandID else { return }
        context.coordinator.lastCommandID = command.id
        switch command.kind {
        case .load(let url):
            webView.load(URLRequest(url: url))
        case .reload:
            webView.reload()
        }
    }

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        coordinator.detach()
        webView.configuration.userContentController.removeScriptMessageHandler(forName: Bridge.handlerName)
        webView.stopLoading()
        webView.navigationDelegate = nil
        webView.uiDelegate = nil
    }

    // MARK: - Coordinator

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
        let store: WebStore
        private var observations: [NSKeyValueObservation] = []

        var loadedURL: String?
        var lastCommandID: UUID?

        init(store: WebStore) {
            self.store = store
        }

        /// Safari-ish UA + a marker the website can detect
        /// (`navigator.userAgent.includes("StreamKaro-iOS")`).
        var userAgent: String {
            let base = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
            return "\(base) \(AppConfig.userAgentSuffix)"
        }

        func attach(_ webView: WKWebView) {
            store.webView = webView
        }

        func detach() {
            observations.forEach { $0.invalidate() }
            observations.removeAll()
            store.webView = nil
        }

        /// KVO on progress / title / back-forward list — WKWebView has no delegate callbacks for these.
        func observe(_ webView: WKWebView) {
            observations.append(webView.observe(\.estimatedProgress, options: [.new]) { [weak self] webView, _ in
                let value = webView.estimatedProgress
                Task { @MainActor in self?.store.update(progress: value) }
            })
            observations.append(webView.observe(\.canGoBack, options: [.new]) { [weak self] webView, _ in
                let value = webView.canGoBack
                Task { @MainActor in self?.store.canGoBack = value }
            })
        }

        // MARK: Back gesture

        /// Swipe in from the left edge → the web app's own Back handling
        /// (closes dialogs, leaves fullscreen, pops the screen stack, asks
        /// "Exit StreamKaro?" at the root). Same entry point the Android
        /// shell's hardware Back button uses.
        func installEdgeSwipe(on webView: WKWebView) {
            let swipe = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(handleEdgeSwipe(_:)))
            swipe.edges = .left
            swipe.maximumNumberOfTouches = 1
            swipe.cancelsTouchesInView = false
            webView.addGestureRecognizer(swipe)
        }

        @objc private func handleEdgeSwipe(_ recognizer: UIScreenEdgePanGestureRecognizer) {
            guard recognizer.state == .ended else { return }
            store.webView?.evaluateJavaScript(
                "window.__skBack ? window.__skBack() : 'unhandled'",
                completionHandler: nil
            )
        }

        // MARK: Navigation

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }

            let scheme = url.scheme?.lowercased() ?? ""

            // window.open / target=_blank: send it to Safari instead of losing it.
            if navigationAction.targetFrame == nil {
                NativeActions.openExternally(url, from: webView)
                decisionHandler(.cancel)
                return
            }

            switch scheme {
            case "http", "https":
                if isSameOrigin(url) {
                    decisionHandler(.allow)
                } else {
                    NativeActions.openExternally(url, from: webView)
                    decisionHandler(.cancel)
                }
            case "about", "data", "blob":
                decisionHandler(.allow)
            case "streamkaro":
                store.open(deepLink: url)
                decisionHandler(.allow)
            default:
                // tel:, mailto:, sms:, itms-services:, etc.
                NativeActions.openExternally(url, from: webView)
                decisionHandler(.cancel)
            }
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            store.isLoading = true
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            store.didFinishLoading()
            // Deep link that arrived before the first page finished loading.
            if let path = store.pendingPath {
                store.pendingPath = nil
                store.pendingNavigation(to: path)
            }
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            handle(error: error, webView: webView)
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            handle(error: error, webView: webView)
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationResponse: WKNavigationResponse,
            decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
        ) {
            if navigationResponse.isForMainFrame,
               let response = navigationResponse.response as? HTTPURLResponse,
               response.statusCode >= 500 {
                store.didFail(with: "The StreamKaro server answered with an error (\(response.statusCode)). It may be restarting — try again in a moment.")
                decisionHandler(.allow)
                return
            }
            decisionHandler(.allow)
        }

        /// Cancelled navigations (`NSURLErrorCancelled`) are normal, not failures.
        private func handle(error: Error, webView: WKWebView) {
            let nsError = error as NSError
            guard nsError.code != NSURLErrorCancelled else { return }

            let offline = nsError.code == NSURLErrorNotConnectedToInternet
                || nsError.code == NSURLErrorNetworkConnectionLost
            let timedOut = nsError.code == NSURLErrorTimedOut
            let unreachable = nsError.code == NSURLErrorCannotFindHost
                || nsError.code == NSURLErrorCannotConnectToHost
                || nsError.code == NSURLErrorDNSLookupFailed

            let message: String
            if offline {
                message = "No internet connection. Check your Wi-Fi or mobile data, then tap Try again."
            } else if timedOut {
                message = "The server took too long to answer. Try again — or switch to another server in Settings."
            } else if unreachable {
                message = "Can't reach \(store.baseURL.host ?? "the server"). Check the address in Settings, or try again when you're online."
            } else {
                message = "Something went wrong while loading StreamKaro. \(nsError.localizedDescription)"
            }
            store.didFail(with: message)
        }

        /// Same host, or any subdomain of it (www./api./cdn.).
        private func isSameOrigin(_ url: URL) -> Bool {
            guard let host = url.host?.lowercased(), let base = store.baseURL.host?.lowercased() else {
                return false
            }
            if host == base { return true }
            return host.hasSuffix("." + base)
        }

        // MARK: WKUIDelegate

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if let url = navigationAction.request.url {
                NativeActions.openExternally(url, from: webView)
            }
            return nil
        }

        func webView(
            _ webView: WKWebView,
            runJavaScriptAlertPanelWithMessage message: String,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping () -> Void
        ) {
            let alert = UIAlertController(title: AppConfig.appName, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
            NativeActions.topViewController()?.present(alert, animated: true)
        }

        func webView(
            _ webView: WKWebView,
            runJavaScriptConfirmPanelWithMessage message: String,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping (Bool) -> Void
        ) {
            let alert = UIAlertController(title: AppConfig.appName, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
            NativeActions.topViewController()?.present(alert, animated: true)
        }

        // MARK: WKScriptMessageHandler

        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            guard let payload = message.body as? [String: Any],
                  let name = payload["name"] as? String
            else { return }
            let body = payload["body"] as? [String: Any] ?? [:]
            let sender = store.webView

            switch name {
            case "keepAwake":
                UIApplication.shared.isIdleTimerDisabled = body["on"] as? Bool ?? false

            case "haptic":
                NativeActions.haptic(body["style"] as? String ?? "light")

            case "share":
                let rawURL = body["url"] as? String
                NativeActions.share(
                    url: rawURL.flatMap(URL.init(string:)),
                    title: body["title"] as? String,
                    from: sender
                )

            case "openExternal":
                if let raw = body["url"] as? String, let url = URL(string: raw) {
                    NativeActions.openExternally(url, from: sender)
                }

            case "openSettings":
                store.showSettings = true

            case "foreground":
                // no-op: the shell drives this itself

            default:
                break
            }
        }
    }
}
