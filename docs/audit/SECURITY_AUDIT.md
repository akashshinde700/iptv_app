# 10. Security Audit

Scope: authentication, authorisation, tenant isolation, injection, SSRF, secrets, transport,
rate limiting, dependency and mobile/desktop hardening.

**Test environment note:** no production or staging data was touched. No secret, token or
password from a live system is reproduced here; the only credential quoted (SEC-01) was
already committed in this repository and printed in its own UI.

Summary: **0 Critical**, **4 High**, **6 Medium**, **6 Low**.

---

## 10.1 Good news first (verified, keep it)

| Control | Evidence |
|---|---|
| Password hashing | scrypt + per-password salt + `timingSafeEqual` (`auth.ts`) |
| Session tokens | 48 random bytes, only sha256 persisted, httpOnly + SameSite=Lax + Secure in prod |
| Tenant isolation | every customer query carries `organizationId`; `[id]` routes re-scope (channels, customers, streams, plans, portals) |
| Privilege separation | `requireAdmin` / `requireSuperAdmin` / `requirePlatformStaff` |
| Server-side enforcement | plan gating, adult gating and status/expiry checks all happen in SQL, never in the client |
| Proxy abuse | opaque AES-256-GCM tokens; no upstream URL or Xtream credential reaches the browser; redirects re-checked per hop |
| Audit trail | every admin mutation writes an `AuditLog` row (best-effort, never blocks the action) |
| Secret handling | portal passwords AES-encrypted, returned masked; `PROXY_SIGNING_SECRET` required in production |

## 10.2 Findings

### SEC-01 · High · Default admin credential is public and printed in the UI

* **Location** `scripts/seed-admin.ts`, `src/components/admin/AdminView.tsx:142`
* **Description** The seed creates `admin / StreamKaro@2024` and the admin login screen prints
  that exact pair as a "Default" hint. Anyone who reaches `/` → Settings → Operators sees it.
  `scripts/e2e-bulk-ui.sh` and `scripts/bulk-import-run.py` also hard-code it.
* **Impact** Any deployment seeded with the script and not manually re-seeded is fully
  compromised (OWNER + platform staff in the root org = all tenants).
* **Root cause** Convenience default carried into the UI; no forced-rotation mechanism.
* **Fix** `FIX` — hint removed; `seed-admin.ts` now requires `ADMIN_PASSWORD` (or generates a
  random one and prints it once); the admin sees a warning banner while a known-default password
  is in use.

### SEC-02 · High · An admin cannot change their own password

* **Location** `src/components/admin/AdminView.tsx` (`SettingsSection`), no such API route
* **Description** Settings literally says password change ships "in the next version". Combined
  with SEC-01 there is no supported way to remove the default credential.
* **Impact** Credential rotation is impossible without shell access to the database.
* **Root cause** Missing feature, not a regression.
* **Fix** `FIX` — `PATCH /api/admin/auth/password` (current password required, 8+ chars, scrypt,
  destroys the other sessions, audits `ADMIN_PASSWORD_CHANGE`) + a form in admin Settings.

### SEC-03 · High · SSRF guard is string-only (DNS rebinding / public-resolving internal names)

* **Location** `src/app/api/proxy/route.ts` (`isPrivateHost`), `src/lib/server/net-guard.ts`
* **Description** Both guards reject private *literals* only. Hostnames are never resolved, so
  `http://169.254.169.254.nip.io/`, `http://internal.corp.example.com/` (A record 10.x) or a
  rebinding domain (`attacker.tld` answering public then private) pass the check, and
  `/api/proxy` will fetch them — including cloud metadata (`169.254.169.254`).
* **Impact** Cloud credential theft (IMDSv1), internal network reachability, port scanning.
  Reachable by anyone who can make the server mint a proxy link for a URL they control
  (an operator-added manual source, a portal whose playlist points at their host, and — for the
  legacy signed form — any caller holding a link). Severity High, not Critical, because minting
  requires operator-level input.
* **Root cause** Comment in the file acknowledges it: "String-based (no DNS)".
* **Fix** `FIX` — shared `resolveSafeHost()` in `net-guard.ts`: `dns.lookup(host, { all: true })`
  then every returned address goes through the same private-range check; 60 s positive/negative
  cache so the hot video path is unaffected; proxy resolves every redirect hop too.

### SEC-04 · Medium · `MEDIA_FIXTURES=1` disables the plan gate for the whole media hub

* **Location** `src/lib/server/media/gate.ts`
* **Description** Fixture mode returns `ok: true` with `organizationId: "fixtures"` before any
  authentication. If the flag is left on in a production env (copy-pasted `.env`), all
  `/api/media/*` routes are public.
* **Fix** `FIX` — fixture mode refuses to activate when `NODE_ENV=production`.

### SEC-05 · Medium · Signup race leaks a 500 and Prisma internals

* **Location** `src/app/api/signup/route.ts`
* **Description** Availability is checked with `findUnique` then inserted; two concurrent
  requests for the same slug hit the unique index and fall into `toErrorResponse` → generic 500
  (and a `console.error` with the Prisma error). Expected: 409 "already taken".
* **Fix** `FIX` — catch `P2002` and map to 409; same for the admin customer create path.

### SEC-06 · Medium · Platform staff can sign in on any tenant storefront

* **Location** `src/app/api/admin/auth/login/route.ts`
* **Description** `OR: [{ organizationId }, { isPlatformStaff: true }]` lets staff authenticate
  against *any* subdomain, and the created session is scoped to the staff member's own
  `organizationId`. Legitimate for support, but it means every tenant's admin login form is a
  second entry point to a privileged account, and the resulting session's tenant is ambiguous.
* **Fix** `OPEN` (documented) — recommended: a dedicated `/platform` login (already exists) and
  reject `isPlatformStaff` on tenant hosts unless an explicit `?support=1` flow is used.

### SEC-07 · Medium · Rate limiting is per-process and per-IP only

* **Location** `src/lib/server/auth.ts` (`rateLimit`)
* **Description** Fixed-window `Map` in module scope. Two replicas double every limit; a restart
  clears it. No per-account lockout, so credential stuffing spreads across IPs freely.
* **Fix** `OPEN` — recommended: Redis (or MySQL) backed counter + per-username counter on the
  login routes. Documented in the roadmap; not changed here to avoid a new infrastructure
  dependency inside an audit.

### SEC-08 · Medium · Expired admin session is invisible to the UI

* **Location** `src/lib/admin-api.ts` (`request`), `src/components/admin/AdminView.tsx`
* **Description** `request()` throws a plain `Error`, so status is lost. After the 7-day session
  (or a server restart that wipes sessions) every admin action fails with a toast while the UI
  keeps showing the panel.
* **Fix** `FIX` — `request()` throws `AdminApiError` with `status`; a `401` dispatches
  `streamkaro:admin-session-expired`, `AdminView` refetches `admin-me` and shows the login form
  with "session expired, sign in again".

### SEC-09 · Low · `x-org-slug` override trusted whenever NODE_ENV ≠ production

* **Location** `src/lib/server/tenant.ts`
* **Description** If a deployment forgets `NODE_ENV=production` (common with `next start` behind
  Docker), any client can pick the tenant with a header.
* **Fix** `OPEN` — recommended: gate on an explicit `ALLOW_TENANT_OVERRIDE=1` dev opt-in.

### SEC-10 · Low · Desktop `will-navigate` check uses a string prefix

* **Location** `desktop/main.js:34`
* **Description** `url.startsWith(APP_URL)` accepts `https://www.streamkaro.aetherdevsolutions.in.evil.com`.
  A navigation to such a host stays inside the trusted window.
* **Fix** `FIX` — compare `new URL(url).origin` to the app origin.

### SEC-11 · Low · No CSRF tokens (relies on SameSite=Lax)

* **Description** All mutations are POST/PATCH/DELETE with cookie auth and `SameSite=Lax`, which
  blocks cross-site form POSTs in current browsers. Acceptable today; fragile if a state-changing
  GET is ever added (none exist — verified).
* **Fix** `OPEN` (documented) — add a double-submit token if the cookie policy is ever relaxed.

### SEC-12 · Low · `clearSessionCookie` omits `Secure`

* **Location** `src/lib/server/auth.ts`
* **Fix** `FIX` — mirror the production `Secure` flag when clearing.

### SEC-13 · Low · Dependency and dead-code hygiene

* `zod` and `date-fns` are installed but never imported; several shadcn components are unused.
* No automated `npm audit` gate in CI.
* **Fix** `OPEN` — add `npm audit --omit=dev` to CI, drop unused deps.

### SEC-14 · Medium · Public version endpoint advertises an update that does not exist

* **Location** `src/app/api/app/version/route.ts`, `src/lib/downloads.ts`
* **Description** The endpoint returns APK URLs from `ANDROID_RELEASE` (0.4.2) regardless of
  whether those files exist in `public/downloads/` (they do not in this repo). The Android
  updater then offers an update that downloads a 404 page.
* **Fix** `FIX` — `/api/app/downloads` reports which artifacts actually exist on disk; the
  updater and the download page use it and hide/disable the rest.

## 10.3 Attack-surface inventory (for the next audit)

Public, unauthenticated: `/api/signup`, `/api/signup/check`, `/api/plans`, `/api/demo/channels`,
`/api/featured` (demo only), `/api/app/version`, `/api/proxy` (token-gated), `/api/playlist/*`
(token-gated), `/api/cron/health` (secret-gated), `/apple-app-site-association`.

Everything else requires a customer cookie (plan-gated) or an admin cookie (tenant-scoped).
Verified: no route leaks a cross-tenant row, and no route returns portal credentials.

## 10.4 Mobile / desktop hardening

| ID | Finding | Status |
|---|---|---|
| AND-02 | `android:allowBackup="true"` — cookies/localStorage can be pulled with `adb backup` on older Android | OPEN |
| AND-03 | `usesCleartextTraffic="true"` app-wide instead of a scoped `networkSecurityConfig` | OPEN |
| AND-04 | `REQUEST_INSTALL_PACKAGES` + unsigned, unverified APK updates (supply chain) | OPEN |
| IOS-02 | `NSAllowsArbitraryLoadsInWebContent` — justified by http IPTV sources, must be explained at review | OPEN |
| IOS-03 | App must not quit itself (App Store 2.5.1) — handled in `ExitConfirmDialog` | OK |
| DSK-01 | No auto-update channel; installer unsigned | OPEN |
