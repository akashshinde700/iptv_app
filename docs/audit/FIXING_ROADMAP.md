# 12. Fixing Roadmap

Order follows the mandated priority: security → data integrity → core logic → backend → auth →
APIs → navigation → buttons → forms → UI/UX → responsive → Android → iOS → desktop → perf.

"Batch" is what this audit actually executed; "next" is the recommended follow-up with a
realistic size estimate.

---

## Batch 1 — Security (executed)

| # | Issue | Change | Verify |
|---|---|---|---|
| 1 | SEC-01 | Remove the credential hint from the admin login; seed admin takes `ADMIN_PASSWORD` or generates a random one and prints it once | grep finds no literal password in `src/` |
| 2 | SEC-02 | `PATCH /api/admin/auth/password` + Settings form; other sessions revoked; audited | unit test on the pure rules + route review |
| 3 | SEC-03 | DNS-resolving SSRF guard shared by `/api/proxy` and `net-guard`, with a 60 s cache | new unit tests (localhost, 10/8, 169.254, nip.io-style, public host) |
| 4 | SEC-04 | Fixture mode refuses to start in production | unit test |
| 5 | SEC-05 | `P2002` → 409 on signup and admin customer create | route-level test |
| 6 | SEC-08 | Typed `AdminApiError` + global 401 event → back to login | unit test on the error class |
| 7 | SEC-12 | `Secure` on the clear-cookie header in production | code review |
| 8 | SEC-14/ BUG-03 | `/api/app/downloads` reports real artifact availability; UI + updater consume it; single version source | unit tests + route test |

## Batch 2 — Data integrity & core logic (executed)

| # | Issue | Change |
|---|---|---|
| 9 | BUG-04 | `playlistOpen` state moved to the component that renders the dialog (build blocker) |
| 10 | BUG-05 | `vi.mock('@/lib/db')` in `iptv.test.ts` so the suite runs |
| 11 | BUG-06 | `publicOrigin()` prefers `x-forwarded-proto/host` for playlist URLs |
| 12 | BUG-09 | Raw NUL byte in `meta/route.ts` replaced with `\u0000` |
| 13 | BUG-10 | `toPlayableUrl()` no longer fabricates an unsigned proxy link |
| 14 | BUG-15 | Persisted store gains `version: 2` + `migrate()` |
| 15 | DB-01 | Additive composite indexes on `Channel`, `Customer`, `Subscription` |

## Batch 3 — Navigation, buttons, errors (executed)

| # | Issue | Change |
|---|---|---|
| 16 | BUG-01 / BUG-02 / IOS-01 / UX-03 / UX-05 | Catch-all app route + `initialViewFromPath()`; `/watch/:id`, `/movie/:id`, `/title/:id`, `/live`, `/movies`, `/admin`, `/settings`, `/download`, `/premium`, `/profile`; URL sync on navigate; signup deep link fixed; AASA paths aligned |
| 17 | UX-04 | Branded `not-found.tsx`, `error.tsx`, `global-error.tsx` |
| 18 | BUG-11 | `window.confirm()` replaced by the shared `ConfirmDialog` in the 4 admin sites |
| 19 | DSK-02 / SEC-10 | Electron single-instance lock + origin comparison |
| 20 | IOS-05 | Server override requires `https` |

## Batch 4 — UI/UX & responsive (partially executed)

| # | Issue | Change / decision |
|---|---|---|
| 21 | UX-02 | Admin tables get explicit empty + error rows (the two worst offenders) |
| 22 | UX-06 | Download page no longer claims a version it cannot deliver (driven by availability) |
| 23 | RSP-01/02 | Sticky first column + `min-w` on the two widest admin/platform tables |
| — | UX-01 (i18n) | **Not executed** — needs a string extraction of ~2k literals. Recommended as its own branch: `src/lib/i18n/{en,hi}.ts` + a language toggle stored in the app store. |
| — | UX-07/08/09, RSP touch targets | **Not executed** — cosmetic; listed for a design pass. |

## Next (recommended order, with size)

| Order | Work | Why now | Size |
|---|---|---|---|
| 1 | **Android release bump + artifact publishing** (AND-01, AND-04) | the updater is currently a no-op; needs a real Gradle build on a machine with the SDK | S (build) + M (hash publish) |
| 2 | **Scheduler for expiry** (BUG-14, DB-02) | customer status is the sales truth; a 00:05 cron + reconcile endpoint | S |
| 3 | **Redis-backed rate limiting** (SEC-07) | required the moment a second replica exists | M |
| 4 | **Sticky operator disable** (BUG-07) | schema column `Stream.disabledBy` + doctor/sync/report touch points | M |
| 5 | **SQL aggregation for facets/access summary** (BUG-08) | p95 on `/api/meta` and the customer preview | M |
| 6 | **i18n + copy pass** (UX-01) | the product's tone complaint | L |
| 7 | **Prisma migrations** (DB-03) | needed before the next schema change | S |
| 8 | **Desktop auto-update** (DSK-01) | otherwise every desktop user is stuck on 0.5.0 | M |
| 9 | **iOS offline cache + privacy manifest** (IOS-03, §6.3) | App Store submission prerequisites | M |
| 10 | **Onboarding tour** | first-10-minutes problem for new operators | M |

## Explicitly out of scope for this audit

* Payment gateway integration (Razorpay/UPI Autopay) — product decision, `docs/MONETIZATION.md`.
* App Store / Play Store submissions — need accounts and Apple/Google tooling.
* Loading third-party "nxsha" catalog in production — legal risk already flagged in
  `docs/MEDIA_HUB.md`; the flag stays off.
* Any change to pricing, plan semantics or the access model.

## Guardrails used during fixing

1. No feature removed; no route renamed or deleted.
2. No schema column dropped or renamed; the only schema change is additive indexes.
3. Every fix carries a regression test where it is pure logic, or a build/lint proof otherwise.
4. Changes stay on `arena/3cf21e50-iptv-app`; `main` is untouched until review.
