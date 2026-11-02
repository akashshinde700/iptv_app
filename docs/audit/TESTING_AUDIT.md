# StreamKaro — Testing Audit (report #10)

**Status:** Phase 1 deliverable + Phase 2 verification log · updated 2026-11-02
**Baseline at audit start:** 121 unit tests / 11 files, all passing.

---

## 1. What test infrastructure exists

| Layer | Tool | Location | Runs in CI? |
|---|---|---|---|
| Unit / logic | Vitest 4 (`environment: node`) | `tests/unit/*.test.ts`, `tests/setup.ts` | no CI config in the repo |
| Type checking | `tsc --noEmit` | — | no |
| Lint | ESLint (flat config, Next + react-hooks rules) | — | no |
| End-to-end (browser) | shell scripts driving a real browser (`scripts/e2e-*.sh`) | `scripts/` | manual, needs a running server |
| Bulk import driver | `scripts/bulk-import-run.py` | `scripts/` | manual |
| Mobile / desktop | none | — | — |

There is **no CI pipeline**, no coverage gate, and no integration environment. That is the single
biggest testing gap: every check in this audit was run by hand.

## 2. What the unit suite actually covers

`access` (plan gating), `billing-rules` (status machines), `bulk-import` (parser), `crypto`
(password/hash/token helpers), `health-auto` (auto-hide/restore), `ios-shell` (URL handling),
`iptv` (identity keys / servable clauses), `media` (catalog helpers), `native-utils`,
`navigation` (store stack), `proxy-sign` (HMAC).

Not covered before this phase: the SSRF guard, the URL↔screen mapping, password rules, the persisted
store migration, and the auto-vs-operator disable rule — i.e. exactly the code the Phase 2 fixes
touched. Those now have tests (§4).

## 3. What cannot be tested in this environment (and is therefore marked unverified)

| Area | Why | Consequence |
|---|---|---|
| Any database behaviour | `prisma db push` / `generate` fail: the engine binaries cannot be downloaded (`binaries.prisma.sh` blocked) | no integration tests, no `EXPLAIN`, no migration applied. Prisma types in `tsc` are a stub → ~110 pre-existing "has no exported member" errors that are **not** code defects |
| Android build/runtime | no Android SDK, Gradle, emulator or device | manifest/gradle changes are source-reviewed only |
| iOS build/runtime | no Swift toolchain, `xtool`, Xcode or simulator | Swift changes are source-reviewed only |
| Desktop runtime | no display, no packaged Electron build | `node --check` passes; behaviour unverified |
| Real playback | needs live IPTV sources and network ranges | player/failover verified by code reading + unit tests only |
| Web E2E against a real DB | no DB → the app cannot serve catalog data | routing/downloads/admin UI verified by unit tests and code reading |

**Rule applied:** none of the above is reported as "tested". Where a fix depends on one of them, the
issue register marks it `FIXED — unverified` rather than `FIXED`.

## 4. Tests added in Phase 2

| File | Tests | What it pins |
|---|---|---|
| `tests/unit/net-guard.test.ts` | 20 | private-address table (v4/v6/CGNAT/metadata), hostname tricks (decimal, hex, `.local`, `metadata.google.internal`), DNS-based blocking (`169.254.169.254.nip.io`, mixed answers, NXDOMAIN fail-closed), cache behaviour, `safeFetch` per-hop redirect checks and the redirect budget |
| `tests/unit/deep-link.test.ts` | 11 | path → screen for every route, id decoding, `?view=` form, unknown path → 404, `pathForView` round-trip, `/admin/*` handling |
| `tests/unit/password-rules.test.ts` | 8 | admin minimum, common/legacy password rejection, character-class rule, customer minimum |
| `tests/unit/store-persist.test.ts` | 8 | versioned migrate, typed merge, stale `view`/`stack` cannot win, malformed values repaired |
| `tests/unit/stream-revival.test.ts` | 7 | auto vs. operator disable, probe revival rules, threshold disable |

**Suite now: 173 tests / 16 files, all passing** (`npx vitest run`).

## 5. Commands and their current results

```
npx vitest run                 → 173 passed / 16 files
npx tsc --noEmit               → only Prisma-stub errors (pre-existing) + 3 pre-existing
                                 literal-type errors; zero errors in files touched this phase
npx eslint src tests scripts   → 4 errors, all `react-hooks/set-state-in-effect` in code
                                 that predates this phase (signup, DownloadView UA detect,
                                 carousel, use-mobile); zero new findings
node --check desktop/main.js   → OK
```

`tsc` filter used to separate real defects from the Prisma stub:

```
npx tsc --noEmit | grep -vE "has no exported member|\.prisma/client"
```

## 6. Regression risk of the Phase 2 changes

| Change | Risk | Mitigation |
|---|---|---|
| Proxy/probe SSRF guard now resolves DNS | a provider whose DNS is temporarily down is treated as blocked (by design: fail closed) | cached 60 s; health doctor records `blocked-host` as a probe failure, which is visible in the panel |
| `toPlayableUrl` no longer rewrites raw URLs to `/api/proxy` | a legacy raw URL is played directly instead of via the proxy | the proxy path is always pre-signed by the API, so this fallback is unreachable in normal traffic |
| `Stream.disabledBy` new column | the column must exist before the new code runs | apply `prisma/sql/2026-11-02-stream-disabled-by-and-indexes.sql` **before** deploying; every read tolerates `NULL` (treated as `AUTO`) |
| Deep-link catch-all `[...slug]` | a typo'd asset path now hits React instead of a plain 404 | `viewFromPath` returns `null` for non-screens → real 404; `/api`, `/icons`, `/_next` never match the catch-all |
| Admin password change deletes other sessions | an admin using two devices is logged out of the older one | intended; the response says so and the UI toast explains it |
| `MEDIA_FIXTURES` refuses production | a deployment that relied on fixture mode in prod will now 503 | that deployment was serving the sample catalogue to anonymous visitors; the error message says exactly which flag to unset |
| Android `network_security_config` | cleartext to a LAN IP (e.g. a self-hosted `http://192.168.x.x`) now fails | restart the server behind https, or add the host to the config; documented in the file |
| Version bump to 0.5.0 | an installed 0.4.2 client will be offered an update as soon as a 0.5.0 APK exists at the advertised path | the download route reports availability, so the page never links a missing file |

## 7. Test plan to close the gap (ordered)

1. **CI** — GitHub Actions: `npm ci --legacy-peer-deps`, `tsc`, `eslint`, `vitest`, plus a build job.
   Nothing else matters until this exists.
2. **DB integration tests** — a disposable MySQL service container, `prisma db push`, then tests for
   `access.ts`, `billing.ts`, `sync/engine.ts`, `streams/report`, `playlist`, `admin/*` guards
   (including cross-tenant 404/403 cases).
3. **Guard matrix test** — one table-driven test asserting every route's unauthenticated / wrong-role /
   wrong-tenant response, generated from the route list so a new route cannot be forgotten.
4. **Web E2E** — Playwright against a seeded staging DB: login, browse, play (fixture HLS), failover,
   plan renewal, admin CRUD, deep links, 404s, downloads.
5. **Device matrix** — Android phone (API 30 + 34), Android TV, iPhone (two iOS versions), Electron on
   Windows. Until these run, every Android/iOS/desktop item stays `unverified`.
6. **Load** — see `PERFORMANCE_AUDIT.md` §8.

## 8. Honest summary

* Logic-level confidence after this phase: **good** for the modules covered by the 173 unit tests.
* Integration/DB confidence: **none** — no database could be started here.
* Mobile/desktop confidence: **source review only**.
* Production readiness of the whole stack depends on steps 1–5 above, not on the tests written here.
