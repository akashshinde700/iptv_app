import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

/*
 * Fonts are self-hosted (`geist` package), not fetched from Google at build time.
 * `next/font/google` downloads the files during `next build`, so any offline build, air-gapped
 * CI runner or restrictive firewall failed the whole build with "Failed to fetch Geist from
 * Google Fonts" — a deploy that cannot build is worse than a slightly larger bundle. The package
 * ships the same typeface, the same `--font-geist-*` variables and the same metrics.
 */
const geistSans = GeistSans;
const geistMono = GeistMono;

export const metadata: Metadata = {
  title: {
    default: "StreamKaro — Free Live TV — News, Sports, Movies",
    template: "%s · StreamKaro",
  },
  description:
    "StreamKaro lets you watch thousands of free live TV channels from 250+ countries — news, sports, movies, music, kids and more. Installable on Android, Android TV and desktop.",
  applicationName: "StreamKaro",
  keywords: [
    "free live tv",
    "iptv",
    "live channels",
    "streaming",
    "android tv",
    "iptv-org",
    "watch tv online",
  ],
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "StreamKaro",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#f59e0b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
      </body>
    </html>
  );
}
