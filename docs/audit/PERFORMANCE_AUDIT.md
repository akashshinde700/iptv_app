# StreamKaro — Performance Audit (report #9)

**Status:** Phase 1 deliverable · updated 2026-11-02
**Method:** source analysis only. There is no reachable staging database or load generator in this
environment (Prisma engine download is blocked, see `TESTING_AUDIT.md`), so **no timing numbers
below are measured** — they are complexity statements and, where stated, "unverified".

> Rule followed throughout: a claim that something is "fast" or "fixed" requires a measurement. Where
> there is none, the entry says so and is marked *unverified*.

---

## 1. Request path (what happens per page view)

```
Browser ──▶ Next.js App Router (RSC shell) ──▶ route handler ──▶ lib/server/* ──▶ Prisma ──▶ MySQL
                                                   │
                                                   └──▶ in-memory caches (module scope)
```

* The storefront shell (`AppShell`) is a client component; the first paint is a small RSC page plus
  the JS bundle. Data arrives from `/api/*` through TanStack Query.
* `AppShell` rehydrates the persisted store, then (since BUG-02) reads the URL and boots on the
  requested screen — one extra synchronous pass before first render, no network cost.
* TanStack Query defaults are used; there is no global `staleTime`, so route-level queries refetch on
  mount/focus. Fine for admin screens, noticeable for the channel grid when switching tabs.

## 2. Database

### 2.1 Query shapes

| Query | Where | Shape | Risk |
|---|---|---|---|
| Channel list | `/api/channels` | `where(org, active, filters)` + `orderBy` + `skip/take`, then `groupBy(identityKey)` for dedupe | the `groupBy` runs over the **whole filtered set**, not the page → cost grows with catalogue size |
| Channel detail | `/api/channels/[id]` | two queries + in-memory merge of streams by `identityKey` | fine (bounded) |
| Facet counts | `/api/meta` | `findMany({select: slim})` over **every channel of the org**, then counted in Node | **BUG-08** — the heaviest read in the app; mitigated only by a 10-minute in-memory cache per process |
| Movies list | `/api/movies` | page + `groupBy` dedupe | same shape as channels |
| Admin lists | `admin/*` | filtered `findMany` + `count` | fine, now better indexed |
| Customer search | `admin/customers?search=` | `contains` → `LIKE '%x%'` | cannot use an index (BUG-13); acceptable up to ~10⁴ rows/org |
| Audit log | `admin/audit-logs` | `orderBy createdAt desc` + page | ✅ now covered by `(organizationId, createdAt)` |
| Health sweep | `cron/health` | `findMany` oldest-`lastProbeAt` first, `take: batch` | ✅ now covered by `(status, lastProbeAt)` |

### 2.2 Indexes

The schema previously had only single-column indexes, which MySQL cannot combine for the list
queries. Phase 2 adds the composites below (DB-01). They are declared in `prisma/schema.prisma` and
mirrored in the reviewable, rollback-annotated SQL file
`prisma/sql/2026-11-02-stream-disabled-by-and-indexes.sql`.

| Table | Index | Serves |
|---|---|---|
| `Channel` | `(organizationId, isActive, name)` | catalog list, default sort |
| `Channel` | `(organizationId, healthStatus)` | health filters / dashboard tiles |
| `Customer` | `(organizationId, status)`, `(organizationId, accountStatus)`, `(organizationId, createdAt)` | customer list + counters |
| `Subscription` | `(customerId, status)`, `(status, endsAt)` | access checks, expiry sweep |
| `Stream` | `(channelId, status)`, `(status, lastProbeAt)` | failover pick, health sweep order |
| `AuditLog` | `(organizationId, createdAt)` | audit page |

**Not verified:** no MySQL instance is reachable here, so `EXPLAIN` plans were not captured and the
migration was not applied. Treat index effectiveness as *expected* until a staging run confirms it.

### 2.3 N+1 / hot loops

* `reconcileCustomerAccess()` (new, cron) is deliberately bounded: up to 200 candidates, one
  `findUnique + update` per candidate. At scale this should become a single `UPDATE … WHERE` for the
  common case; the current shape was chosen because each row's mirror is computed from its
  subscription set.
* Health sweep uses a worker pool (`concurrency`, default small) with a wall-clock budget, so one
  cron invocation can never run away.
* `sync/engine.ts` upserts channels in application loops; a very large M3U import is minutes of work.
  It is bounded by the 40 MB upload cap and a preview step, but it is *not* a bulk SQL path.

## 3. Media path

* Video never passes through the app for playback decisions, but **segments do**: `/api/proxy` is a
  streaming relay (no buffering of the whole body) with a 20 s upstream timeout.
* The proxy is the hottest route. Costs per request: HMAC verify (cheap), SSRF check (cached DNS
  lookup, 60 s TTL, 500-entry cap — added for SEC-03), one upstream fetch, header copy.
* HLS manifests are rewritten line-by-line; manifests are small (KBs) so this is fine, but every
  segment request repeats the proxy work. Caching is intentionally absent (`no-store`) because
  stream URLs are signed and short-lived.
* Failover avoids re-probing the whole channel: a failed stream is disabled after
  `FAILURE_THRESHOLD = 5` consecutive failures, and `scheduleChannelRecheck` debounces rechecks to one
  per channel per minute.

## 4. Client / bundle

| Item | Observation |
|---|---|
| Bundle | 107 `.tsx` + 148 `.ts`; the TV components (`src/components/tv/*`, 33 files) are the bulk. `Player.tsx` alone is ~1100 LOC and imports `hls.js` (already lazy via dynamic import) |
| Radix/shadcn | tree-shaken per import; `src/components/ui/*` is vendored, so the cost is only what is used |
| Fonts/images | posters are remote URLs with `next/image` avoided in the player; channel logos are plain `<img>` (no layout shift guards) |
| Store | persisted slice is small (7 keys); the new version+typed merge runs once per load |
| Re-renders | `useAppStore` selectors are per-field, so a view change does not re-render the player. Known smell: several views subscribe to whole objects |
| TV performance | remote-first focus via `use-spatial-nav` is DOM-based (no virtualization). Grids render one page (24–60 items), which is the right call for a 10-foot UI |

**Unverified:** no Lighthouse/Core Web Vitals run was possible (no browser in this environment), so
"LCP is fine" would be a guess and is not claimed.

## 5. Caching

| Cache | Scope | TTL | Correctness note |
|---|---|---|---|
| `/api/meta` facets | per process | 10 min | stale after a sync for up to 10 min; acceptable because facets are counts |
| DNS answers (SSRF) | per process | 60 s | bounded to 500 hosts, then cleared |
| Health recheck debounce | per process | 60 s/channel | prevents probe storms |
| HTTP responses | `no-store` on proxy/playlist | — | signed URLs must not be shared |
| `app/version` | public CDN | 300 s | OK for an update check |
| `app/downloads` | public CDN | 60 s + SWR | now reflects an upload within a minute |

In-memory caches are **per process**. On a multi-instance deployment each instance has its own, so
counts can differ by up to the TTL between nodes. Not a correctness bug, but do not build billing
numbers on them.

## 6. Known performance issues (open)

| ID | Issue | Impact | Proposed fix |
|---|---|---|---|
| BUG-08 | `/api/meta` loads the entire org catalogue into Node to compute facets | memory + CPU per instance per 10 min; the dominant scaling limit for large catalogues | precomputed facet table refreshed by the sync/cron, or SQL `GROUP BY` with `JSON_TABLE`/pipe-splitting |
| BUG-13 | customer search is `LIKE '%x%'` | full scan per keystroke-ish query | prefix search + `FULLTEXT(org, name, username, email)` |
| SEC-07 | rate limiter is in-process | a burst across N instances gets N× the budget | Redis/shared counter (or a gateway limiter) |
| — | channel/movie dedupe uses `groupBy` over the filtered set | page cost grows with catalogue | store a `representative` flag on sync and filter on it |
| — | no global `staleTime` | extra refetches on tab switch | set `staleTime: 30_000` for public lists |
| — | posters without dimensions | layout shift on slow networks | fixed aspect-ratio wrappers (partially present) |

## 7. What was improved in Phase 2

1. **Composite indexes** for the four hottest list paths and the sweep (DB-01) — *unverified on a live DB*.
2. **DNS result caching** in the SSRF guard keeps the added safety check off the hot path (SEC-03).
3. **Bounded cron work**: reconciliation is capped at 200 customers per run; the sweep already had a
   time budget, so a slow provider cannot make cron run past `maxDuration`.
4. **Bounded bulk actions** (500 ids) keep one request from generating an enormous `IN (…)` (BUG-12).
5. **No more guaranteed-failing proxy requests** from the player's fallback path, which used to cost a
   round-trip + 403 per source (BUG-10).

## 8. Recommended measurement plan (needs staging)

1. Seed ≥100k channels / 5k customers in staging.
2. `EXPLAIN` each query in §2.1 before/after the index migration; record `rows` and `Using index`.
3. Time `/api/channels`, `/api/movies`, `/api/meta` at p50/p95 with `autocannon -c 50 -d 30`.
4. Run the proxy with a real HLS source and measure segment latency overhead vs. direct playback.
5. Lighthouse (mobile, throttled) on `/`, `/live`, `/watch/<id>`, `/movies`; record LCP/CLS/INP.
6. Re-run the health sweep against a real portal and confirm it stays inside its budget.
