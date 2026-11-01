# StreamKaro 📺

> **10,000+ free live TV channels, zero cost, zero login** — a blazing-fast IPTV discovery + playback web app powered by the public [iptv-org](https://github.com/iptv-org/iptv) dataset. Watch it, filter it, install it as an app, and (if you're the operator) earn from it.

Dark-themed, mobile-first, PWA-installable, and built to ship to the web, **Android/Android TV** and **desktop** — see the docs below.

---

## ✨ Features

- 🌍 **~10,000 live channels / ~15,000 streams** seeded from iptv-org into a local SQLite database
- 🔎 **Search** by channel name + **filters** for country, category and language
- 🎬 **HLS player** (hls.js) with **alternate sources** — if one stream is down, hop to the next quality/source
- 🛡️ **Server-side stream proxy** (`/api/proxy`) for CORS/referer/user-agent–sensitive streams
- 🎬 **Movies & TV Shows hub** — one page for both: hero carousel, genre rails, search, **season + episode browser** with a **lazy per-series episode cache** (Xtream `get_series_info`, refreshed daily)
- 🔌 **Pluggable media providers** — your own Xtream catalog by default; an optional third-party adapter behind `NXSHA_ENABLED`; a `MEDIA_FIXTURES=1` sample catalog for UI work with no database
- 💬 **Subtitles + quality picker** in the player, and **resume playback** ("Resume 12:34" / "Start over", remembered per title *and* per episode)
- 🗓️ **EPG / TV guide** — XMLTV from any source's `EPG URL`, matched to channels by tvg-id → name, shown as "On now / Up next" on the watch page
- ❤️ **Favorites** (persisted client-side via Zustand)
- 📱 **PWA** — installable (manifest + service worker), works like a native app on phones/desktops
- 💎 **Premium page** — Free / Pro (₹49/mo) / Super (₹99/mo) plans with mock checkout and Razorpay/Stripe hook points
- 💰 **Ads-ready** — built-in `AdSlot` components; set `NEXT_PUBLIC_ADSENSE_CLIENT=ca-pub-xxxx` and they switch from house promo cards to live AdSense units
- 🧭 **TV Mode** — header toggle (auto-enables on smart-TV browsers) that scales the whole UI and adds **remote/D-pad arrow-key navigation**, focus rings and Back-key support — perfect in Samsung/LG TV browsers and Android TV
- 📲 **TV Guide built-in** — "TV pe kaise?" dialog explains pendrive APK install (Android TV/Fire TV), browser+TV Mode (Samsung/LG) and set-top-box/cast/HDMI options (old TVs)
- 🤖 **Ready Capacitor Android project** (`android/`) — TV (leanback) launcher, banner, D-pad support; build an APK and sideload via pendrive (see `docs/ANDROID_TV_APP.md`)
- 🎨 Dark UI (`#09090b`) with amber/orange brand accent, English UI

## 🧰 Tech Stack

| Layer | Tech |
|---|---|
| Framework | **Next.js 16** (App Router, standalone output) + React 19 + TypeScript |
| Styling | **Tailwind CSS 4**, shadcn/ui (Radix primitives), lucide-react, framer-motion |
| State / data | **Zustand** (UI state), **TanStack Query** (data fetching) |
| DB / ORM | **Prisma** + **SQLite** (`db/custom.db`) |
| Player | **hls.js** |
| Package manager | **Bun** |
| Data pipeline | TypeScript seed script joining iptv-org `channels/streams/feeds/logos` datasets |
| On-demand + guide | Xtream Movies/Series sync, XMLTV EPG parser, provider-agnostic media API |

> 📚 **New:** the Movies & TV hub, series pipeline, subtitles, resume and EPG are documented in [`docs/MEDIA_HUB.md`](docs/MEDIA_HUB.md).

## 🚀 Quickstart

```bash
bun install              # install dependencies
bun run db:push          # create SQLite schema from prisma/schema.prisma
bun scripts/seed-iptv.ts # download & seed ~10k channels + ~15k streams from iptv-org data
bun run dev              # start dev server on http://localhost:3000
```

> The seed script reads cached datasets from `scripts/iptv/*.json` and joins streams → channels, resolves languages via feeds, picks the best logo per channel, skips dead/offline channels and dedupes stream URLs. Result: **9,948 channels, 14,902 streams** in `db/custom.db`.

### Scripts

| Command | What it does |
|---|---|
| `bun run dev` | Dev server on port 3000 |
| `bun run build` | Production build (standalone output; copies `static/` + `public/` into the standalone bundle) |
| `bun run start` | Runs the standalone production server (`bun .next/standalone/server.js`) |
| `bun run cap:sync` | Copy web shell into the Capacitor Android project (`android/`) |
| `bun run cap:open` | Open the Android project in Android Studio |
| `bun run lint` | ESLint |
| `bun run db:push` | Push Prisma schema to SQLite |
| `bun run db:generate` | Generate Prisma client |
| `bun run db:migrate` | Run Prisma migrations (dev) |
| `bun run db:reset` | Reset the database |

### Environment

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQLite connection (e.g. `file:./db/custom.db`) |
| `NEXT_PUBLIC_ADSENSE_CLIENT` | `ca-pub-…` ID — flips AdSlots from house promos to live AdSense (see [MONETIZATION.md](./docs/MONETIZATION.md)) |
| `NEXT_PUBLIC_UPI_VPA` | Aapki UPI ID (`you@okhdfcbank` / `you@ybl`) — footer me "Support karo (UPI)" button + QR on kar deta hai. **Bina login, 0% fees, direct payment** |
| `NEXT_PUBLIC_UPI_NAME` | UPI payee display name (default `StreamKaro`) |

## 📂 Project Structure

```
├── src/
│   ├── app/
│   │   ├── page.tsx            # ALL UI lives here (single-route, Zustand view switching)
│   │   ├── layout.tsx          # Root layout, fonts, metadata
│   │   ├── globals.css         # Tailwind 4 theme (dark, amber accent)
│   │   └── api/                # API routes (channel APIs, /api/proxy stream proxy, etc.)
│   ├── components/
│   │   ├── ui/                 # shadcn/ui primitives
│   │   └── …                   # App components (player, AdSlot, filters, cards)
│   ├── hooks/                  # use-toast, use-mobile
│   └── lib/                    # db (Prisma client), utils
├── prisma/schema.prisma        # Channel + Stream models
├── scripts/
│   ├── seed-iptv.ts            # iptv-org → SQLite pipeline
│   └── iptv/*.json             # cached iptv-org datasets (channels, streams, feeds, logos…)
├── db/custom.db                # SQLite database (seeded)
├── public/                     # PWA manifest, icons (icon-512.png is the master icon), robots.txt
├── docs/
│   ├── ANDROID_TV_APP.md       # Capacitor wrapper → Android APK/AAB + Android TV
│   ├── DESKTOP_APP.md          # Electron / Tauri / PWA desktop wrappers
│   └── MONETIZATION.md         # Ads, Razorpay subscriptions, affiliates, legal notes
└── worklog.md                  # Development log
```

> Architecture note: all UI is intentionally in **one route** (`src/app/page.tsx`) with client-side view switching; only API routes are separate files.

## 📦 Deployment

**This app needs a Node server** (API routes + stream proxy + Prisma) — it is *not* a static site.

- **⚠️ Vercel caveat:** the filesystem is read-only/ephemeral on serverless, so **SQLite (`db/custom.db`) won't persist**. On Vercel you must first migrate Prisma to **Turso (libSQL)** or **Postgres** (e.g. Neon/Supabase) — the schema is portable, change `datasource db` provider + `DATABASE_URL` and re-run `db:push`.
- **✅ Easiest full-fidelity path:** a small **VPS** (Hetzner/DigitalOcean/OVH, ₹400–800/mo) or **Docker**:
  ```bash
  bun run build
  DATABASE_URL=file:./db/custom.db bun .next/standalone/server.js   # listens on :3000
  # put Caddyfile/nginx in front for HTTPS (a Caddyfile is included in the repo)
  ```
- Set `NEXT_PUBLIC_ADSENSE_CLIENT` and `DATABASE_URL` in the host's env settings.
- Point the Capacitor app (`server.url`) and desktop wrappers at the deployed URL — one deployment powers web + Android + TV + desktop (see docs below).

## 📚 Going Further (docs)

| Doc | What's inside |
|---|---|
| [docs/ANDROID_TV_APP.md](./docs/ANDROID_TV_APP.md) | Wrap the app with **Capacitor** → debug APK, signed Play Store AAB, **Android TV/leanback** manifest setup, AdMob, back-button handling |
| [docs/DESKTOP_APP.md](./docs/DESKTOP_APP.md) | **Electron** (recommended) / **Tauri** / **PWA-install** desktop builds for Windows, macOS, Linux + code-signing & distribution notes |
| [docs/MONETIZATION.md](./docs/MONETIZATION.md) | **How to earn**: AdSense/AdMob display ads, Razorpay **UPI Autopay** subscriptions (₹49/₹99 tiers), affiliates, sponsorships, 90-day roadmap, legal compliance |

## 🙏 Credits

- Channel, stream and logo data: the incredible open-source **[iptv-org](https://github.com/iptv-org/iptv)** project. Please support/star it — StreamKaro is just a friendlier window into their public dataset.
- Built with [Next.js](https://nextjs.org), [Prisma](https://prisma.io), [shadcn/ui](https://ui.shadcn.com), [hls.js](https://github.com/video-dev/hls.js).

## ⚖️ Legal Disclaimer

StreamKaro **does not host any video content**. It indexes and plays streams aggregated from the **public iptv-org project**, whose availability and legality **vary by country and can change without notice**. As the operator of any deployed instance you are responsible for: complying with copyright law in the regions you serve, processing takedown/DMCA-style channel-removal requests, keeping privacy disclosures accurate, and **never promoting piracy**. See [docs/MONETIZATION.md → Legal disclaimer](./docs/MONETIZATION.md#️-legal-disclaimer-read-this-carefully) for the operator checklist and the suggested channel-report feature.
