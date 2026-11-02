# 1. Project Architecture — StreamKaro

> Audit date: 2026-11-02 · Commit audited: `9bb82e7` · Branch: `arena/3cf21e50-iptv-app`
> Method: source inspection of every route, module and shell. Nothing here is assumed —
> each statement is traceable to a file.

---

## 1.1 What the product is

A multi-tenant **IPTV SaaS**: operators ("organizations") import channels from their own
portals (M3U / Xtream / Stalker), create plans, sell them to customers, and customers watch on
web, Android, Android TV, iOS and Windows. A separate **platform console** lets StreamKaro
staff manage all tenants.

```
                     +--------------------- StreamKaro platform (this repo) ---------------------+
                      |                                                                             |
 Operator (admin)  -> |  /            single-route client app (AppShell + in-memory view stack)      |
 Customer          -> |  /signup      operator self-signup (creates tenant + owner admin)           |
 SaaS staff        -> |  /platform    platform console (own client app, own login)                  |
                      |                                                                             |
                      |  ~95 route handlers under /api/*  -->  src/lib/server/*  -->  Prisma  -->  MySQL |
                     +-----------------------------------------------------------------------------+
                                  ^                     ^                    ^                 ^
                            Capacitor APK        xtool SwiftUI        Electron          PWA / browsers
                            (android/)           shell (ios/)        (desktop/)
```

The mobile/desktop shells are **thin native wrappers around the deployed website**
(`STREAMKARO_URL` / `server.url` / `Info.plist`). They add native playback, PiP, updates and
Back handling; they do **not** re-implement business logic. That is the property this audit
relies on throughout: *one backend contract, five presentation shells*.

## 1.2 Stack inventory (verified)

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Framework | Next.js App Router | `^16.1.1` | `output: "standalone"` |
| UI | React 19, Tailwind 4, shadcn/Radix | `^19`, `^4` | 107 `.tsx` files |
| Data | Prisma 6 + MySQL | `^6.11.1` | `provider = "mysql"` |
| Server state | TanStack Query 5 | `^5.82` | 25 `useMutation` sites |
| Client state | Zustand 5 + `persist` | `^5.0.6` | nav stack, filters, favourites, resume |
| Video | hls.js 1.7 / native `<video>` | | + Media3 player inside the APK |
| Auth | custom: scrypt + DB sessions + httpOnly cookies | | no NextAuth |
| Mobile | Capacitor 8 (`android/`), xtool + SwiftUI (`ios/`) | | |
| Desktop | Electron 33 (`desktop/`, separate package) | | unsigned NSIS/dmg/AppImage |
| Tests | Vitest 4 | 11 files / 121 tests | unit level |
| Lint / types | ESLint 9 flat config, `tsc --noEmit` | | strict |

Size: **37.8k LOC** in `src/` — 148 `.ts`, 107 `.tsx`, 95 API route files, 29 server modules.

## 1.3 Backend layout

```
src/lib/server/
  auth.ts            scrypt passwords, sessions, admin/platform/customer guards, rate limit, audit
  tenant.ts          Host -> Organization (subdomain / verified custom domain / root org)
  access.ts          THE access engine: plan rules + overrides + health + tenant scope -> Prisma where
  billing.ts         customers, subscriptions, payments (all mutations, in transactions)
  billing-rules.ts   pure state machine: subscription/account status, amounts, payment status
  iptv.ts            channel queries, health-aware stream ranking, identity keys, proxy links
  failover.ts        probing, cross-portal source selection, stream-health writes
  health-doctor.ts   probe -> disable -> auto-hide -> auto-restore
  playlist.ts        per-customer signed M3U
  proxy-sign.ts      AES-256-GCM opaque tokens for /api/proxy
  net-guard.ts       SSRF guard for operator-supplied URLs
  epg.ts             XMLTV fetch / parse / cache
  sources.ts         portal CRUD + AES-encrypted credentials
  sync/*.ts          M3U, Xtream, Stalker, VOD and series importers
  media/*            Movies & TV hub (catalog + optional third-party provider + plan gate)
```

Four guard wrappers cover virtually every route, so error handling is uniform:
`publicRoute`, `adminRoute(Ctx)`, `platformRoute(Ctx)` — all funnel into `toErrorResponse`,
which maps `HttpError` to its status and anything else to a logged 500 JSON.

## 1.4 Data model (17 models)

```
Organization 1-* Admin 1-* AdminSession
     1-* Portal 1-* SyncLog
     1-* Channel 1-* Stream
     1-* Movie / Series 1-* Season 1-* Episode
     1-* Plan 1-* PlanChannel *-1 Channel
     1-* Customer 1-* Subscription 1-* Payment
          Customer 1-* CustomerSession, 1-* CustomerOverride
     1-* AuditLog
```

Rules that matter:

* **Every** customer-facing query is scoped by `organizationId`.
* `Customer.status` / `planId` / `planStartedAt` / `planExpiresAt` are a **derived mirror** of
  subscription history, recomputed by `syncCustomerAccess()` after each billing mutation; the
  client can never set them.
* `Channel.identityKey` groups the same channel across portals -> cross-portal failover.
* `Stream.status` + `failureCount` drive auto-disable; `Channel.healthStatus` + `autoHiddenAt`
  drive auto-hide (see `docs/AUTO_HEALING.md`).
* Money is integer INR end-to-end (no floats).

## 1.5 Request lifecycle — channel playback (hottest path)

```
Player.tsx --GET /api/channels/:id--> access.ts buildCustomerChannelWhere()
           <-- streams[] already wrapped in /api/proxy?t=<AES-GCM token> --+
           --GET /api/proxy?t=...--> decrypt token -> SSRF check -> fetch upstream
                                 <-- HLS rewritten so every segment also goes via /api/proxy
           --POST /api/streams/report {ok:false}--> failureCount++
                                 +- at 5 -> stream DISABLED -> recheck channel -> maybe auto-hide
```

Tokens are opaque and encrypted: a customer never sees an upstream URL (Xtream URLs embed
credentials) and the proxy cannot be used as an open relay.

## 1.6 Deployment topology

* Single Node server (Next standalone) behind Caddy/nginx + MySQL 8.
* Cron: `POST /api/cron/health` with `CRON_SECRET` (503 when unset, 401 on mismatch).
* Tenant routing by `Host`: `<slug>.<STOREFRONT_BASE_DOMAIN>` -> org; verified `customDomain`
  -> org; apex -> `ROOT_ORG_SLUG`; unknown subdomain -> 404 (no silent root fallback).
* Env surface: `DATABASE_URL`, `PROXY_SIGNING_SECRET` (required in prod), `PORTAL_ENC_KEY`,
  `CRON_SECRET`, `ROOT_ORG_SLUG`, `STOREFRONT_BASE_DOMAIN`, `MEDIA_PROVIDER`, `NXSHA_*`,
  `MEDIA_FIXTURES`, `APPLE_TEAM_ID`, `NEXT_PUBLIC_UPI_VPA`, `NEXT_PUBLIC_STOREFRONT_BASE_DOMAIN`.

## 1.7 Architectural strengths (must survive the fixes)

1. **One access engine** — no route re-implements "may this customer watch this".
2. **Derived state, never trusted input** for plans, status and money.
3. **Opaque proxy tokens** — no upstream URL or credential reaches the browser.
4. **Uniform guards + error mapping** — no route can crash into an HTML 500.
5. **Shells wrap, they do not fork** — one deployment updates content on every platform.
6. **Server-side health ranking** — every client receives the same "best source".

## 1.8 Architectural weaknesses (input to the audit)

| # | Weakness | Consequence |
|---|---|---|
| A1 | Single-route client app with **no URL routing** | deep links, universal links, bookmarks and share links cannot address a screen; `streamkaro://watch/...` lands on a 404 |
| A2 | No shared schema validation (hand-rolled parsing per route); `zod` installed but unused | validation drift between routes |
| A3 | In-memory rate limiter | limits vanish with a second replica |
| A4 | Two API clients with **different error contracts** (`ApiError` vs plain `Error`) | admin panel cannot detect a 401 -> no session-expiry recovery |
| A5 | Heavy aggregation routes (`/api/meta`, `computeAccessSummary`) load a whole tenant catalog into Node memory | O(channels) CPU/RAM per request |
| A6 | The version string lives in 4 places (`package.json`, `downloads.ts`, `android/app/build.gradle`, `desktop/package.json`) | drift — already present (BUG-03) |
| A7 | No migrations directory (schema via `prisma db push`) | no rollback story for production |
