# StreamKaro — Independent Verification Pass (2026-11-02)

**Why this file exists:** after the audit + fix batches were merged, the question was "is anything
still missing or broken?". This is a fresh, from-scratch verification against the merged `main`, not
a re-read of the earlier reports. Every line below was produced by running the check in this
environment; nothing is copied from the previous audit.

**Environment limits (unchanged):** no MySQL, no `prisma generate` (engine CDN blocked), no Android
SDK, no Swift/Xcode, no Electron runtime, no browser. Anything needing those is labelled
**unverifiable here** instead of "passing".

---

## 1. What was re-run and what it says

| Check | Command | Result |
|---|---|---|
| Unit suite | `npx vitest run` | **173 passed / 16 files** ✅ |
| Lint | `npx eslint src --ext .ts,.tsx` | **0 problems** ✅ (was 4) |
| Type check (filtered) | `npx tsc --noEmit` | only Prisma-stub noise — see §3 |
| Schema sanity | parse `prisma/schema.prisma` | 17 models, braces balanced, 28 relations, 65 indexes, 9 unique, `disabledBy` present ✅ |
| `prisma validate` | `npx prisma validate` | **cannot run** — engine download blocked (environment, not the schema) |
| Android XML | parse manifest + `network_security_config.xml` | both well-formed; manifest declares the config; `usesCleartextTraffic` gone; `allowBackup=false` ✅ |
| iOS plist | parse `ios/Support/Info.plist` | well-formed ✅ |
| PWA manifest | resolve every icon path | all 4 exist, real PNGs at the declared sizes ✅ |
| Docs links | every `](./X.md)` in `docs/audit` | **0 broken links** across 17 files ✅ |
| Guard matrix | every `admin/*` + `platform/*` route | all guarded; only `auth/login` + `auth/password` are guard-free **by design** (they authenticate themselves) ✅ |
| Secrets scan | regex over `src`/`scripts` | no hardcoded credentials ✅ |
| Debug leftovers | `TODO/FIXME/HACK`, `console.log` | **0** real hits (2 false positives are the `xxx` adult-category label) ✅ |
| XSS sinks | `dangerouslySetInnerHTML` | 1, in an unused vendored file — removed (§4) |
| Production build | `npx next build` | **blocked in two stages** → fixed the first, proved the second is environmental (§2) |

---

## 2. The build: two real findings

### 2.1 FIXED — the production build failed on a font download

```
Error: next/font: error: Failed to fetch Geist from Google Fonts.
  Import trace: ./src/app/layout.tsx
```

`layout.tsx` used `next/font/google`, which downloads the font **during the build**. Any offline
build, air-gapped CI runner or firewall that blocks `fonts.googleapis.com` produced no artifact at
all — so this was a deploy-time landmine, not a cosmetic issue.

Fixed by switching to the self-hosted `geist` package (same typeface, same `--font-geist-sans` /
`--font-geist-mono` variables, same metrics, no network at build time).

**Evidence:** after the change the build reached `✓ Compiled successfully in 1232ms` — it now fails
later, on the Prisma client (§2.2), which is environmental.

### 2.2 FIXED IN CI — the build also failed on 5 real type errors (and one lint failure)

The new CI workflow generated the Prisma client on a machine that can download the engines, and its
**first run reported what the sandbox never could**:

```
src/lib/server/media/catalog.ts:101  Type '{ genre; organizationId; isActive; isNsfw; … }' is not assignable to 'SeriesWhereInput'
src/lib/server/media/catalog.ts:40-42 Type 'string | StringFilter<"Movie">' is not assignable to 'string & …'
src/app/api/cron/health/route.ts:51  Argument of type '{…}' is not assignable to parameter of type 'never'
```

Three real defects behind five errors:

1. **`liveSource()` returned `{…} & Prisma.MovieWhereInput`.** The intersection types each literal as
   *both* a value and a filter (`true & BoolFilter<"Movie">`), which Prisma's own types reject. It now
   returns the plain `MovieWhereInput`.
2. **A Movie `where` clause was handed to `db.series.findMany`** (the genre rail). It "worked" only
   because the columns overlap — the `as Prisma.SeriesWhereInput` casts elsewhere had been hiding it.
   Series now has its own `liveSeriesSource()`, and every series query builds a typed where.
3. **`const results = []` in the cron route inferred `never[]`**, so `push()` did not type check.

Then `npm run lint` failed on `desktop/main.js` — a separate CommonJS Electron project — because
`eslint .` applies the Next.js web config, which forbids `require()`. `desktop/**` now gets CommonJS
globals with the rest of the rules intact.

**Why this was the most important finding of the pass:** `next.config.ts` deliberately has
`typescript.ignoreBuildErrors` **off**, so those five errors meant **a production build could not
complete at all**. The deployed app could only have been built from a tree where the Prisma types
were absent — i.e. nobody had run a real build.

### 2.2b ENVIRONMENTAL — `@prisma/client` is not generated in this sandbox

```
Error: Failed to collect configuration for /api/admin/audit-logs
  [cause]: Error: @prisma/client did not initialize yet. Please run "prisma generate"
```

`prisma generate` (and `prisma validate`) both fail here with
`request to https://binaries.prisma.sh/... failed`. The generated client is gitignored, so a clean
install has no models — which is also the source of the ~110 `tsc` errors in §3 (the stub client has
none of our models, so every `Prisma.ChannelWhereInput`, `db.channel.*` etc. is "missing").

**Conclusion:** `next build` cannot complete in *this* sandbox for reasons that have nothing to do
with the code — and that is exactly why it was proven in CI instead (§5).

---

## 3. Type-check noise: why it is not a code defect

`npx tsc --noEmit` reports errors in 30 files, and every one of them is a property/namespace that the
real Prisma client generates:

| Pattern | Example |
|---|---|
| `Namespace '...Prisma' has no exported member 'XWhereInput'` | `meta/route.ts`, `plans.ts` |
| `Property 'x' does not exist on type '{ logo: … }'` | `sync/engine.ts`, `failover.ts` |
| `Module '@prisma/client' has no exported member 'Organization'` | `tenant.ts` |

Root cause: the installed `@prisma/client` is the ungenerated stub (`Prisma.ModelName.Channel ===
false`). Proof that this is environmental: `prisma/engines` is empty and `prisma generate` fails on
DNS/TLS, not on the schema. CI (`prisma generate` → `tsc`) is the resolution.

**Filter used for the honest count:**
`npx tsc --noEmit | grep -vE "has no exported member|\.prisma/client"` — this leaves nothing in the
files touched by the audit.

---

## 4. New fixes in this pass

| # | Finding | Severity | Fix |
|---|---|---|---|
| 1 | Production build failed: `next/font/google` needs network at build time | **High** (blocks deploys) | `geist` self-hosted package in `layout.tsx` |
| 2 | `npm run lint` failed with 4 `react-hooks/set-state-in-effect` errors (extra render pass on mount / per keystroke) | Medium | `useIsMobile` and the DownloadView UA/PWA detection now use `useSyncExternalStore`; the signup debounce owns its state changes inside the timer |
| 3 | Dead vendored code: `ui/chart.tsx` held the only `dangerouslySetInnerHTML` sink, `ui/carousel.tsx` produced a lint error; neither is imported anywhere | Low | both removed (recoverable from git history / shadcn) |
| 4 | `.env.example` documented 6 variables; the code reads 25 — including `ADMIN_PASSWORD`, `PUBLIC_BASE_URL`, `ROOT_ORG_SLUG` and `STOREFRONT_BASE_DOMAIN`, i.e. the ones a fresh deploy silently gets wrong | Medium | every variable the code reads is now documented with its failure mode |
| 5 | **No CI** — nothing ran type check / lint / tests before a merge | High | `.github/workflows/ci.yml`: install → `prisma generate` → `db push` on a throwaway MySQL → typecheck → lint → tests → build |
| 6 | **Production build was impossible:** 5 real `tsc` errors (hidden locally by the ungenerated client) + `npm run lint` failing on `desktop/main.js` | **Critical** (blocks release) | typed `liveSource`/`liveSeriesSource` split, no Movie filter on Series, typed cron results, CommonJS override for `desktop/` |

---

## 5. CI: green, and what it proves

Run [`41385654349`](https://github.com/akashshinde700/iptv_app/actions/runs/41385654349) on
`0874d47` — **every step passed**:

| Step | Result |
|---|---|
| Install (`npm ci --legacy-peer-deps`) | ✅ |
| `prisma generate` | ✅ |
| `prisma db push` → disposable MySQL 8 | ✅ |
| **`npm run typecheck`** | ✅ *(after the 5 fixes in §2.2)* |
| **`npm run lint`** | ✅ *(after the `desktop/` config fix)* |
| **`npm test`** | ✅ 173 tests |
| **`npx next build`** | ✅ **first proven production build of this project** |

So three claims that had been marked "unverifiable here" are now facts: the Prisma schema is valid,
the tree type-checks against the real generated client, and the app **builds for production** with
`typescript.ignoreBuildErrors` off. What CI still does not cover: runtime behaviour (no browser, no
device, no seeded data), i.e. §6 stays as it is.

---

## 6. Still open, with the honest reason

| Item | Sev | Why it is not fixed here |
|---|---|---|
| iOS `PrivacyInfo.xcprivacy` missing | High for App Store | Needs to be bundled as a SwiftPM resource; wiring it blind (no `xtool`/Swift toolchain to verify) risks breaking the iOS build. Steps are written in `IOS_APPLICATION_AUDIT.md` |
| iOS app icon is 512 px | Low | Cannot upscale; needs a real 1024×1024 asset |
| `xcodebuild`/Gradle/Electron runtime never exercised | High (process) | No toolchains or devices in this environment |
| `/api/meta` computes facets over the whole catalogue (BUG-08) | Med | A correct rewrite needs a live DB to verify counts |
| In-process rate limiter (SEC-07) | Med | Needs shared state (Redis/gateway) |
| No DB integration tests | High (process) | No reachable MySQL |
| Copy tone mixed Hinglish/English (UX-01) | Med | Product decision, not a code fix |
| `scripts/iptv/*.json` ≈ 28 MB of seed data in git | Low | Deliberate (offline seeding); move to external storage if the repo size matters |

---

## 7. Verdict

* **Code-level:** consistent — 173 tests green, lint clean, no dead secrets, no debug leftovers, the
  schema parses, the platform XML is valid, the PWA assets resolve.
* **The headline finding:** the project **could not be built for production**. Not because of one
  typo, but because `next build` type-checks and five genuine type errors were invisible in every
  environment that lacked a generated Prisma client. They are fixed, and CI now proves the build.
* **Three defects found and fixed in this pass:** the build-blocking font fetch, the five type errors
  plus the lint config that made `npm run lint` fail, and a quality set (cascading renders, the sole
  HTML-injection sink, undocumented env vars).
* **Still unproven:** runtime behaviour — no browser, no device, no seeded database here. CI covers
  compile/type/lint/unit; it does not cover "does the player play".

---

## 6. Follow-up pass (same day): fresh security review + dependency cleanup

Typecheck, lint, 174 unit tests and `next build` all pass locally (real generated Prisma client).

| # | Finding | Severity | Fix |
|---|---|---|---|
| 1 | SSRF guard bypass: `new URL()` normalises `[::ffff:169.254.169.254]` to `[::ffff:a9fe:a9fe]`, which the dotted-only mapped-address check accepted → the signed proxy could fetch cloud metadata | **Critical** | `isPrivateAddress` now fully expands IPv6 and decodes embedded IPv4 (mapped, compatible, NAT64, 6to4); Teredo/doc/site-local blocked; regression tests added |
| 2 | Tenant portal / EPG URLs never SSRF-validated; sync (M3U/Xtream/Stalker), EPG, source tests and probes used raw `fetch` with `redirect: 'follow'` | High | new `guardedFetch` (per-hop DNS + redirect re-check) on every operator-controlled fetch; portal create/update/bulk validate URL + EPG URL; failover's weaker private-host check removed |
| 3 | `/api/channels/[id]` served deactivated, adult or expired-portal *demo* channels to guests | Medium | lookup requires `isActive`, and demo channels must be non-NSFW from a valid portal |
| 4 | Anonymous `ok:false` reports could auto-disable public demo streams | Medium | guest failure reports only schedule a (debounced) server-side re-probe |
| 5 | Suspending an org did not stop existing customer sessions/playlists or admin sessions | Medium | `evaluateAccess` and `getAdmin` deny when the org is `SUSPENDED` (platform staff exempt) |
| 6 | "Restore hidden channel" re-enabled operator-disabled sources (BUG-07 regression) | Low | restore skips `disabledBy: OPERATOR` |
| 7 | `null` / wrongly-typed JSON bodies → 500 | Low | non-object bodies → 400 in every JSON route; `PrismaClientValidationError` → 400 |
| 8 | `/api/my/playlist` used the internal origin | Low | `publicOrigin(request)` |
| 9 | Cron secret compared with `!==`; password change ignored `admin.isActive` | Low | `timingSafeEqual`; `isActive` checked |
| 10 | SEC-13: 18 unused dependencies (incl. `sharp`, `@mdxeditor/editor`, `react-syntax-highlighter`, `next-auth`) carried 13 advisories | Medium | removed (351 packages); `npm audit --omit=dev` 13 → 7 |

**Remaining advisories (accepted):** all 7 are in build-time CLIs — `prisma` → `@prisma/config` →
`deepmerge-ts`, and `@capacitor/cli` → `rimraf` → `glob`/`minimatch`. No request data reaches them;
the fixes require Prisma 7 / a Capacitor CLI downgrade.

**Still open (unchanged, by design or needs product work):** device-limit check-then-create race
(low), plus the OPEN items in `BUGS_AND_ISSUES.md`.
