# 3. Module-wise Audit

Scope: every module in `src/lib/server`, `src/app/api`, `src/components`. Severity and IDs
match [`BUGS_AND_ISSUES.md`](./BUGS_AND_ISSUES.md).

Legend: OK = verified sound · FIX = fixed in this audit · OPEN = open, in the roadmap.

---

## 3.1 Authentication & sessions (`lib/server/auth.ts`)

| Check | Result |
|---|---|
| Password hashing | OK — scrypt, 16-byte salt, 64-byte key, `timingSafeEqual` |
| Session storage | OK — only sha256(token) in DB; raw token only in httpOnly cookie |
| Cookie flags | OK — HttpOnly, SameSite=Lax, `Secure` in production |
| Session expiry | OK — 7 days, checked on every resolve |
| Revocation on password reset / suspend | OK — `destroyAllCustomerSessions` |
| Login throttling | FIX (partial) — fixed window per IP+org; in-memory only (OPEN: SEC-07) |
| Default admin credential | FIX — `StreamKaro@2024` was printed on the login screen (SEC-01) |
| Change own password | FIX — no endpoint existed at all (SEC-02) |
| Session-expiry UX | FIX — admin panel never detected a 401 (SEC-08) |
| CSRF | OK by construction (SameSite=Lax + POST-only mutations), documented SEC-11 |

## 3.2 Tenancy (`lib/server/tenant.ts`)

* Subdomain → org, verified custom domain → org, apex → root org, unknown label → 404. OK.
* Every customer query is org-scoped; IDOR attempts on `[id]` routes always re-add
  `organizationId` (verified on channels, customers, streams, plans, portals). OK.
* Dev header `x-org-slug` is honoured when `NODE_ENV !== "production"` (OPEN, low: SEC-09).
* Platform-staff login is accepted on **any** tenant host and binds the session to the staff
  member's own org — legal but confusing; documented (SEC-06).

## 3.3 Access engine (`lib/server/access.ts`)

* Plan rules: within a dimension OR, across dimensions AND, empty dimension = unrestricted. OK.
* Adult gating applied in list, search and detail. OK.
* Overrides: `allow` grants even outside the plan, `block` always wins. OK.
* Health + portal validity clauses added to both the base and the grant branches. OK.
* Perf: `computeAccessSummary` reads **all** channels of the tenant into Node (OPEN: BUG-08).
* Minor: `evaluateAccess` persists `status=EXPIRED` on read (a write on a GET path). Acceptable
  but worth a note for replication lag.

## 3.4 Billing (`billing.ts` + `billing-rules.ts`)

| Check | Result |
|---|---|
| Money precision | OK — integer INR everywhere, `finalAmount` floors |
| Discount bounds | OK — clamped to `0..price` |
| Duration bounds | OK — `1..3650` days |
| Transactions | OK — subscription + payment + mirror in one `$transaction` |
| Plan/tenant validation | OK — plan must belong to the customer's org and be active |
| Renewal start date | OK — starts at current `endsAt` when still running |
| Payment state machine | OK — `canChangePaymentStatus` blocks illegal transitions |
| Expiry application | OPEN — no scheduler; expiry materialises only when a read/login touches the row (BUG-14) |
| Bulk import of customers | OPEN — none (CSV import missing; not a bug, a gap) |

## 3.5 Channels, sources & failover (`iptv.ts`, `failover.ts`, `sources.ts`, `sync/*`)

* Ranking: success-in-24h → fewest failures → priority → HLS/quality. OK.
* Cross-portal identity via `channelIdentityKey`, conservative (keeps digits, drops quality). OK.
* Portal credentials AES-encrypted, never returned to the client (masked). OK.
* Sync importers: idempotent by `sourceId`/`identityKey`; duplicate URLs deduped. OK.
* M3U upload: extension + 40 MB cap + `#EXTINF` sniff. OK.
* Bulk channel delete: no cap on the id array (OPEN, low: BUG-12).

## 3.6 Health doctor (`health-doctor.ts`)

* Probe validates real content (HLS manifest + segments, no HTML), 10 s timeout, 256 KB cap,
  public hosts only, 8 concurrent. OK.
* Disable → `refreshChannelHealth` → auto-hide; demo channels exempt; auto-restore on success. OK.
* Cron endpoint guarded by `CRON_SECRET`, per-org budget, 15 s. OK.
* Operator-disabled sources can be revived by a client success report (OPEN: BUG-07).

## 3.7 Playlist export (`playlist.ts`, `/api/playlist/[...slug]`)

* HMAC token = `customerId + 'p1:'` hash; 7-day stream links; only servable streams; skip counter. OK.
* Absolute URLs derive from `new URL(request.url).origin` (OPEN: BUG-06 — wrong behind a proxy).
* Response is `audio/x-mpegurl` with `Cache-Control: private, max-age=60`. OK.

## 3.8 Proxy (`/api/proxy`, `proxy-sign.ts`)

* Opaque AES-256-GCM tokens, TTL 24 h, legacy HMAC path accepted then dropped. OK.
* Redirects followed manually and re-checked each hop. OK.
* HLS rewriting of segment URIs and `URI="..."` attributes. OK.
* SSRF guard is **string-only** (OPEN, high: SEC-03) — DNS rebinding/nip.io reaches private IPs.
* Range requests forwarded, response headers whitelisted. OK.

## 3.9 Media hub (`media/*`)

* Plan gate on every route; fixtures bypass gated by env (OPEN: SEC-04).
* Provider adapters: catalog (default, own Xtream data) and optional nxsha (server-only, flag).
* `nxsha` transport uses the `curl` binary first (TLS fingerprint), native fetch as fallback. OK.

## 3.10 EPG (`epg.ts`, `/api/epg`)

* 30-channel cap, plan-scoped ids only, 60 s private cache, XMLTV parsing defensive. OK.
* Guide is "now/next" only — no full timeline UI (documented gap).

## 3.11 Platform console (`components/platform/*`)

* Own login, 401/403 → login screen. OK.
* PlanBuilder multi-select with server-side search, grant-only semantics, live preview. OK.
* Destructive actions use the shared `AlertDialog` component. OK (the operator admin panel does not — see 3.12).

## 3.12 Operator admin panel (`components/admin/*`)

* Menu reordered, legacy `#admin#portals` mapped. OK.
* One-click source add → sync → health sweep with progress. OK.
* Destructive actions use native `window.confirm()` in 4 places (OPEN: BUG-11) — inconsistent
  with the rest of the product and unusable on a D-pad.
* Login screen printed the seeded default password (FIX: SEC-01).
* Settings said password change is "a future version" (FIX: SEC-02).

## 3.13 Customer app (`components/tv/*`)

* View stack with scroll + focus restoration, Back pipeline centralised in `lib/back.ts`. OK.
* Player: HLS + native failover, 22 s stall watchdog, offline handling, PiP, keyboard/D-pad. OK.
* `AccountView` used an undeclared `playlistOpen` state — a build blocker (FIX: BUG-04).
* `DownloadView` links to artifacts that are not in `public/downloads` (OPEN: BUG-03).
* No `not-found` / `error` boundary (OPEN: UX-04).

## 3.14 Native shells

* Android manifest: TV leanback, cleartext for http IPTV, FileProvider, update permission. OK.
* Android `versionName 0.4.2 / versionCode 5` while the app is 0.5.0 (OPEN: AND-01).
* iOS shell: PiP, AirPlay, background audio, edge-swipe Back, offline screen, in-app server
  switch. Universal-link paths do not exist yet (OPEN: IOS-01 / BUG-02).
* Electron: context isolation on, node integration off, external links to the browser. OK.
  No single-instance lock, no auto-update, unsigned installer (OPEN: DSK-01..04).
