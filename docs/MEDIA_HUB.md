# Media Hub — Movies, TV Shows, subtitles & EPG

StreamKaro used to be Live TV only: channels from iptv-org / Xtream portals, no on-demand
and no guide. This adds the missing half of the product — an on-demand **Movies & TV Shows**
hub with seasons/episodes, subtitle and quality pickers, resume playback, and an **XMLTV
guide** for the live side.

Nothing here is a separate app: it's the same player, the same plan gate, the same tenant
scoping and the same opaque `/api/proxy` tokens that Live TV already uses.

---

## 1. What shipped

| Area | Behaviour |
|---|---|
| **Movies & TV hub** | `Movies` in the nav is now a hub: hero carousel, tabs (For you / Movies / TV Shows), poster rails by genre, and instant search. |
| **Title page** | One page for both kinds. Movies → poster, meta, plot, "Play / Resume mm:ss". Series → season picker + episode list with resume badges. |
| **Series pipeline** | New Xtream series import (`get_series`) + **lazy episode cache** (`get_series_info` on first open, refreshed daily). |
| **Subtitles** | `<track>` support in the player with an in-player picker; tracks come from the provider as proxied URLs. |
| **Quality picker** | Already existed for HLS; unchanged, but now reachable from VOD too. |
| **Resume / continue** | Positions stored per title (and per episode) in the Zustand store; "Resume 12:34" + "Start over", finished titles are forgotten. |
| **EPG** | XMLTV parser + `/api/epg` + "On now / Up next" strip on the watch page, matching by tvg-id → display name → normalised name. |
| **Providers** | `catalog` (your Xtream portals — default) and an optional `nxsha` adapter, plus a `fixtures` mode for UI evaluation without a database. |

---

## 2. Architecture

```
src/lib/server/media/
  types.ts      # contracts shared by every provider + id helpers (catalog:movie:<cuid>)
  catalog.ts    # DEFAULT: our own Movies/Series tables, signed play URLs
  nxsha.ts      # OPTIONAL third-party adapter (unlicensed — see §6)
  nxsha-providers.ts  # scraper catalogue: capabilities + probe ordering
  nxsha-embed.ts      # last-resort third-party iframe players
  fixtures.ts   # sample catalog for demos, no DB (MEDIA_FIXTURES=1)
  index.ts      # provider registry (lazy imports, env-driven)
  gate.ts       # one plan gate for all /api/media routes
src/lib/server/sync/
  series.ts     # Xtream series sync + lazy episode cache + episode URLs
src/lib/server/epg.ts        # XMLTV fetch/parse/match + in-memory cache
src/app/api/media/{home,search,title/[id],sources/[id],providers}/route.ts
src/app/api/epg/route.ts
src/components/tv/MediaHubView.tsx     # hero, tabs, rails, search
src/components/tv/MediaTitleView.tsx   # detail, seasons/episodes, playback
src/components/tv/GuideStrip.tsx       # now/next on the watch page
```

**Invariants** (same as the rest of the app):

1. **No raw stream URL ever reaches the browser.** Providers mint `/api/proxy?t=<AES-GCM>`
   tokens server-side (`lib/server/proxy-sign`), so portal credentials can't be lifted from
   a network tab and the proxy can't be used as an open relay.
2. **Everything is plan-gated server-side** (`mediaGate`). Guests get
   `403 {accessDenied:true, reason:"guest"}` — the UI turns that into the plan upsell.
3. **Tenant-scoped.** Every query is filtered by `organizationId`; a customer can never see
   another operator's titles.
4. **Providers are interchangeable.** The UI only knows `MediaCard` / `MediaDetail` /
   `MediaSources`, so adding a source (or removing nxsha) never touches a component.

---

## 3. Endpoints

| Route | Purpose |
|---|---|
| `GET /api/media/home?tab=home\|movies\|series\|anime` | Hero + rails for the hub |
| `GET /api/media/search?q=` | Title search (min 2 chars) |
| `GET /api/media/title/:id?season=N` | Detail, seasons/episodes, movie `playUrl` |
| `GET /api/media/sources/:id?season=&episode=` | Playable sources + subtitle tracks |
| `GET /api/media/providers` | Which provider is active / nxsha enabled / fixtures on |
| `GET /api/epg?ids=ch1,ch2` | Now/next for up to 30 channels in the caller's plan |
| `POST /api/platform/sources/:id/sync-movies` | Import Movies |
| `POST /api/platform/sources/:id/sync-series` | Import TV Shows (episodes lazy) |

Ids are provider-qualified: `catalog:movie:<cuid>`, `catalog:series:<cuid>`,
`nxsha:movie:<tmdbId>`.

---

## 4. Importing your own catalog (default provider)

1. Add an Xtream source in **Admin → Sources** (with an optional `EPG URL`).
2. Run the Movies sync, then the Series sync:
   ```bash
   curl -X POST https://your-host/api/platform/sources/<sourceId>/sync-movies \
        -H 'cookie: <admin session>'
   curl -X POST https://your-host/api/platform/sources/<sourceId>/sync-series \
        -H 'cookie: <admin session>'
   ```
3. Open **Movies** in the app. Rails are built from the freshest titles + the biggest
   genres (`Movie.genre` / `Series.genre` from the panel), deduped by title so the same film
   from three portals is one card.

Episodes are **not** downloaded during sync — `get_series_info` is a per-title round trip and
big panels hold thousands of series. The first customer to open a show warms
`Series.episodesJson`; it is refreshed when older than 24 h. If the panel is down, the cached
episode list is served instead of an error.

---

## 5. EPG (live TV guide)

Set `EPG URL` on a source (XMLTV / `.xml` or `.xml.gz` served as XML). The guide is:

* parsed once per URL and cached in memory for 15 minutes,
* windowed to −6 h … +48 h around now (a 40 MB country guide isn't kept in RAM),
* matched to channels by `sourceId` → exact display name → normalised name
  (drops `HD`, `4K`, country prefixes, bracketed notes),
* silently absent when nothing matches — a missing guide never breaks the watch page.

`GET /api/epg?ids=…` returns `{ matched, now: {title,start,stop,progress}, next }` per channel.

---

## 6. ⚠️ The optional `nxsha` provider

`src/lib/server/media/nxsha.ts` is an adapter for the third-party aggregator used by the
reference demo app (`nxsha.space` / MovieBox). It is **off by default** and needs *both*:

```bash
NXSHA_ENABLED=true
MEDIA_PROVIDER=nxsha      # or ?provider=nxsha on a request
```

Read this before you enable it:

* the stream sources it returns are **not licensed** — shipping it moves copyright,
  takedown and payment-processor risk onto you;
* it works by **reverse-engineering** a third-party front end (the AES passphrase lives in
  that file); the upstream can rotate keys or vanish at any time;
* some hosts fingerprint TLS and only answer `curl`, which is why the adapter shells out to
  curl with a `fetch` fallback — serverless platforms may not have curl;
* it has no search endpoint, so search returns nothing with that provider.

How a title becomes a picture, in order:

1. `/api/servers` is asked which scrapers have it. Rows are ranked by the upstream
   `high_priority`/`position` hints, then by our catalogue's taste (`nxsha-providers.ts`), and
   **at most 4 are probed in parallel**. Offline/disabled rows and scrapers saved for the other
   kind (`types[]`) are dropped; anime-only scrapers go last unless it is a series.
2. If `/api/servers` returns nothing, a known-good fallback list is probed instead of giving up.
3. Whatever answers is rewritten to an opaque signed `/api/proxy` path. Subtitle tracks
   (`language` + `uri` upstream) are proxied the same way, because their host sends no CORS.
4. If **every** scraper fails, the API returns sources flagged `embed: true` — six third-party
   players keyed by TMDB id (`nxsha-embed.ts`). The UI shows them in a sandboxed iframe with a
   plain-language notice; they never reach the video pipeline.

The full upstream reference (crypto layer, endpoint shapes, scraper table) is in
[`docs/NXSHA_PROVIDER_SPEC.md`](./NXSHA_PROVIDER_SPEC.md).

The default `catalog` provider has none of these problems. If you are unsure, leave nxsha
off — the app fully works without it.

---

## 7. Local development

### With your real MySQL

```bash
bun install
cp .env.example .env          # DATABASE_URL=mysql://…
bun run db:push
bun run seed:admin
bun run dev
```

### Without a database (UI evaluation)

```bash
MEDIA_FIXTURES=1 bun run dev
```

This swaps in `fixtures.ts` and bypasses the DB for `/api/media/*` only: 10 sample titles,
two seasons of episodes, real posters, public test HLS streams. Everything else in the app
(live TV, auth, admin) still needs the database — this mode exists to review the new UI.

### SQLite twin of the schema (no MySQL server needed)

```bash
bun run db:dev:schema         # derive prisma/schema.sqlite.prisma from schema.prisma
DATABASE_URL="file:./dev.db" bunx prisma db push --schema prisma/schema.sqlite.prisma
```

`prisma/schema.sqlite.prisma` is generated (MySQL-only `@db.*` types stripped) and gitignored.
**Never deploy from it** — production is MySQL.

---

## 8. Testing

```bash
bun run test          # vitest: includes tests/unit/media.test.ts (XMLTV, ids, providers)
bun run typecheck
bun run lint
```

`tests/unit/media.test.ts` covers the XMLTV parser (timezones, entity decoding, window
filtering), media-id round-tripping, the fixture provider's contract, and that sources only
ever expose proxy tokens.
