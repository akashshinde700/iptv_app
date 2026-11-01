// swift-tools-version: 5.9

import PackageDescription

/**
 * StreamKaro iOS app — an xtool (https://github.com/xtool-org/xtool) SwiftPM
 * project, so it can be built and installed **from Linux or Windows**, with no
 * Mac and no Xcode.
 *
 * The app is a native SwiftUI shell around the deployed StreamKaro website:
 * WKWebView + Picture-in-Picture, AirPlay, background audio, deep links and an
 * offline retry screen. Every channel, playlist and UI improvement you deploy
 * to the website shows up in the app instantly — only native-shell changes need
 * a new build.
 *
 * Build:   xtool dev          (build + install on a connected iPhone/iPad)
 *          xtool dev build --ipa --sign
 * Docs:    docs/IOS_APP.md
 */
let package = Package(
    name: "StreamKaro",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        // An xtool project contains exactly one library product: the app itself.
        .library(
            name: "StreamKaro",
            targets: ["StreamKaro"]
        ),
    ],
    targets: [
        .target(
            name: "StreamKaro",
            path: "Sources/StreamKaro"
        ),
    ]
)
