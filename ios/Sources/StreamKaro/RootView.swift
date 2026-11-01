import SwiftUI

/// The whole app: the StreamKaro website, plus the native bits around it —
/// branded splash, offline retry, server settings and deep links.
struct RootView: View {
    @StateObject private var store = WebStore()
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ZStack(alignment: .top) {
            Color.streamKaroBackground
                .ignoresSafeArea()

            WebContainer(store: store)
                .ignoresSafeArea()

            // Branded launch screen — only until the first page paints.
            if store.showingSplash {
                SplashView(progress: store.progress)
                    .transition(.opacity)
                    .zIndex(2)
            }

            // Thin amber bar for later in-app navigations (no full splash).
            if !store.showingSplash && store.isLoading && store.failure == nil {
                LoadingBar(progress: store.progress)
                    .transition(.opacity)
                    .zIndex(3)
            }

            if let failure = store.failure {
                OfflineView(
                    message: failure,
                    baseURL: store.baseURL,
                    onRetry: { store.retry() },
                    onSettings: { store.showSettings = true }
                )
                .transition(.opacity)
                .zIndex(4)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: store.showingSplash)
        .animation(.easeInOut(duration: 0.2), value: store.failure)
        .preferredColorScheme(.dark)
        .sheet(isPresented: $store.showSettings) {
            ServerSettingsView(store: store)
        }
        .onReceive(NotificationCenter.default.publisher(for: .streamKaroOpenURL)) { note in
            guard let url = note.object as? URL else { return }
            store.showSettings = false
            store.open(deepLink: url)
        }
        .onAppear {
            // Cold start from streamkaro://… or a universal link: the notification
            // fired before this view existed, so collect it here.
            if let url = AppDelegate.pendingURL {
                AppDelegate.pendingURL = nil
                store.open(deepLink: url)
            }
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            // Coming back to a dead page: retry instead of showing yesterday's error.
            if store.failure != nil {
                store.retry()
            } else {
                store.webView?.evaluateJavaScript(Bridge.foregroundScript, completionHandler: nil)
            }
        }
    }
}

// MARK: - Splash

private struct SplashView: View {
    let progress: Double

    var body: some View {
        ZStack {
            Color.streamKaroBackground.ignoresSafeArea()

            VStack(spacing: 22) {
                BrandMark(size: 104)
                    .shadow(color: Color.streamKaroAmber.opacity(0.45), radius: 32, y: 12)

                VStack(spacing: 6) {
                    Text("StreamKaro")
                        .font(.system(size: 30, weight: .heavy, design: .rounded))
                        .foregroundStyle(.white)
                    Text("Live TV, movies and shows")
                        .font(.subheadline)
                        .foregroundStyle(Color.white.opacity(0.55))
                }

                ProgressView()
                    .progressViewStyle(.linear)
                    .tint(Color.streamKaroAmber)
                    .frame(width: 168)
                    .scaleEffect(y: 0.7)

                Text(progress > 0 ? "Loading your channels…" : "Connecting…")
                    .font(.footnote)
                    .foregroundStyle(Color.white.opacity(0.4))
                    .animation(.none, value: progress)
            }
            .padding(32)
        }
    }
}

/// Amber rounded square with a play badge — drawn in SwiftUI so the shell needs
/// no image assets (the real artwork is the AppIcon.png baked into the bundle).
struct BrandMark: View {
    var size: CGFloat = 72

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.24, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [Color.streamKaroAmber, Color(red: 0.85, green: 0.35, blue: 0.03)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
            Image(systemName: "play.tv.fill")
                .font(.system(size: size * 0.42, weight: .bold))
                .foregroundStyle(.black.opacity(0.82))
        }
        .frame(width: size, height: size)
    }
}

// MARK: - Loading bar

private struct LoadingBar: View {
    let progress: Double

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                Color.clear
                Rectangle()
                    .fill(Color.streamKaroAmber)
                    .frame(width: max(2, geometry.size.width * progress), height: 2.5)
            }
        }
        .frame(height: 2.5)
        .allowsHitTesting(false)
    }
}

// MARK: - Offline / error

private struct OfflineView: View {
    let message: String
    let baseURL: URL
    let onRetry: () -> Void
    let onSettings: () -> Void

    var body: some View {
        ZStack {
            Color.streamKaroBackground.ignoresSafeArea()

            VStack(spacing: 18) {
                Image(systemName: "wifi.exclamationmark")
                    .font(.system(size: 44, weight: .semibold))
                    .foregroundStyle(Color.streamKaroAmber)

                Text("Can't reach StreamKaro")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(.white)

                Text(message)
                    .font(.subheadline)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Color.white.opacity(0.6))
                    .frame(maxWidth: 320)

                VStack(spacing: 10) {
                    Button(action: onRetry) {
                        Text("Try again")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(Color.streamKaroAmber, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .foregroundStyle(.black)
                    }

                    Button(action: onSettings) {
                        Text("Server settings")
                            .font(.subheadline.weight(.semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .foregroundStyle(.white)
                    }
                }
                .frame(maxWidth: 320)

                Text(baseURL.absoluteString)
                    .font(.caption2.monospaced())
                    .foregroundStyle(Color.white.opacity(0.35))
                    .multilineTextAlignment(.center)
                    .textSelection(.enabled)
            }
            .padding(28)
        }
    }
}

// MARK: - Palette

extension Color {
    static let streamKaroBackground = Color(red: 0.035, green: 0.035, blue: 0.043)
    static let streamKaroAmber = Color(red: 0.96, green: 0.62, blue: 0.04)
}
