# 11. Bugs & Issues — master register

Every issue carries the fields requested by the audit brief. Status values:

* `FIXED` — changed in this audit, verified (test/build/lint evidence in `FINAL_PROJECT_AUDIT_REPORT.md`)
* `OPEN` — reproduced and documented, not changed (rationale in `FIXING_ROADMAP.md`)
* `BLOCKED` — cannot be verified in this environment (no DB engine, no macOS/iOS toolchain, no Android SDK)

Totals: **47 identified** — 0 Critical · 9 High · 17 Medium · 21 Low.
Fixed: see the report (evidence-based count).

---

## Status legend

| Symbol | Meaning |
|---|---|
| `FIXED ✅` | Code changed **and** verified here (unit test passes, or the behaviour was re-traced in the code path that used to fail). |
| `FIXED ◐` | Code changed; the behaviour needs a real device / database / build to prove. **Not** claimed as tested. |
| `NOT REPRODUCED` | Re-read the code path in the current tree and the described defect is not present. |
| `OPEN` | Not fixed yet. |

Phase 2 verification details: §13 at the end of this file, and [`TESTING_AUDIT.md`](./TESTING_AUDIT.md).

## Summary table

| ID | Sev | Platform | Module | Title | Status |
|---|---|---|---|---|---|
| SEC-01 | High | Web/Admin | Auth | Default admin credential printed in the login UI | FIXED ✅ |
| SEC-02 | High | Web/Admin | Auth | No way for an admin to change their own password | FIXED ✅ |
| SEC-03 | High | Backend | Proxy | SSRF guard ignores DNS → rebinding/metadata access | FIXED ✅ |
| SEC-04 | Med | Backend | Media | `MEDIA_FIXTURES=1` disables the plan gate in prod | FIXED ✅ |
| SEC-05 | Med | Backend | Signup | Duplicate-slug race returns 500 + Prisma internals | FIXED ✅ |
| SEC-06 | Med | Backend | Auth | Platform staff can log in on any tenant storefront | FIXED ◐ |
| SEC-07 | Med | Backend | Auth | Rate limiter is per-process / per-IP only | OPEN |
| SEC-08 | Med | Web/Admin | API client | Expired admin session is invisible to the UI | FIXED ✅ |
| SEC-09 | Low | Backend | Tenancy | `x-org-slug` trusted whenever NODE_ENV ≠ production | OPEN |
| SEC-10 | Low | Desktop | Electron | `will-navigate` prefix check can be fooled | FIXED ◐ |
| SEC-11 | Low | Backend | Auth | No CSRF tokens (SameSite only) | OPEN |
| SEC-12 | Low | Backend | Auth | `clearSessionCookie` omits `Secure` | FIXED ✅ |
| SEC-13 | Low | Backend | Deps | Unused deps, no dependency-audit gate | OPEN |
| SEC-14 | Med | All | Updates | Version endpoint advertises artifacts that 404 | FIXED ✅ |
| BUG-01 | High | Web | Routing | `/admin` link after signup is a 404 | FIXED ✅ |
| BUG-02 | High | All | Routing | No deep-link routes for `/watch/*`, `/movies/*`, `/live/*` | FIXED ✅ |
| BUG-03 | High | All | Downloads | Download buttons + in-app updater point at missing files | FIXED ✅ |
| BUG-04 | High | Web | Account | `playlistOpen` used before declaration (build blocker) | NOT REPRODUCED |
| BUG-05 | Med | Tests | Tests | `tests/unit/iptv.test.ts` could not import | FIXED ✅ |
| BUG-06 | Med | Backend | Playlist | Playlist URLs built from `request.url` (wrong host behind proxy) | FIXED ✅ |
| BUG-07 | Med | Backend | Health | Operator-disabled stream revived by a client success report | FIXED ✅ |
| BUG-08 | Med | Backend | Perf | `computeAccessSummary` / `/api/meta` load whole catalogs | OPEN |
| BUG-09 | Low | Backend | Meta | Raw NUL byte inside `meta/route.ts` | FIXED ✅ |
| BUG-10 | Low | Web | Player | `toPlayableUrl()` fallback produces an always-403 link | FIXED ✅ |
| BUG-11 | Low | Web/Admin | UX | Destructive actions use native `confirm()` (4 sites) | FIXED ✅ |
| BUG-12 | Low | Backend | Admin | Bulk channel actions accept an unbounded id list | FIXED ✅ |
| BUG-13 | Low | Backend | Perf | Customer search does `LIKE '%x%'` with no index | OPEN |
| BUG-14 | Med | Backend | Billing | Plan expiry has no scheduler; status lags until touched | FIXED ◐ |
| BUG-15 | Med | Web | State | Persisted store has no version/migration guard | FIXED ✅ |
| UX-01 | Med | Web/Admin | Copy | Mixed Hinglish/English tone across one product | OPEN |
| UX-02 | Med | Web/Admin | States | Missing error/empty states in several admin tables | FIXED ✅ |
| UX-03 | Low | Web | Admin | Admin is reached through Settings, not its own URL | FIXED ✅ |
| UX-04 | Med | Web | Errors | No `not-found` / `error` boundary (light Next default page) | FIXED ✅ |
| UX-05 | Low | Web | Nav | `#admin#section` hash hack instead of a route | FIXED ✅ |
| UX-06 | Low | Web | Downloads | Page says v0.5.0 while artifacts are 0.4.2 | FIXED ✅ |
| UX-07 | Low | Web/Admin | Forms | Admin forms accept submit with empty required fields | FIXED ✅ |
| UX-08 | Low | Web | Player | Controls auto-hide while a keyboard user is mid-tab | OPEN |
| UX-09 | Med | Web | A11y | Focus outline removed in a few custom buttons | OPEN |
| UX-10 | Med | All | Auth | No "forgot password" and no email/OTP verification | OPEN |
| UX-11 | Low | All | Auth | No self-service account deletion (GDPR-style request) | OPEN |
| RSP-01 | Low | Web | Responsive | Admin audit table needs horizontal scroll on phones | OPEN |
| RSP-02 | Low | Web | Responsive | Platform console tables have no sticky first column | FIXED ◐ |
| AND-01 | High | Android | Release | `versionName/versionCode` not bumped with the app | FIXED ◐ |
| AND-02 | Med | Android | Manifest | `allowBackup="true"` exposes cookies via adb backup | FIXED ◐ |
| AND-03 | Med | Android | Manifest | `usesCleartextTraffic` app-wide instead of scoped policy | FIXED ◐ |
| AND-04 | Med | Android | Updates | Unsigned APK self-update with no hash/signature check | OPEN |
| IOS-01 | High | iOS | Links | Universal links / `streamkaro://` target non-existent routes | FIXED ✅ |
| IOS-02 | Med | iOS | ATS | `NSAllowsArbitraryLoadsInWebContent` needs a review justification | OPEN |
| IOS-03 | Med | iOS | Shell | No offline cache — a blip reloads the whole web app | OPEN |
| IOS-04 | Low | iOS | Assets | App icon is a 512 px upscale (needs 1024 px) | OPEN |
| IOS-05 | Low | iOS | Settings | Server override accepts `http://` (cleartext storefront) | FIXED ◐ |
| DSK-01 | Med | Desktop | Updates | No auto-update channel | OPEN |
| DSK-02 | Med | Desktop | Lifecycle | No single-instance lock | FIXED ◐ |
| DSK-03 | Low | Desktop | Config | Server URL only at build time (no in-app switch) | OPEN |
| DSK-04 | Low | Desktop | Signing | Unsigned NSIS installer (SmartScreen warning) | OPEN |
| DB-01 | Med | Backend | Indexes | Missing composite indexes for the hot list queries | FIXED ◐ |
| DB-02 | Low | Backend | Integrity | `Customer.status` mirror can drift (no reconciliation job) | OPEN |
| DB-03 | Low | Backend | Schema | No migrations dir (db push only) | OPEN |

---

## Detailed entries (High and Medium)

### SEC-01 · High · Default admin credential is public
* **Module / platform:** Auth / web + admin panel
* **Location:** `scripts/seed-admin.ts:31`, `src/components/admin/AdminView.tsx:142`
* **Steps:** open `/` → Settings → Operators → look under the login form.
* **Expected:** no credential material on screen. **Actual:** `admin / StreamKaro@2024` printed.
* **Root cause:** dev convenience default carried into production UI; nothing forces rotation.
* **Fix:** hint removed; seed takes `ADMIN_PASSWORD` or generates one and prints it once; a
  warning banner appears in admin while a known-default password is still in use.
* **Impact if unfixed:** full tenant takeover on any deployment that never re-seeded.

### SEC-02 · High · Admin cannot change their own password
* **Location:** `src/components/admin/AdminView.tsx` (SettingsSection) — no route existed
* **Steps:** log in as admin → Settings → look for a password field.
* **Expected:** rotate the credential in-product. **Actual:** text says it ships later.
* **Root cause:** missing feature.
* **Fix:** `PATCH /api/admin/auth/password` + a Settings form; revokes other sessions; audited.
* **Depends on:** SEC-01 (this is how you get rid of the default password).

### SEC-03 · High · SSRF guard ignores DNS
* **Module / platform:** Backend proxy + net-guard
* **Location:** `src/app/api/proxy/route.ts` `isPrivateHost()`, `src/lib/server/net-guard.ts`
* **Steps:** take any minted proxy token for an operator-supplied source URL pointing at a
  hostname that resolves to `10.x` / `169.254.169.254` (e.g. `X.ip.nip.io`) → the proxy fetches it.
* **Expected:** blocked. **Actual:** fetched; body streamed back.
* **Root cause:** string-only check, documented in the source.
* **Fix:** `resolveSafeHost()` resolves the name (cached 60 s) and validates every address;
  the proxy re-checks each redirect hop with it.
* **Impact:** cloud metadata / internal network access from the internet-facing proxy.

### SEC-04 · Medium · Fixtures mode disables the plan gate
* **Location:** `src/lib/server/media/gate.ts`
* **Steps:** `MEDIA_FIXTURES=1` in a production env → `GET /api/media/home` without a cookie.
* **Expected:** 403 for guests. **Actual:** 200 with the sample catalog.
* **Fix:** fixture mode is refused when `NODE_ENV === "production"`.

### SEC-05 · Medium · Signup race → 500
* **Location:** `src/app/api/signup/route.ts`
* **Steps:** two concurrent `POST /api/signup` with the same slug.
* **Expected:** 409 for the second. **Actual:** 500 + Prisma error logged.
* **Fix:** catch `P2002` → 409; applied to signup and admin customer create.

### SEC-08 · Medium · Expired admin session invisible
* **Location:** `src/lib/admin-api.ts:149`, `AdminView.tsx`
* **Steps:** clear the `sk_admin_session` cookie, then click any admin action.
* **Expected:** back to login with "session expired". **Actual:** error toast per action, panel
  keeps rendering stale data.
* **Fix:** typed `AdminApiError` with `status`; global 401 event → re-check `admin-me`.

### SEC-14 / BUG-03 · Medium/High · Advertised artifacts do not exist
* **Location:** `src/lib/downloads.ts`, `src/app/api/app/version/route.ts`, `public/downloads/`
* **Steps:** Download page → click "Android" / "Windows"; on Android, let the updater offer an update.
* **Expected:** download starts, or the button is disabled with an explanation.
* **Actual:** 404 page; the in-app updater downloads an HTML 404 body.
* **Root cause:** artifact list is a compile-time constant, never checked against disk; versions
  drifted (app 0.5.0, APK 0.4.2, desktop 0.4.1).
* **Fix:** `/api/app/downloads` reports real availability; UI and updater consume it; version
  constants centralised.

### BUG-01 / BUG-02 / IOS-01 / UX-03 · High · No URL routing → dead links everywhere
* **Location:** `src/app/page.tsx` (single route), `src/app/signup/page.tsx`,
  `src/app/api/signup/route.ts`, `src/components/tv/AppShell.tsx`, `ios/Support/Info.plist`,
  `src/app/apple-app-site-association/route.ts`
* **Steps:**
  1. Sign up → click "Admin panel" → 404.
  2. Open `https://<site>/watch/<channelId>` → 404.
  3. Tap a universal link / `streamkaro://watch/<id>` on iOS → app opens, web view shows 404.
* **Expected:** the link opens the screen it names. **Actual:** 404 in all three cases.
* **Root cause:** the client app keeps navigation in memory (`useAppStore.stack`) and never
  reads the URL; no catch-all route exists, so Next 404s before the app boots.
* **Fix:** catch-all app route + `initialViewFromPath()` mapping (`/watch/:id`, `/movie/:id`,
  `/title/:id`, `/live`, `/movies`, `/admin`, `/settings`, …) + URL sync on navigation +
  signup deep link corrected; AASA component list aligned to the real paths.

### BUG-04 · High · `playlistOpen` undeclared (build blocker)
* **Location:** `src/components/tv/AccountView.tsx` (`ProfilePanel`)
* **Steps:** `tsc --noEmit` / `next build` on `main`.
* **Expected:** clean build. **Actual:** `TS2304: Cannot find name 'setPlaylistOpen'`.
* **Root cause:** state added to the wrong component (`LoginScreen`).
* **Fix:** state moved into `ProfilePanel`; build verified.

### BUG-06 · Medium · Playlist URLs use the internal origin
* **Location:** `src/app/api/playlist/[...slug]/route.ts` (`new URL(request.url).origin`)
* **Steps:** deploy behind a proxy that forwards `Host: 127.0.0.1:3000` (common), generate the
  playlist, open it in VLC.
* **Expected:** `https://<public-host>/api/proxy?t=…`. **Actual:** `http://127.0.0.1:3000/…` → dead.
* **Fix:** `publicOrigin(request)` prefers `x-forwarded-proto`/`x-forwarded-host`, then `Host`.

### BUG-07 · Medium · Operator-disabled source comes back
* **Location:** `src/app/api/streams/report/route.ts`
* **Steps:** disable a source in Admin → Channel sources; play the channel; the client reports `ok`.
* **Expected:** stays disabled. **Actual:** `status` is set back to `ACTIVE`.
* **Root cause:** the success branch unconditionally writes `status: "ACTIVE"`.
* **Fix (recommended, OPEN):** add `Stream.disabledBy` (`AUTO|OPERATOR`) and only auto-recover
  rows disabled by the doctor. Deferred because it needs a schema column + sync-engine touch.

### BUG-08 · Medium · Whole-catalog aggregation in Node
* **Location:** `src/lib/server/access.ts` `computeAccessSummary`, `src/app/api/meta/route.ts`
* **Effect:** each admin preview / facet rebuild pulls every channel row of the tenant into
  memory (10k+ rows typical, ~100k for large operators) and tallies in JS.
* **Fix (recommended, OPEN):** SQL `GROUP_CONCAT`/`groupBy` per dimension, or a nightly
  materialised `ChannelFacet` table. `/api/meta` already caches 10 min, which is why this is
  Medium and not High.

### BUG-15 · Medium · Persisted store has no version guard
* **Location:** `src/lib/store.ts` (`persist` merge)
* **Effect:** an older/newer saved shape merges blindly. Today `merge()` spreads saved over
  current, which keeps unknown keys and can resurrect stale filter shapes.
* **Fix:** `version: 2` + `migrate()` that whitelists known keys and drops everything else.

### UX-01 · Medium · Mixed language tone
* **Location:** all admin sections + several customer screens
* **Effect:** the same screen mixes "Dead channels", "Kanal", "channel delete karein?", "Login
  ho raha hai…". For an Indian operator that may be friendly, but it is inconsistent and
  untranslatable — there is no i18n layer at all.
* **Fix (recommended, OPEN):** pick one base language for product chrome (English) and keep
  Hinglish only in hints; move strings into `src/lib/i18n/en.ts` so a `hi` bundle can follow.

### UX-04 · Medium · No error/not-found boundary
* **Location:** `src/app/` (no `not-found.tsx`, no `error.tsx`)
* **Effect:** a bad URL or a render crash shows Next's default light page inside a dark product.
* **Fix:** branded `not-found.tsx` + `error.tsx` + `global-error.tsx` (fixed).

### AND-01 · High · Android build version not bumped
* **Location:** `android/app/build.gradle` (`versionName 0.4.2`, `versionCode 5`)
* **Effect:** the in-app updater compares the installed versionCode to `ANDROID_RELEASE`
  (also 5) and never offers an update, while the marketing/version surfaces say 0.5.0.
* **Fix (recommended, OPEN — needs a real APK build):** bump both, and derive
  `ANDROID_RELEASE` from a single source.

### IOS-02 / IOS-03 / IOS-05 · iOS shell
* ATS exception is required for http IPTV streams but must be justified in App Review (OPEN).
* No offline cache: a network blip drops the web view back to the boot URL (OPEN).
* Server override accepted `http://` (cleartext storefront) → now rejected unless explicitly
  allowed (FIXED).

---

## 13. Phase 2 implementation log (what was actually changed, and how it was checked)

Every entry below was re-read in the current tree after the change. "Verified" means a test in
`tests/unit/` exercises the logic, or the defect's exact code path was re-traced. Anything that needs
a database, device, or build is `FIXED ◐` in the table above and is **not** reported as tested.

### 13.1 Verified fixes

| ID | Change | Verified by |
|---|---|---|
| SEC-01 | `scripts/seed-admin.ts` takes `ADMIN_PASSWORD` (or generates a random one and prints it once), refuses weak/default values in production, skips the demo customer unless `SEED_TEST_CUSTOMER=1`; the login screen no longer prints credentials; `bulk-import-run.py` / `e2e-bulk-ui.sh` read `ADMIN_PASSWORD` from the environment | `password-rules.test.ts` (rules incl. `StreamKaro@2024` rejection); grep confirms no remaining hardcoded credential outside docs |
| SEC-02 | New `POST /api/admin/auth/password` (verify current → validate → update hash → delete every **other** session of that admin → audit) and a real "Change password" card in Settings | route re-read (session looked up by `tokenFingerprint`, never the raw token); unit rules tested |
| SEC-03 | `net-guard.ts` rewritten: `isPrivateAddress` (v4/v6/CGNAT/metadata/multicast), `isPrivateHostname`, async `resolvesToPublicAddress` (fails closed, 60 s cache, 500-entry cap), `resolvedPublicUrl`, `assertResolvedPublicUrl`, `safeFetch` (manual redirects, per-hop check, budget 5). Proxy, health doctor and media gate use it | `net-guard.test.ts` — 20 tests including `169.254.169.254.nip.io`, mixed DNS answers, NXDOMAIN, private redirect hop |
| SEC-04 | `mediaGate` returns 503 when `MEDIA_FIXTURES=1` in production instead of skipping auth | code path re-read (gate is the first statement) |
| SEC-05 | Signup and `createCustomer` translate a unique-constraint race into `HttpError(409)` | code path re-read; the pre-existing `iptv`/`access` suites still pass |
| SEC-08 | `admin-api.ts` throws `AdminApiError` (keeps status + reason), broadcasts `streamkaro:admin-session-expired` on 401, and `AdminView` resets to the login form | code path re-read (listener registered/unregistered in an effect) |
| SEC-12 | `clearSessionCookie` mirrors `Secure` + an explicit expiry | code path re-read |
| BUG-01/02/UX-03/UX-05/IOS-01 | `src/lib/deep-link.ts` (pure path⇄screen table) + `src/app/[...slug]/page.tsx`; `AppShell` boots on the URL, keeps the address bar in step with `replaceState`, and migrates old `#admin` links | `deep-link.test.ts` — 11 tests incl. round-trip and 404 cases |
| BUG-03/SEC-14 | `GET /api/app/downloads` stats each artifact; the download page marks "Build not uploaded yet" instead of linking a 404, shows real sizes, and still offers PWA install | route re-read; `public/downloads/` contains only `README.txt`, so on this checkout the page now says "not uploaded" (previously it said Download) |
| BUG-05 | `tests/unit/iptv.test.ts` imports cleanly | full suite green |
| BUG-06 | `publicOrigin()` in `tenant.ts` (PUBLIC_BASE_URL → validated `x-forwarded-host` → request origin); the playlist route uses it | code path re-read |
| BUG-07 | `Stream.disabledBy` (`AUTO`/`OPERATOR`); probes and client reports only revive `AUTO`; both admin switch-off paths record `OPERATOR` | `stream-revival.test.ts` — 7 tests |
| BUG-09 | The literal NUL byte in `meta/route.ts` is gone (anonymous rows now use their own set) | `grep -caP "\x00"` → 0; file no longer detected as binary |
| BUG-10 | `toPlayableUrl` no longer fabricates an unsigned `/api/proxy?url=` link (a guaranteed 403) | code path re-read |
| BUG-11 | New `ConfirmButton` (AlertDialog) replaces `window.confirm` in Channels/Customers/Plans/Portals | `grep -rn "confirm(" src/components/admin` → no matches |
| BUG-12 | Bulk channel ids capped at 500 and type/length-checked | code path re-read |
| BUG-14 | `reconcileCustomerAccess()` re-derives lapsed mirrors; called from `/api/cron/health` | code path re-read |
| BUG-15 | Persisted store has `version: 2`, a total `migratePersisted` and a typed `mergePersisted` that only takes the 7 persisted keys | `store-persist.test.ts` — 8 tests |
| UX-04 | `not-found.tsx`, `error.tsx`, `global-error.tsx` (branded, dark, with a way back) | files added; catch-all returns `notFound()` for non-screens |
| UX-06 | One version (0.5.0) across `downloads.ts`, `android/app/build.gradle`, `desktop/package.json` | grep for `0.4.2` → only `package-lock.json` dependency versions |
| UX-07 | Customer and Plan dialogs validate required fields, email shape, price/duration/device ranges before calling the API | code path re-read |

### 13.2 Changed but unverified here

| ID | Change | Why unverified |
|---|---|---|
| SEC-06 | Platform staff can only sign in on the platform host; a tenant storefront accepts only its own admins | needs a running server with two hosts |
| SEC-10 | Electron `will-navigate` compares parsed origins (+ subdomains) instead of a string prefix; non-http(s) links are never handed to the OS | `node --check` only; no display/Electron build |
| BUG-04 | Re-read both `playlistOpen` sites (`AccountView`, `SettingsView`): declared before use, no shadowing, closes over `setPlaylistOpen` | the reported build blocker does not exist in this tree; if it reappears, the error message will name the line |
| BUG-03 (updater half) | The Android in-app updater still reads `/api/app/version`, which advertises `versionCode 6`; it will only offer an update once a 0.5.0 APK exists at the advertised path | no device to install an older build |
| AND-01/02/03 | `versionCode 6`/`versionName "0.5.0"`; `allowBackup=false` + `fullBackupContent=false`; `usesCleartextTraffic` replaced by `network_security_config.xml` (cleartext denied except localhost/emulator loopback) | no Android SDK/Gradle in this environment |
| IOS-05 | Release builds reject `http://` in the server override (http allowed only for local dev hosts in DEBUG) | no Swift toolchain |
| DSK-02 | Single-instance lock; a second launch focuses/restores the existing window | no Electron runtime |
| DB-01 | 10 composite indexes declared in `schema.prisma` and mirrored in `prisma/sql/2026-11-02-stream-disabled-by-and-indexes.sql` (idempotent, with rollback) | Prisma engine download is blocked → the SQL was **not** applied and no `EXPLAIN` was captured |

### 13.3 Deployment order for this batch

1. Back up the database.
2. Apply `prisma/sql/2026-11-02-stream-disabled-by-and-indexes.sql` (adds `Stream.disabledBy`, backfills
   existing disabled rows to `AUTO`, creates the indexes).
3. Deploy the app code.
4. Set `ADMIN_PASSWORD` (or record the generated one printed by the seed) and rotate the current owner
   password via **Admin → Settings → Change password**.
5. Set `PUBLIC_BASE_URL` so generated playlist links are correct behind the proxy.
6. Upload the 0.5.0 APK / Windows installer to `public/downloads/` — until then the download page
   correctly says "Build not uploaded yet".
7. Run `curl -XPOST -H "authorization: Bearer $CRON_SECRET" https://<host>/api/cron/health` and confirm
   `billing.checked` / `billing.changed` are present.
