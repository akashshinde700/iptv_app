# 9. Backend & Database Audit

Method: schema review, every mutation path traced through its transaction, and targeted unit
tests around the pure rules. **No live database was available** (Prisma engines cannot be
downloaded in this sandbox), so nothing here is a measured query plan — index recommendations
follow from the `where` clauses actually used in code.

---

## 9.1 Schema review (17 models)

| Model | Verdict |
|---|---|
| `Organization` | Sound. `slug` unique, `customDomain` unique, status/trial fields present. |
| `Admin` / `AdminSession` | Sound. Sessions store `sha256(token)`; `onDelete: Cascade`. |
| `Customer` / `CustomerSession` | Sound. Mirrors plan state; sessions cascade. |
| `Subscription` / `Payment` | Sound. Money is `Int` INR; `planName` snapshotted so renames don't rewrite history; payments `SetNull` on subscription delete (history survives). |
| `Plan` / `PlanChannel` | Sound. Pipe-delimited rule columns + a grant-only join table. |
| `Channel` / `Stream` | Sound, health columns added recently and used by `servableChannelClause`. |
| `Portal` / `SyncLog` | Sound. `fileData` holds uploaded M3U (40 MB cap). |
| `Movie` / `Series` / `Season` / `Episode` | Sound; `identityKey` dedupes across portals. |
| `AuditLog` | Sound; `admin` is `SetNull` so deleting an admin does not erase history. |
| `CustomerOverride` | Sound; unique per (customer, channel). |

Consistency rules that are **enforced in code, not in the database** (documented, acceptable):
status enums are strings, `planExpiresAt` mirrors the subscription end date, and
`Channel.categories/languages` are pipe-encoded lists.

## 9.2 Transaction & race audit

| Operation | Transaction | Verdict |
|---|---|---|
| Create customer + subscription | `createCustomer` → `createSubscription` (own `$transaction`) | Two steps: a crash between them leaves a customer without a plan. Acceptable (recoverable), noted as DB-02. |
| Plan change (`replaceCurrent`) | one `$transaction` (cancel + create + mirror) | Sound |
| Payment recording | one `$transaction` + `refreshPaymentStatus` | Sound |
| Suspend/activate account | `$transaction` (update + resync mirror) | Sound |
| Signup (org + admin) | nested create (implicit transaction) | Sound, but unique-violation race → SEC-05 |
| Portal sync | batched upserts, not one giant transaction | Correct choice for 10k+ rows; partial syncs are resumable |
| Health probe writes | fire-and-forget `void … .catch()` | Intentional: never blocks a request |
| Device-limit eviction + session create | sequential, not atomic | Worst case: two devices race and you get maxDevices+1 briefly. Low. |

No **double-write** or lost-update bug was found in the money paths: every amount change is
derived from stored values inside the same transaction, never from a client payload.

## 9.3 Indexes — used clauses vs existing indexes

| Query (hot) | Where clause | Existing | Recommendation |
|---|---|---|---|
| Customer catalog | `organizationId, isActive, …` + plan clauses | `@@index([organizationId])` | add `[organizationId, isActive]` (**DB-01, fixed**) |
| Channel list sort | `orderBy name` | none | add `[organizationId, isActive, name]` (fixed with the same migration) |
| Admin customers list | `organizationId` + `orderBy createdAt` | `[organizationId]` | add `[organizationId, createdAt]` (fixed) |
| Subscriptions list | `organizationId` + `orderBy endsAt` | `[organizationId]`, `[endsAt]` | composite `[organizationId, endsAt]` (fixed) |
| Stream probes | `channelId, status` | `[channelId]` | fine |
| Portal validity | `portal.status/expiresAt` via relation | `[status]` | fine |
| Customer search | `LIKE '%term%'` on name/username/email | `[organizationId]` | needs full-text or a search column (**BUG-13, OPEN**) |

All added indexes are **additive** and safe to apply with `prisma db push`; they do not change
behaviour. `docs/audit/../MIGRATION_NOTES` in the roadmap describes the order.

## 9.4 Data-integrity risks

| ID | Risk | Mitigation today | Recommendation |
|---|---|---|---|
| DB-02 | `Customer.status` mirror drifts if a write bypasses `billing.ts` | all writes go through `billing.ts`; `backfillSubscriptions()` repairs legacy rows | nightly reconcile job + `POST /api/cron/reconcile` |
| BUG-14 | Plan expiry has no scheduler; a customer stays `ACTIVE` until something reads them | every read path re-derives (`evaluateAccess`, login) | cron that flips expired subscriptions at 00:05 IST |
| DB-03 | No migrations directory | `prisma db push` with manual review | adopt `prisma migrate` before the next schema change |
| — | `Portal.fileData` can hold 40 MB per upload with no retention policy | capped at upload | add a cleanup job for `SYNC_ERROR` portals older than 90 days |
| — | `AuditLog` grows unbounded | none | 12-month retention with a monthly rollup |

## 9.5 API contract consistency

* Error shape is uniform `{ error: string }` (+ `accessDenied`/`reason` on 403). Verified across
  every route. Good — clients can rely on it.
* Pagination shape is uniform `{ items, total, page, pageSize, totalPages }` on list routes.
* Places where a route returns a bare object instead of the paged envelope: `channels/by-ids`,
  `my/channels`, `featured` — intentional.
* **Frontend/backend validation mismatch:** none found on required fields; the server is always
  stricter or equal. The only divergence is copy (see UX-01).

## 9.6 Performance hot spots

| Item | Cost | Status |
|---|---|---|
| `/api/meta` facets | loads all channels, 10 min cache | BUG-08 |
| `computeAccessSummary` | loads all channels, **no cache** | BUG-08 |
| `/api/channels` | paginated, one count + one page query | OK |
| Portal sync | chunked upserts, 300 s maxDuration | OK |
| Health sweep | 8 concurrent probes, 25 s budget, resumable | OK |
| Playlist build | up to 5000 channels, one query | OK (cap documented) |
| Proxy | streams the body, no buffering; 30 s upstream timeout | OK |

## 9.7 Migration / rollback plan for this audit

1. `prisma/schema.prisma` gains **composite indexes only** — no column changes, no data rewrite.
   `bun run db:push` applies them online (MySQL builds indexes in place; on a very large
   `Channel` table use `ALGORITHM=INPLACE` or a maintenance window).
2. Rollback = drop the indexes by name (`prisma db push` after reverting the schema).
3. No destructive statement exists in this change set. Verified by diff.
