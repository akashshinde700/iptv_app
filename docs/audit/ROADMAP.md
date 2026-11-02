# StreamKaro — Roadmap (report #11)

**Status:** Phase 1 deliverable · updated 2026-11-02
This is the *product* roadmap. The *fix* order for the audit findings lives in
[`FIXING_ROADMAP.md`](./FIXING_ROADMAP.md); this file says where the product goes once the backlog is
clear.

---

## 0. Principles

1. **One obvious way to watch.** No "server picker", no "change source" button, no settings the viewer
   must understand. A source that does not work disappears; a working one plays.
2. **Plain language first.** Hinglish support copy is fine, but every screen must also be
   understandable in English; no mixed half-sentences (UX-01).
3. **Same account, same channels, every screen** — web, phone, TV, iOS, desktop.
4. **Operators are the customer.** Anything that saves the operator a WhatsApp message is worth more
   than an extra viewing feature.
5. **No feature without a test and a rollback.**

---

## 1. Now → next (blocking quality)

These come from the open issues in `BUGS_AND_ISSUES.md`; they are listed here because they gate
everything else.

| Item | Why it gates | IDs |
|---|---|---|
| CI (lint + type + unit + build) | without it every future change is a coin flip | TESTING §7.1 |
| DB integration tests + a staging database | all tenancy/billing claims are unverified without them | TESTING §7.2–3 |
| Dependency audit + upgrade cadence | SEC-13: unused deps and no `npm audit` gate | SEC-13 |
| Shared rate limiter | SEC-07: per-process limiter is not a limiter on N instances | SEC-07 |
| Admin/customer copy pass | UX-01: mixed tone reads as unfinished | UX-01 |
| Remaining admin empty/error states | UX-02: a failed fetch looks like "no data" | UX-02 |

## 2. Quarter 1 — Self-service that removes support load

| Feature | What it looks like | Why |
|---|---|---|
| **Password reset for customers** | "Forgot password" → email link (single-use token, 30 min) | UX-10 is the #1 recurring operator chore today |
| **Email/OTP verification at signup** | verify the owner's email before the trial starts | stops typo'd/lost accounts, and gives a channel for resets |
| **Customer self-service renewal** | plan page with the operator's UPI + a "I've paid" reference → operator approves in one click | keeps the manual payment model but removes the call |
| **Usage & devices** | "3 devices of 3 in use" with a **Sign out other devices** button | `maxDevices` exists in the schema and is not enforced in the UI today |
| **Notification centre** | in-app notices ("plan ends in 3 days", "new channels added") | cheap retention, no mail dependency |
| **Account deletion request** | one button → request row → operator action, with a clear "your watch history goes with it" | UX-11 / GDPR-style expectation |

## 3. Quarter 2 — Operator leverage

| Feature | Detail |
|---|---|
| **Bulk customer import** (CSV) | operator onboarding is the slowest part of a migration; reuse the bulk-import preview pattern |
| **Plan templates + channel bundles** | "Sports add-on" without re-selecting 400 channels |
| **Revenue dashboard** | collections, renewals due this week, churn by plan (the data is already in `Payment`/`Subscription`) |
| **Genuine auto-update (desktop)** | DSK-01: `electron-updater` + signed builds; currently manual reinstall |
| **Org sub-admins & roles** | today it is OWNER vs STAFF with no per-module permission |
| **Webhook/API for resellers** | read-only catalogue + customer endpoints with scoped keys |

## 4. Quarter 3 — Reach & polish

| Feature | Detail |
|---|---|
| **Roku / Fire TV native shell** | the web TV UI already exists; this is packaging |
| **Chromecast / AirPlay parity** | iOS has AirPlay; web should cast |
| **Cross-device resume** | move `progress` from `localStorage` to a server row keyed by customer+channel |
| **Offline downloads (mobile)** | DRM-free HLS only; needs a storage policy and a real device test matrix |
| **Full i18n** | extract strings, ship `en` + `hi` properly instead of mixed copy |
| **Accessibility pass** | focus visibility (UX-09), keyboard-only pass on admin tables, contrast audit |

## 5. Platform health (continuous)

* **Database migrations**: stop relying on `db push`; adopt `prisma migrate` with a checked-in history
  (DB-03) so every change has an ordered, reversible record.
* **Status reconciliation**: keep the `Customer` mirror honest with the cron reconciler (done), and add
  a weekly drift report (DB-02).
* **Observability**: structured request logs with a request id, error tracking (Sentry or equivalent),
  and a health endpoint that reflects DB + last cron run.
* **Backups**: nightly `mysqldump` + restore rehearsal; a backup that has never been restored is a
  hope, not a backup.
* **Secrets**: rotate `PLAYLIST_SECRET` / `CRON_SECRET` / `ADMIN_PASSWORD` on a schedule; document the
  playlist-token rotation impact (every distributed M3U URL stops working).

## 6. Explicitly out of scope

* Netflix-style recommendations/ML — the catalogue is provider-driven and cold-start is total.
* In-app chat/support tickets — the operator already lives in WhatsApp; a half-built inbox loses.
* Building our own payment gateway integration before the manual flow is instrumented.
* DRM. The product relays provider streams; adding DRM would change the legal posture entirely and
  must be a separate, deliberate decision.

## 7. Success measures

| Metric | Now | Target |
|---|---|---|
| Test suite | 173 unit tests, no CI | CI on every PR, DB integration + Playwright E2E |
| Time to first play (new customer) | operator-created account + WhatsApp password | self-service reset + in-app plan payment |
| Support tickets per 100 customers / month | unmeasured | measured, then halved |
| Crash-free sessions (mobile/desktop) | unmeasured | measured (needs error tracking) |
| p95 catalog API latency | unmeasured | < 300 ms at 100k channels (after BUG-08) |
