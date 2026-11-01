# Platform Console — customers, subscriptions, plans & payments

`/platform` (platform staff only — `Admin.isPlatformStaff`). Every screen and filter has a
URL (`#/customers/<id>?tab=subscription`), so refresh, browser Back and shared links work.

```
Platform Admin
└── Organization            (/platform#/organizations/<id>: overview · customers · subscriptions · plans · activity)
    └── Customer            (/platform#/customers/<id>: overview · subscription · payments · devices · channel access · activity)
        └── Subscription    (history — renewals and plan changes add rows)
            └── Payment     (manually recorded; no gateway yet)
                └── Channel access  (server-side access engine, lib/server/access.ts)
```

## Data model (additive — nothing existing was removed)

| Model | Purpose |
|---|---|
| `Subscription` | customer, plan (+ name snapshot), `startsAt` / `endsAt`, price / discount / amount, `status` (ACTIVE · PENDING · SUSPENDED · CANCELLED — **EXPIRED is derived** from `endsAt`), `paymentStatus` (NOT_RECORDED · PENDING · PARTIALLY_PAID · PAID · FAILED · REFUNDED), who created it |
| `Payment` | amount, method (cash · UPI · card · bank transfer · other), reference, status (PAID · PENDING · FAILED · REFUNDED · CANCELLED), who recorded it |
| `Customer.accountStatus` | what an admin set on the account: ACTIVE · SUSPENDED · ARCHIVED |

`Customer.status / planId / planStartedAt / planExpiresAt` are kept as the **access mirror**:
customer login and the access engine read them exactly as before. They are only written by
`syncCustomerAccess()` in `src/lib/server/billing.ts`, recomputed from the subscription rows +
account status after every change (`accessMirror()` in `billing-rules.ts`, unit-tested):

* any active, not-expired subscription → access until the latest end date (a renewal that starts
  when the current period ends keeps access continuous; an unpaid renewal never cuts off a paid period)
* otherwise the newest non-cancelled subscription explains why not: EXPIRED / SUSPENDED / pending (INACTIVE)
* only cancelled / no subscriptions → "No active subscription" (can log in, no paid channels)
* admin-suspended or archived account always wins (and signs the customer out everywhere)

Customers created before this existed get a subscription row imported automatically the first
time a list or customer page loads (`backfillSubscriptions`, idempotent).

## Rules enforced on the server

* Nothing the browser sends about status, dates, plan or access is trusted — the service
  re-reads the plan (must belong to the customer's organization and be active), clamps
  numbers, derives amounts and states, and recomputes access.
* New subscriptions can't start in the future (no scheduler yet); renewals chain from the
  current end date.
* Pending subscriptions give no access; recording payments that cover the amount activates them.
* Payment status changes are limited: pending → paid / failed / cancelled, failed → pending /
  paid / cancelled, paid → refunded. Refunds don't cancel the subscription.
* Plans with subscribers can't be deleted — deactivate them.
* Deleting a customer requires echoing the username (`?confirm=`); archive is the default.
* Every action writes an audit row (customer, subscription, payment, plan, organization).

## APIs

| Endpoint | |
|---|---|
| `GET/POST /api/platform/customers` | list (search, `state`, `organizationId`, `planId`, pages) / add (optionally with a subscription) |
| `GET/PATCH/DELETE /api/platform/customers/:id` | detail · edit / reset password / `accountStatus` · delete (`?confirm=username`) |
| `POST /api/platform/customers/:id/subscriptions` | create (`replaceCurrent: true` = upgrade / downgrade) |
| `GET /api/platform/customers/:id/access` | channel access summary |
| `GET/DELETE /api/platform/customers/:id/sessions`, `DELETE …/sessions/:sessionId` | devices, revoke all / one |
| `GET /api/platform/subscriptions` | list (`state`: ACTIVE · EXPIRING · EXPIRED · PENDING · PAYMENT_PENDING · SUSPENDED · CANCELLED, end-date range) |
| `PATCH /api/platform/subscriptions/:id` | `action`: renew · extend · suspend · resume · cancel |
| `POST /api/platform/subscriptions/:id/payments` | record payment |
| `GET /api/platform/payments`, `PATCH /api/platform/payments/:id` | list (+ paid total) · change status |
| `GET/POST /api/platform/plans`, `PATCH/DELETE /api/platform/plans/:id` | plans of any organization |
| `GET /api/platform/stats` | dashboard: subscribers active / expiring 7 & 3 days / expired / suspended / pending / none, payments pending, revenue |
| `GET /api/platform/audit-logs` | `organizationId`, `entityIds`, `action` prefix |

The operator admin panel (`/admin`, one organization) uses the same service for its plan
actions (assign / renew / extend / deactivate / activate), so its changes appear in the history too.

## Not built yet

* Payment gateway (Razorpay) + webhooks — payments are recorded by staff.
* Auto-renewal and reminder emails / notifications (the `autoRenew` flag is stored only).
* Scheduled (future-dated) subscriptions.
* Device blocking by hardware ID — sessions can be revoked, devices have no stable identity.
* Reports beyond the dashboard (CSV export, revenue by plan / month).
* Channels & portals stay in each operator's `/admin` panel.
