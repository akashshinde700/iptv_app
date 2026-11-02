# 2. Complete Application Flow

Every flow below was traced in code. Where a flow is broken or incomplete it is marked.
Issue IDs refer to [`BUGS_AND_ISSUES.md`](./BUGS_AND_ISSUES.md).

---

## 2.1 Roles and what they can reach

| Role | Entry point | Auth | Sees |
|---|---|---|---|
| Guest | `/` | none | home showcase (`isDemo` channels), plans, signup |
| Customer | `/` → Profile login | `sk_customer_session` cookie (7 d, httpOnly) | channels allowed by their plan |
| Org admin (OWNER/ADMIN) | `/` → Settings → Operators → admin | `sk_admin_session` cookie | own organization only |
| Platform staff | `/platform` | same admin cookie + `isPlatformStaff` | all organizations |

There is **no** separate staff/employee role, no email/OTP verification, no forgot-password,
and no account-deletion self-service. Those are gaps, not bugs (listed as UX-10, UX-11).

## 2.2 Operator signup → first sale (the money flow)

```
/signup  --POST /api/signup-->  Organization(status=TRIAL, trial 14 d) + Admin(OWNER)
         <-- { storefrontUrl, adminUrl: https://<slug>.<base>/admin, trialEndsAt }
   |
   |  !! BROKEN: `/admin` is not a route (BUG-01) — the success screen links to a 404
   v
<slug>.<base>/  ->  Settings -> Operators -> admin login (/api/admin/auth/login)
   |
   v
My sources  --POST /api/admin/portals-->  portal row  --POST /api/admin/portals/:id/sync-->
                                                          m3u | xtream | stalker importer
                                                          -> Channel + Stream rows
   |
   v
Auto-fix  --POST /api/admin/health/sweep--> probe every stream; dead ones auto-disabled,
                                            channels with no live source auto-hidden
   |
   v
Plans  --POST /api/admin/plans-->  price, duration, regions/countries/languages/categories,
                                   planChannels (grant-only), allowAdult, maxDevices
   |
   v
Customers  --POST /api/admin/customers { planId }-->  Customer + Subscription
                                                      + access mirror recomputed
   |
   v
Customer logs in  --POST /api/auth/customer/login-->  status/expiry enforced server-side,
                                                     device cap enforced (maxDevices)
   |
   v
Watches  --GET /api/channels--> (plan-scoped)  --GET /api/channels/:id--> signed proxies
```

**Renewal / plan change**: `POST …/subscriptions` (`replaceCurrent` cancels the running one) or
`…/subscriptions/:id` with `renew | extend | suspend | resume | cancel`. Every path goes
through `syncCustomerAccess()`, so the mirror cannot drift *within* a request.

**Money**: payments are recorded manually (`Payment` rows); `paymentStatusFor()` derives
PAID / PARTIALLY_PAID / PENDING / REFUNDED, and a PENDING subscription auto-activates once fully
paid and still in date. No gateway — by design (`docs/MONETIZATION.md`).

## 2.3 Customer session lifecycle

```
login --> rateLimit(10/min per IP+org) --> findFirst(org-scoped, username OR email)
      --> verifyPassword (scrypt, timing-safe)
      --> status normalisation: ACTIVE + expired -> EXPIRED (persisted)
      --> enforceDeviceLimit(maxDevices)   (evicts oldest sessions, returns count)
      --> AdminSession/CustomerSession row stores only sha256(token)
      --> Set-Cookie httpOnly, SameSite=Lax, Secure in prod
logout --> deleteMany(token fingerprint) + clear cookie + audit
```

Password reset by an admin → `destroyAllCustomerSessions()`; account suspend/archive → same.

## 2.4 Playback + auto-healing (the differentiator)

```
WatchView -> /api/channels/:id -> best stream (health-ranked) -> Player
   Player error / 22 s stall watchdog / manual retry
        -> onSourceError -> next stream in ranked list (same channel, then other portals)
        -> POST /api/streams/report {ok:false}
              failureCount++ ; at 5 the stream is DISABLED
              scheduleChannelRecheck() -> refreshChannelHealth() -> channel DEAD -> autoHiddenAt
              -> customer catalog stops listing it (servableChannelClause)
        -> POST /api/streams/report {ok:true} resets the streak and un-hides the channel
```

Gap: a stream disabled **by the operator** is also resurrected by an `ok:true` report
(BUG-07) — the operator's intent does not stick.

## 2.5 Movies & TV hub

```
MediaHubView -> /api/media/home (fails 403 for guests -> upsell)
             -> /api/media/title/:id -> seasons/episodes -> sources -> /api/proxy
Gate: mediaGate() = customer cookie + active plan
```

Gap: `MEDIA_FIXTURES=1` bypasses the gate entirely and is not blocked in production
(SEC-04).

## 2.6 Platform console

```
/platform -> PlatformApp (own login form) -> /api/platform/stats (401/403 -> login screen)
   Orgs · Plans (+ PlanBuilder) · Customers (+ access preview) · Subscriptions · Payments
   Content sources · Channel health · Audit
```

All platform routes are cross-tenant by design and require `isPlatformStaff`.

## 2.7 Native shells

```
Android (Capacitor) : MainActivity -> WebView -> STREAMKARO_URL
                      native plugins: NativePlayer (Media3), AppUpdater (APK), Shell (exit/back)
iOS (xtool/SwiftUI) : RootView -> WKWebView -> StreamKaroBaseURL
                      bridge: window.StreamKaroNative (share, haptic, keepAwake, openSettings)
                      deep links: streamkaro://watch/<id>, universal links (opt-in)
Desktop (Electron)  : main.js -> BrowserWindow -> APP_URL; back/F11; external links -> browser
```

All three detect as `isNativeShell` in `src/lib/platform.ts`, so the web app drops install
nags and uses the in-app "Exit?" prompt.

## 2.8 Flow defects found

| Area | Defect | ID |
|---|---|---|
| Signup | success screen + API return `https://<slug>.<base>/admin`, a 404 | BUG-01 |
| Deep links | no `/watch/*`, `/movies/*`, `/series/*`, `/live/*` routes; AASA and `streamkaro://` map to them | BUG-02 |
| Downloads | `/downloads/*.apk`, `*.exe` are not shipped -> dead buttons; updater offers a 404 | BUG-03 |
| Admin session | expiry mid-session shows toast loops instead of the login screen | SEC-08 |
| Password | an admin cannot change their own password (UI says "next version") | SEC-02 |
| Playback report | operator-disabled source comes back on a success report | BUG-07 |
| Playlist export | absolute URLs built from `request.url` -> wrong host behind a proxy | BUG-06 |
| Errors | no `not-found.tsx` / `error.tsx` -> Next's light default page in a dark app | UX-04 |
