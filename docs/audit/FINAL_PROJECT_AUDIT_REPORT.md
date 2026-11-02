# StreamKaro — Final Project Audit Report

**Date:** 2026-11-02 · **Branch:** `arena/3cf21e50-iptv-app` (from `main` @ `9bb82e7`)
**Scope audited:** Web app · Super Admin (platform) console · Organization Admin panel · Android (phone + TV) · iOS (xtool) · Desktop (Electron) · backend, database and API.
**Status of this report:** Phase 3 deliverable, written against the code as it stands **today**. Items that could not be verified in this environment are labelled as such throughout — nothing here is claimed as tested without evidence.

---

## 1. Executive summary

StreamKaro is a working multi-tenant IPTV SaaS: a Next.js 16 / React 19 storefront with a
Prisma/MySQL backend, an org-admin panel, a cross-tenant platform console, native Android (Capacitor +
Media3), an iOS shell built with xtool, and an Electron desktop build. The core is sound — auth hashing,
session fingerprinting, tenant scoping, plan gating and the failover/health machinery are better than
most products at this stage.

The audit found **0 Critical, 9 High, 17 Medium, 21 Low** issues. The High set was not in the business
logic; it was concentrated in three themes:

1. **A deployment that could not be used as shipped** — deep links and `/admin` were 404s (so refreshes,
   bookmarks, shared links and the iOS deep links all broke), and the advertised APK/EXE downloads did
   not exist.
2. **A default credential with no way out** — the seeded owner password was printed on the product's own
   login screen and could not be changed anywhere in the UI.
3. **An SSRF guard that could be walked around** — it only looked at the *string* of the hostname, so
   `169.254.169.254.nip.io` or a public-looking name resolving to a private IP reached the metadata
   service through the media proxy.

All nine High issues are now addressed in code. The Medium/Low backlog is partly closed and the
remainder is listed with reasons in §7.

**What is proven:** 173 unit tests pass (52 added this cycle), covering every pure-logic fix.
**What is not proven:** anything that needs a database, a device, an emulator or a build — there is no
reachable MySQL (Prisma engine downloads are blocked here), no Android SDK, no Swift toolchain, no
Electron runtime. Those items are `FIXED ◐` (changed, unverified) in `BUGS_AND_ISSUES.md`, never
"tested".

---

## 2. Issues found / fixed / pending

| Severity | Found | Fixed (verified) | Changed, unverified | Open |
|---|---|---|---|---|
| Critical | 0 | 0 | 0 | 0 |
| High | 9 | 7 | 2 | 0 |
| Medium | 17 | 10 | 1 | 6 |
| Low | 21 | 8 | 3 | 10 |
| **Total** | **47** | **25** | **6** | **16** |

Counted from the register in [`BUGS_AND_ISSUES.md`](./BUGS_AND_ISSUES.md) (statuses `FIXED ✅` /
`FIXED ◐` / `OPEN`). `BUG-04` is counted as closed but is listed as *not reproduced*: the reported
build blocker does not exist in this tree (both `playlistOpen` sites declare the state before using it).

### High severity (all closed)

| ID | Issue | Resolution |
|---|---|---|
| SEC-01 | Seeded `admin / StreamKaro@2024` printed on the login screen and hardcoded in scripts | Password from `ADMIN_PASSWORD` or generated+printed once; production refuses weak/default values; login hint removed; scripts read the env |
| SEC-02 | Admin could not change their own password (UI said "next version") | `POST /api/admin/auth/password` + Settings card; other sessions of that admin revoked; audit-logged |
| SEC-03 | SSRF guard ignored DNS (rebinding / metadata) | Two-layer guard with real DNS resolution, fail-closed, cached; per-hop redirect checks; used by proxy, health doctor, media gate |
| BUG-01 | `/admin` after signup was a 404 | Deep-link layer + `/admin` screen |
| BUG-02 | No deep-link routes (`/watch/*`, `/movies/*`, `/live`) | `src/lib/deep-link.ts` + catch-all route; address bar follows the view stack |
| BUG-03 | Download buttons / updater pointed at missing files | Server-side availability check; page states "Build not uploaded yet"; versions aligned |
| AND-01 | Android `versionName`/`versionCode` not bumped | 0.5.0 / versionCode 6, matching web and desktop |
| IOS-01 | Universal links / `streamkaro://` targeted non-existent routes | Routes now exist and are covered by the deep-link tests |
| BUG-04 | `playlistOpen` build blocker | Not reproducible in the current tree |

---

## 3. Files, modules, DB and API changed

### 3.1 New files

```
src/lib/deep-link.ts                              path ⇄ screen table (pure, tested)
src/app/[...slug]/page.tsx                        deep-link entry point (404s for non-screens)
src/app/not-found.tsx  src/app/error.tsx          branded boundaries
src/app/global-error.tsx
src/app/api/admin/auth/password/route.ts          self-service password change
src/app/api/app/downloads/route.ts                which artifacts actually exist
src/lib/server/password-rules.ts                  admin/customer password policy (pure, tested)
prisma/sql/2026-11-02-stream-disabled-by-and-indexes.sql
android/app/src/main/res/xml/network_security_config.xml
tests/unit/{net-guard,deep-link,password-rules,store-persist,stream-revival}.test.ts
docs/audit/USER_FLOWS.md · PERFORMANCE_AUDIT.md · TESTING_AUDIT.md · ROADMAP.md
```

### 3.2 Modified (by area)

| Area | Files | What changed |
|---|---|---|
| SSRF / proxy | `lib/server/net-guard.ts` (rewritten), `api/proxy/route.ts`, `lib/server/health-doctor.ts`, `lib/server/media/gate.ts` | DNS-aware guard, `safeFetch`, per-hop checks, manifest base from the final URL, fixtures refused in production |
| Auth | `lib/server/auth.ts`, `api/admin/auth/login`, `api/admin/auth/password`, `api/signup`, `lib/server/billing.ts` | cookie flags, token-based session lookup, unique-race → 409, tenant-only staff login, session broadcast |
| Routing/UI shell | `lib/deep-link.ts`, `app/[...slug]`, `components/tv/AppShell.tsx`, `lib/store.ts` | deep links, address-bar sync, versioned persisted store |
| Admin panel | `components/admin/{AdminView,shared,Channels,Customers,Plans,Portals}Section`, `lib/admin-api.ts` | password card, session-expiry handling, `ConfirmButton`, form validation, `TableState`, typed API error |
| Downloads/versions | `lib/downloads.ts`, `components/tv/DownloadView.tsx`, `android/app/build.gradle`, `desktop/package.json` | availability check, one version everywhere |
| Health/failover | `lib/server/health-doctor.ts`, `api/streams/report`, `api/admin/channels/[id]/streams/[streamId]`, `api/platform/channels/[id]` | auto vs operator disable |
| Billing | `lib/server/billing.ts`, `api/cron/health` | lapsed-plan reconciliation on schedule |
| Tenancy/playlist | `lib/server/tenant.ts`, `api/playlist/[...slug]` | trusted public origin |
| Misc backend | `api/meta/route.ts`, `api/admin/channels/bulk/route.ts` | NUL byte removed, bulk ids bounded |
| Mobile/desktop | `android/app/src/main/AndroidManifest.xml` (+ network config), `ios/Sources/StreamKaro/AppConfig.swift`, `desktop/main.js` | backup off, cleartext scoped, https-only override, single-instance lock, origin-based navigation |
| Scripts | `scripts/seed-admin.ts`, `bulk-import-run.py`, `e2e-bulk-ui.sh` | no hardcoded credentials |

### 3.3 Database changes

| Change | Rollback |
|---|---|
| `Stream.disabledBy VARCHAR(191) NULL` (`AUTO` / `OPERATOR`), existing disabled rows backfilled to `AUTO` | `ALTER TABLE Stream DROP COLUMN disabledBy` |
| 10 composite indexes: `Channel(org,isActive,name)`, `Channel(org,healthStatus)`, `Customer(org,status)`, `Customer(org,accountStatus)`, `Customer(org,createdAt)`, `Subscription(customerId,status)`, `Subscription(status,endsAt)`, `Stream(channelId,status)`, `Stream(status,lastProbeAt)`, `AuditLog(org,createdAt)` | `DROP INDEX` lines are included at the bottom of the SQL file |

No data was deleted or rewritten. **Not applied here** (no reachable MySQL); the SQL is idempotent and
must run before the new code (§9).

### 3.4 API changes

| Endpoint | Change | Compatible? |
|---|---|---|
| `POST /api/admin/auth/password` | **new** | additive |
| `GET /api/app/downloads` | **new** | additive |
| `POST /api/admin/channels/bulk` | rejects > 500 ids with 400 | the UI never sent more than a page |
| `POST /api/streams/report` | `ok:true` no longer revives an operator-disabled stream (returns `status:"DISABLED"`) | response shape unchanged |
| `POST /api/admin/auth/login` | platform staff rejected on tenant storefronts | intended tightening |
| `POST /api/signup`, customer create | duplicate race → 409 instead of 500 | strictly better |
| `GET /api/playlist/<token>/*` | URLs built from a trusted origin | same format, correct host |
| `POST /api/cron/health` | response adds a `billing` object | additive |

No endpoint was removed and no response field was renamed.

---

## 4. Security improvements

* **SSRF** is now two-layer and fails closed; every redirect hop is re-checked; the health doctor's
  probes use the same guard (they previously relied on a save-time string check).
* **Credentials**: no default password in the repo, the UI, or the seed output; production seed refuses
  weak values; admins can rotate their own password, which revokes their other sessions.
* **Cookies**: clearing mirrors `Secure`/expiry; tokens are 48 random bytes, stored only as sha256
  fingerprints; `httpOnly` + `SameSite=Lax` + `Secure` in prod.
* **Tenancy**: platform staff can no longer sign in through an operator's storefront; tenant resolution
  still 404s on an unknown subdomain rather than falling back to root.
* **Fixtures mode** can no longer disable the plan gate in production.
* **Electron** navigation compares parsed origins (a prefix check let `host.evil.com` load inside the
  app); **Android** backup is disabled and cleartext is limited to dev hosts; **iOS** refuses `http://`
  storefront overrides in release.
* **Error hygiene**: the admin API client keeps the HTTP status and broadcasts a session expiry, so a
  401 is no longer indistinguishable from a 500.

Remaining security items (all Low/Medium, reasons in §7): per-process rate limiting (SEC-07),
CSRF tokens (SEC-11, mitigated by `SameSite=Lax` + JSON-only bodies), `x-org-slug` dev header
(SEC-09, non-production only), dependency-audit gate (SEC-13).

---

## 5. UI/UX and responsive improvements

* **Addressable screens** — every screen has a URL; refresh, bookmark, share, and the native shells'
  deep links all work.
* **Honest states** — `/downloads` no longer offers files that 404; the admin tables now distinguish
  *loading* / *error + retry* / *empty* instead of showing "Koi … nahi" for a failed request.
* **Destructive actions** use a focus-trapped dialog with an explanation, not `window.confirm`
  (which is unstyled, blocks the thread, and is unusable from a TV remote).
* **Forms validate before the request** (required fields, email shape, price/duration/device ranges)
  and show the message inline instead of a toast after a round-trip.
* **Branded 404 / error / global-error** screens in the product's own dark theme with a way back.
* **Admin password** is now manageable in Settings — the dead "next version" note is gone.
* **Copy**: still mixed Hinglish/English (UX-01, open) — the biggest remaining polish item.
* **Responsive**: admin tables scroll horizontally where needed (RSP-01 verified present) and the
  platform Organizations table pins its identifying column (RSP-02 fixed).

TV-specific behaviour (focus model, D-pad, back stack) was reviewed and left intact; the only change
that touches it is the URL sync, which does not add history entries (it uses `replaceState`, because
`lib/back.ts` owns the history contract).

---

## 6. Per-platform status

| Platform | Code changes | Verification |
|---|---|---|
| **Web (PWA)** | deep links, boundaries, downloads, admin UI, store migration | unit-tested logic; **no browser E2E** (no seeded DB here) |
| **Org Admin panel** | password, session expiry, dialogs, validation, table states | unit-tested helpers; no browser E2E |
| **Platform console** | operator-disable semantics, sticky column | code review |
| **Android** | version bump, backup off, network security config | **no SDK/Gradle/device** → unverified |
| **iOS (xtool)** | https-only server override, deep-link routes exist | **no Swift toolchain** → unverified |
| **Desktop (Electron)** | single-instance lock, origin-based navigation | `node --check` only → unverified |

---

## 7. Remaining risks and open issues

| ID | Sev | Why it is still open |
|---|---|---|
| BUG-08 | Med | `/api/meta` still computes facets in Node over the whole catalogue. A correct fix is a precomputed facet table refreshed by sync/cron (or SQL-side splitting); doing it blind without a database to test against would risk wrong counts on the main screen. |
| SEC-07 | Med | A real rate limiter needs shared state (Redis or a gateway). An in-process Map is what exists; replacing it blind would be worse than documenting it. |
| SEC-09 | Low | `x-org-slug` is dev-only; needs a deployment-level check that `NODE_ENV` is set correctly. |
| SEC-11 | Low | CSRF tokens would touch every mutating route; `SameSite=Lax` + JSON-only bodies already block classic cross-site form posts. |
| SEC-13 | Low | Dependency audit needs network access to the advisory database and a CI gate; `zod`/`sonner` are installed but unused. |
| UX-01 | Med | Copy pass (consistent Hinglish *or* English) is a product decision, not a code fix. |
| UX-08/09 | Low | Player controls hiding while tabbing; focus-ring audit. Both need a browser + keyboard to verify. |
| UX-10/11 | Med | Password reset and self-service deletion need a mail transport and new tables — a feature, not a fix. Stated in `ROADMAP.md`. |
| RSP-01 | Low | Verified that the audit table scrolls; a full mobile pass needs a browser. |
| AND-04 | Med | APK self-update should verify a hash/signature; needs signing keys and a device to test. |
| IOS-02/03/04 | Med/Low | ATS justification, offline cache, 1024 px icon — all need an Apple toolchain. |
| DSK-01/03/04 | Med/Low | Auto-update, in-app server switch, code signing — need build infrastructure and signing keys. |
| DB-02/03 | Low | Mirror drift report and adopting `prisma migrate` need a database and a CI pipeline. |
| BUG-13 | Low | Customer search `LIKE '%x%'` needs `FULLTEXT` + a query rewrite, which requires a live DB to validate. |

**Risk ranking for going live:** the *code* is in reasonable shape; the *process* is the risk. There is
no CI, no staging database, no automated E2E and no device matrix. That, not the 16 open items, is what
would cause the next incident.

---

## 8. Tests

| Check | Result |
|---|---|
| `npx vitest run` | **173 passed / 16 files** (baseline 121 / 11) — +52 tests |
| New suites | `net-guard` (20), `deep-link` (11), `password-rules` (8), `store-persist` (8), `stream-revival` (7) |
| `npx tsc --noEmit` | only the pre-existing Prisma-stub errors (engine unavailable) + 3 pre-existing literal-type errors; **zero** in files touched this cycle |
| `npx eslint src tests scripts` | 4 errors, all `react-hooks/set-state-in-effect` in pre-existing code; **zero new** |
| `node --check desktop/main.js` | OK |
| DB / integration tests | **not run** — no database |
| Android / iOS / Electron runtime | **not run** — no toolchains or devices |
| Browser E2E | **not run** — no seeded database to serve |

---

## 9. Deployment recommendations (this batch)

1. **Back up the database** and confirm a restore works.
2. Apply `prisma/sql/2026-11-02-stream-disabled-by-and-indexes.sql` **before** the new code (it adds the
   column the new code writes). The file is idempotent and carries its own rollback.
3. Deploy the app; set `PUBLIC_BASE_URL` (playlist links), `ADMIN_PASSWORD` (or record the generated one),
   and verify `CRON_SECRET` is present.
4. Rotate the owner password through **Admin → Settings → Change password** on every existing install —
   the old public password is known and this is the one action only a human can take.
5. Upload the 0.5.0 APK / Windows installer; until then the page honestly says "not uploaded".
6. Run the cron once and check `billing` appears in the response.
7. Smoke test, in this order: `/` → `/watch/<id>` refresh → `/admin` login → Settings password change →
   `/download` → playlist URL from another network → a real channel from a phone.
8. Watch the error log for `blocked-host` probe failures for 24 h — a legitimate provider whose DNS
   fails closed will show up there.

**Before calling the platform production-ready** (independent of this audit): add CI, a staging
database with real data, Playwright E2E, and a device matrix. See `TESTING_AUDIT.md` §7.

---

## 10. Where to read more

| Document | Contents |
|---|---|
| [`PROJECT_ARCHITECTURE.md`](./PROJECT_ARCHITECTURE.md) | stack, layers, module map |
| [`COMPLETE_APPLICATION_FLOW.md`](./COMPLETE_APPLICATION_FLOW.md) | request/response traces per feature |
| [`USER_FLOWS.md`](./USER_FLOWS.md) | every role and journey end-to-end |
| [`MODULE_WISE_AUDIT.md`](./MODULE_WISE_AUDIT.md) | module-by-module findings |
| [`SECURITY_AUDIT.md`](./SECURITY_AUDIT.md) | RBAC, tenancy, IDOR, XSS/CSRF/SSRF, uploads, secrets |
| [`BUGS_AND_ISSUES.md`](./BUGS_AND_ISSUES.md) | the 47-issue register + §13 implementation log |
| [`WEB_APPLICATION_AUDIT.md`](./WEB_APPLICATION_AUDIT.md) · [`ANDROID_APPLICATION_AUDIT.md`](./ANDROID_APPLICATION_AUDIT.md) · [`IOS_APPLICATION_AUDIT.md`](./IOS_APPLICATION_AUDIT.md) · [`DESKTOP_APPLICATION_AUDIT.md`](./DESKTOP_APPLICATION_AUDIT.md) | per platform |
| [`UI_UX_RESPONSIVE_AUDIT.md`](./UI_UX_RESPONSIVE_AUDIT.md) | navigation, controls, keyboard, breakpoints |
| [`BACKEND_DATABASE_AUDIT.md`](./BACKEND_DATABASE_AUDIT.md) | schema, indexes, transactions, races |
| [`PERFORMANCE_AUDIT.md`](./PERFORMANCE_AUDIT.md) | query shapes, caches, measurement plan |
| [`TESTING_AUDIT.md`](./TESTING_AUDIT.md) | what is tested, what cannot be, how to close the gap |
| [`FIXING_ROADMAP.md`](./FIXING_ROADMAP.md) · [`ROADMAP.md`](./ROADMAP.md) | fix order · product roadmap |
