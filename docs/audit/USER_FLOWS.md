# StreamKaro — User Flows (end-to-end)

**Status:** Phase 1 deliverable · last updated 2026-11-02
**Scope:** every role and every end-to-end journey across Web app, Super Admin panel, Organization Admin panel, Android (phone/TV), iOS, Desktop.

> **How to read the tables.** *Steps* is the journey a real user takes. *Reality now* is what the code
> actually does (traced UI → state → API → service → DB → response). *Gap* is the issue ID from
> [`BUGS_AND_ISSUES.md`](./BUGS_AND_ISSUES.md). Anything marked ✅ was re-traced after the Phase 2 fix.

---

## 1. Roles and principals

| Role | Who | Auth principal | Where they work | Data scope |
|---|---|---|---|---|
| **Visitor** | anyone, no login | none | storefront (`/`), `/signup`, `/premium`, `/download` | demo channels + public plans only |
| **Customer** (end user) | the operator's subscriber | `sk_customer_session` → `CustomerSession` | storefront PWA, Android phone/TV, iOS, desktop, M3U playlist | own org, plan-gated channels/movies |
| **Org admin — OWNER** | the operator | `sk_admin_session` → `AdminSession` (role `OWNER`) | `<slug>.domain/admin` | own org only |
| **Org admin — STAFF** | operator's helper | same cookie, role `STAFF` | same panel | own org; cannot manage admins/platform |
| **Platform staff** | StreamKaro SaaS operator | same cookie + `Admin.isPlatformStaff` | `/platform` (staff console) | cross-tenant, read-mostly + org lifecycle |
| **Cron / machine** | scheduler | `CRON_SECRET` bearer | `/api/cron/*` | per-org sweep |
| **IPTV partner (external)** | VLC/TiviMate/Kodi | HMAC playlist token in the URL | `/api/playlist/<token>/x.m3u` | one customer's plan |

Tenancy is resolved per request by `resolveTenant()`: `<slug>.<base domain>` → that org, a verified
`customDomain` → that org, apex/localhost → the `root` org. Unknown subdomain is a hard 404 (never a
silent fallback to root). Every query is then scoped by the resolved `organizationId`; no handler
trusts an `organizationId` from the body.

---

## 2. Visitor → Customer

### 2.1 Landing / demo

| Step | Reality now |
|---|---|
| Open the site | `/` renders `AppShell`. Home shows a hero, a **demo** row (channels with `isDemo`) that plays without a plan, and the plan cards. |
| Tap a demo channel | `/watch/<id>` → player; `/api/streams/report` is called on failure so a dead demo source is retried without user action. |
| Try a paid channel | `/api/channels` returns 403 `reason:"guest"` → the UI swaps the grid for the plan upsell with a **Login** and a **See plans** button. |

Gaps: the upsell offered no way to sign up for the *platform* itself, only to buy a plan from the
operator (see §6.1). ✅ Demo playback is unaffected by the guest gate by design.

### 2.2 Login

1. **UI** — footer "Login" opens the auth dialog (`AccountView` → login card).
2. **API** — `POST /api/auth/customer/login` `{username|email, password}`.
3. **Service** — `resolveActiveTenant()` (rejects `SUSPENDED` org with 403), `db.customer.findFirst`
   scoped to that org, `verifyPassword` (scrypt + `timingSafeEqual`), rate limit 10/min per
   `org+ip`, then `createCustomerSession` (48-byte random token, DB stores only its sha256
   fingerprint, 7-day expiry, `httpOnly`, `SameSite=Lax`, `Secure` in prod).
4. **DB** — `CustomerSession` row + `Customer.lastLoginAt`.
5. **Response** — `{ok, customer}` + `Set-Cookie`.

Failure modes as the user sees them: wrong password → "Galat username ya password" (no hint whether
the account exists); suspended account → login succeeds but every catalog call returns 403
`reason:"suspended"` and the app shows the suspension notice; expired plan → same pattern with
`reason:"expired"` and a renew CTA.

**Gap:** no self-service password reset and no email/OTP verification (UX-10). Today a forgotten
password means the operator resets it from the admin panel.

### 2.3 Forgot / reset password

**Not implemented.** `UX-10`. There is no mail transport in the project, so a reset link cannot be
sent; the honest interim behaviour is what the admin panel now says — ask the operator. Any future
work must add: a `PasswordResetToken` table (hashed, single use, 30 min), a mail provider, a generic
"if that account exists we sent a link" response (no account enumeration), and the same rate limit as
login.

### 2.4 Watch / continue

1. `/live`, `/movies`, `/search`, `/favorites`, `/history` are addressable URLs (✅ BUG-02; previously
   every one of these was a 404 on refresh).
2. Selecting a channel → `/watch/<channelId>` (✅ BUG-02) → `GET /api/channels/<id>` returns the
   channel plus streams merged across sibling portals by `identityKey`, best-first by
   `priority` then health.
3. The player requests the signed `/api/proxy?...` URL (HMAC over url/ua/referrer + expiry). The proxy
   re-checks SSRF on **every** redirect hop (✅ SEC-03) and rewrites HLS manifests so relative
   segments keep resolving against the URL that actually served them (✅ BUG-06-related).
4. Playback failure → `onSourceError` → player asks for the next source; 3 failures in a row →
   `POST /api/streams/report` → after 5 consecutive failures that **one stream** is auto-disabled,
   the channel stays live on its other sources, and a debounced recheck runs.
5. Progress is saved to `localStorage` (`progress`), not to the server, so it is per-device.

**Gap:** progress/recents are device-local (no cross-device resume). Not a bug, but a product gap
worth stating in the roadmap.

### 2.5 Plan purchase / renewal

There is **no online payment**. `Plan`/`Subscription`/`Payment` exist and the admin records
payments (`CASH/UPI/CARD/BANK_TRANSFER/OTHER`), but a customer cannot pay from the storefront:
"Premium" shows the operator's contact and plan list. This is a deliberate single-operator setup
(WhatsApp/UPI → operator marks the payment), not a missing button.

Journey: customer taps *Renew* → sees the plan and the operator's phone/support → operator records a
payment in the admin panel (`recordPayment`, `PENDING→PAID`) and extends `Subscription.endsAt` →
`syncCustomerAccess()` rewrites the `Customer` mirror → the customer's next request has access again.
✅ Since Phase 2 the cron also reconciles lapsed mirrors (`reconcileCustomerAccess`), so the status
flips on schedule instead of "when someone opens the row" (BUG-14).

### 2.6 Playlist on a TV / external player

1. Customer opens `/profile` → **Playlist** → token is derived from `PLAYLIST_SECRET` (HMAC of the
   customer id) and shown as `https://<host>/api/playlist/<token>/streamkaro.m3u`.
2. The TV app fetches it; the route rate-limits 30/min per IP, verifies the token, builds a fresh M3U
   from the customer's *current* access, and only emits sources that are alive right now (dead ones
   are simply skipped).
3. The URL is built from a trusted public origin (`PUBLIC_BASE_URL` → validated `x-forwarded-host` →
   request origin), so the links are reachable from the TV (✅ BUG-06; previously `localhost:3000`).
4. Refreshing the playlist is the customer's "update" — no re-download of anything.

**Gap:** an expired/rotated `PLAYLIST_SECRET` invalidates every distributed URL at once with no
grace period; document it in the operator runbook.

---

## 3. Organization Admin panel

Entry: `<slug>.domain/admin` (✅ BUG-01 — the link on the signup success screen used to be a 404), or
the lock button in the storefront footer, or the settings section.

Sections: **Dashboard · Health · Failover · Sources (portals) · Channels · Customers · Plans ·
Audit Logs · Settings**.

### 3.1 Sign in

`POST /api/admin/auth/login` → tenant org check → scrypt verify → rate limit 10/min per
`org+ip` → `AdminSession` + `sk_admin_session`. On a **tenant storefront** only that org's own admins
are accepted (✅ SEC-06); platform staff sign in on the platform host.

*First-run security (✅ SEC-01/SEC-02):* the seeded owner password is no longer printed in the UI or
hardcoded in scripts — `ADMIN_PASSWORD` is required (or a random one is generated and printed once),
and **Settings → Change password** now really changes it, revoking every other session of that admin.

### 3.2 Sources (portals)

Add `M3U_URL | M3U_FILE | XTREAM | STALKER` → URL/creds validated (`assertPublicSourceUrl` +
DNS check) → **Sync** runs `sync/engine.ts` (parse → upsert channels/streams by
`organizationId+sourceId`) → a `SyncLog` row records counts, duration and errors. Large imports are
previewed first (`/api/admin/portals/upload` sniffs extension + `#EXTINF`, caps 40 MB) so a 500k-line
file cannot wedge the process.

### 3.3 Channels

List/paginate/filter (collection, country, language, category, health, search) → row actions
(edit, toggle active, manage sources, view health) → bulk activate/deactivate/delete. Bulk ids are now
bounded to 500 per request (✅ BUG-12). Destructive actions use a real dialog, not `window.confirm`
(✅ BUG-11). Deleting a **channel** removes it from every plan/playlist; deleting a **source** just
drops it out of the failover order.

Inside a channel: per-source priority (failover order), enable/disable, reset health, and URL/UA/
Referer editing for manual sources. An operator disable is now authoritative — the health sweep and
client reports cannot switch it back on (✅ BUG-07), and the audit log records the change.

### 3.4 Customers

Create (name/username/email/password/plan) → `createCustomer` writes the customer, an initial
`Subscription` (if a plan was chosen) and a `Payment` with status `NOT_RECORDED`, then
`syncCustomerAccess`. Edit → change plan/status/password; suspend/archive; delete (cascades sessions
and subscriptions). "Access preview" explains exactly which channels this customer gets and why
(plan rules vs. overrides).

✅ Duplicate username/email now returns 409 instead of a 500 with Prisma internals (SEC-05).

### 3.5 Plans

Create/edit a plan with price, duration, max devices, adult switch, and dimension rules
(regions/countries/languages/categories) plus explicit channel grants. Rules are stored pipe-delimited
(`|IN|Hindi|`) and interpreted by `access.ts`; an empty dimension means "all". Validation now happens
in the dialog before the request (✅ UX-07).

### 3.6 Health & Failover

**Health**: summary counts, per-stream table with latency/last error, and a "Run sweep now" action
(`runHealthSweep`) that probes up to N stale streams within a time budget. The same sweep runs on a
schedule through `POST /api/cron/health` (`CRON_SECRET`).
**Failover**: shows channels currently served from a backup source and why the primary is out.

### 3.7 Audit log

Every mutating admin action writes an `AuditLog` row (actor, action, entity, old→new, IP).
Paginated, newest first (now org+createdAt indexed, ✅ DB-01).

### 3.8 Settings

Organization facts (storefront URL, status, platform plan, trial countdown), admin account, and
**Change password** (✅ SEC-02).

---

## 4. Platform (Super Admin) console

`/platform` — cross-tenant, requires `Admin.isPlatformStaff`.

| Screen | What it does | Notes |
|---|---|---|
| Stats | orgs, customers, channels, MRR-ish counters | read-only |
| Organizations | list, create, suspend/activate, set platform plan/validity | suspension blocks the storefront (`resolveActiveTenant` 403) |
| Customers | cross-tenant list + access management | scoped by `platformRoute` |
| Channels | cross-tenant catalogue with bulk **activate/deactivate** | a disable here is recorded as `disabledBy=OPERATOR` (✅ BUG-07) |
| Plans / Payments / Subscriptions | cross-tenant billing views | payment status transitions validated by `canChangePaymentStatus` |
| Audit logs | every tenant's activity | |

**Gap:** no in-console UI to create a *tenant admin* for an existing org (must go through
`/signup` or the API), and no per-org usage/billing invoice view. Both are on the roadmap.

---

## 5. Signup (creating a new operator)

1. `/signup` — org name, slug (live availability check `POST /api/signup/check`), owner username,
   email, password.
2. `POST /api/signup` → slug/username validation, rate limit, create `Organization` (`status: TRIAL`,
   14-day trial) with its first `Admin` (`role: OWNER`) in one nested write.
3. Response carries `storefrontUrl` and `adminUrl`; the success screen links to `/admin`, which is now
   a real screen (✅ BUG-01).
4. ✅ A duplicate-slug race now returns 409 "That subdomain was just taken" instead of a 500 with
   Prisma internals (SEC-05).

**Gap:** there is no email verification, so a typo'd address cannot be caught; no captcha, so the
signup endpoint is protected only by rate limiting (per-process, SEC-07).

---

## 6. Cross-platform journeys

### 6.1 Web (PWA)

Install prompt → standalone window → same cookies. Offline: the player shows an offline notice and
retries on `online`. With routing (✅ BUG-02) a refresh or a bookmark now reopens the same screen, and
an unknown path renders a branded 404 instead of Next's default page (✅ UX-04).

### 6.2 Android (Capacitor + Media3)

The WebView loads the storefront; playback can be handed to the native `PlayerActivity`
(Media3 ExoPlayer) for HLS/DASH with hardware decoding. Back button is routed through the app's own
Back pipeline (`lib/back.ts`); the update check polls `/api/app/version`, compares `versionCode`, and
offers the APK download. ✅ Version now matches the shipped web build (AND-01), backup is disabled and
cleartext is restricted to dev hosts (AND-02/AND-03).

### 6.3 iOS (xtool SwiftPM shell)

Native `WKWebView` with inline + PiP video, AirPlay, background audio, keep-awake, edge-swipe back and
a native offline retry. `streamkaro://watch/<id>` and universal links `https://<host>/watch/<id>` now
resolve to real routes (✅ IOS-01). The server override accepts only `https://` in release builds
(✅ IOS-05).

### 6.4 Desktop (Electron)

Loads the storefront in a `BrowserWindow` (`contextIsolation`, no `nodeIntegration`); external links
go to the system browser; F11 fullscreen; Alt+Left / mouse-back go Back; a failed load shows
Retry/Quit. ✅ A second launch focuses the existing window (DSK-02) and navigation compares origins,
so `https://host.evil.com` is no longer treated as internal (SEC-10).

### 6.5 Same operation, four clients

The contract that must hold for every operation (and the check to run after any change):

| Operation | Where it happens | Backend | DB effect |
|---|---|---|---|
| Login | any client | `POST /api/auth/customer/login` | one `CustomerSession`; `lastLoginAt` |
| Play a channel | any client | `GET /api/channels/<id>` → `/api/proxy` | `Stream.lastOkAt/failureCount` via report |
| Failover | any client | `/api/streams/report` | `Stream.status`, `disabledBy`, `Channel.healthStatus` |
| Renew plan | admin panel only | `POST .../subscriptions` + payment | `Subscription`, `Payment`, `Customer` mirror |
| Favourites / progress | per device | none | `localStorage` only |

---

## 7. Where the flows break (summary)

| Journey | Break | ID | State |
|---|---|---|---|
| Any deep link / refresh | 404 on every screen except Home | BUG-01/02 | ✅ fixed |
| Signup → panel | success link pointed at a 404 | BUG-01 | ✅ fixed |
| Android update | advertised APK did not exist; version stale | BUG-03/AND-01 | ✅ fixed |
| Downloads page | every button 404'd | BUG-03/SEC-14 | ✅ fixed (page is now honest; artifacts still need uploading) |
| Operator disables a bad source | it came back by itself | BUG-07 | ✅ fixed |
| Playlist on a TV | links pointed at the internal origin | BUG-06 | ✅ fixed |
| Admin password | could not be changed at all | SEC-02 | ✅ fixed |
| Expired plan | still looked active until someone opened the row | BUG-14 | ✅ fixed via cron |
| Forgot password | no flow at all | UX-10 | open |
| Customer self-service cancel/delete | must ask the operator | UX-11 | open |
| Cross-device resume | progress is device-local | — | product gap |
| Online payment | none (by design) | — | product decision |
