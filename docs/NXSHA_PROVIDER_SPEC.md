# nxsha provider — reverse-engineered reference

> ⚠️ **Read `src/lib/server/media/nxsha.ts` header first.** nxsha is a reverse-engineered front end
> for pirate stream scrapers. The AES passphrase below was extracted from their public JS bundle;
> the streams are unlicensed. This whole provider is **opt-in** (`NXSHA_ENABLED=true` **and**
> `MEDIA_PROVIDER=nxsha`), **server-only**, and removable by deleting three files. Nothing in this
> document is a licence to redistribute anything.

This file records what the adapter knows about the upstream service, so a future maintainer does
not have to re-derive it from minified JavaScript. It is documentation only — no keys are read from
here at runtime.

## 1. Layers

| Layer | What it is |
| --- | --- |
| Site | Next.js front end, no database, no accounts |
| API | 4 routes on the same origin: `/api/home-feed`, `/api/servers`, `/api/sources`, `/api/subtitles` |
| Transport | AES-encrypted query in, `_hash` payload out; **curl is required in practice** |
| Scrapers | 30+ third-party scraper backends, listed in §4 |
| Episode data | separate host `fk.nxsha.xyz` |

## 2. Crypto (`src/lib/server/media/nxsha.ts`)

- Cipher: **AES-256-CBC**, OpenSSL-compatible.
- Key derivation: OpenSSL `EVP_BytesToKey` with **MD5**, 1 iteration, 8-byte random salt per message.
- Envelope: literal `Salted__` + salt + ciphertext, base64 (url-safe) on the wire.
- Passphrase default comes from `NXSHA_AES_KEY`; the extracted default is committed in the source
  because the provider is already opt-in and the key is public in their bundle anyway.
- Request payload adds `_req_ts` / `_req_salt`; the upstream does **not** strictly validate them, so
  clock skew is not a failure mode — but keep sending them, since a stricter deploy would 400.

## 3. Internal APIs

All four take a single encrypted `q` query parameter and answer `{ _hash }`, which decrypts to the
real payload. `_hash` is the only field to read; when the response carries `error` instead, treat it
as "no data", not as a fatal error.

### `/api/home-feed?tabKey=…&country=IN`

- `tabKey` ∈ `home | movies | tv | anime | trending` (`series` maps to `tv`).
- `sliderItems[]` → hero carousel.
- `fetchedSections[]` → `{ key, heading, items[] }` rails.
- `discoveryCatalogs.{movieGenres, tvGenres, languages}` → filter chips on the site. The adapter
  does not render them yet (they are names, not cards, and there is no browse route to link them
  to); they are noted here so a future genre-browse feature knows where the vocabulary lives.
- `geo` → country resolved from the edge.

### `/api/servers`

One row per scraper that supposedly has the title:

| field | meaning |
| --- | --- |
| `id` | internal row id |
| `name` | display name |
| `scraper` | **the id you pass to `/api/sources`** |
| `quality` | best advertised quality |
| `web_support` | can stream in-browser |
| `dl_support` | supports download mode |
| `status` | `online` / `offline` |
| `types[]` | `movie`, `tv` |
| `country` | region hint |
| `position` | upstream ordering |
| `high_priority` | 1 = probe this one first |
| `isDisable` | true = dead |

### `/api/sources`

Params: `provider` (a `scraper` id), `tmdbId`, `type` (`movie`|`tv`), `season`, `episode`,
`ex_lang`, and optionally `method: "dl"` for a download URL instead of a stream. Returns
`sources[] | null` plus `error`. Each source has `url`, `label`, `quality`, `type` (`hls`/`mp4`).
Stream URLs expire quickly — the adapter re-signs a proxy path with a ~90 s source cache.

### `/api/subtitles`

Rows: `{ id, language, uri, ... }`. **Field names matter:** the reference site reads `language`
(a display name) and `uri`. Reading `url`/`file` yields zero tracks — that was a real bug here.
The file host sends no CORS headers, so tracks are served through our own signed `/api/proxy`
path (the browser cannot load them cross-origin from a `<track>`).

## 4. Scraper catalogue

Modelled in `src/lib/server/media/nxsha-providers.ts` (`NXSHA_PROVIDERS`) with display name,
quality, `web`/`download` capability and a probe priority. `/api/servers` is authoritative about
*which* scrapers have the title; the table supplies ordering taste and capability fallback when the
API omits flags, plus a known-good probe list if `/api/servers` fails outright.

Download-capable: `xdownloader`, `hdhub4u`, `hdhub4u-direct`, `k4khdhub`, `k4khdhub-direct`,
`filmyfly`, `filmyfly-direct`, `moviesdrive`, `movone`. Default first probe: `awsind`.
`toonstream` is anime-only and is probed last unless the title is a series.

## 5. External host

- Episodes: `https://fk.nxsha.xyz/api/v1/wxdb/3/tv/{tmdbId}/season/{n}` → `{ episodes[] }` with
  `episode_number`, `name`, `overview`, `still_path`, `runtime`, `vote_average`.
- Geo/country resolution for the feed comes from the CDN edge headers (`cf-ipcountry`,
  `x-vercel-ip-country`), falling back to `IN`.
- The reference site rewrites some upstream requests through `api.allorigins.win` to dodge CORS.
  We do not: everything the browser needs already goes through our own `/api/proxy`, which is
  allow-listed for upstream hosts by `net-guard` and cannot be pointed at arbitrary URLs.

## 6. Backup embed players

`src/lib/server/media/nxsha-embed.ts`. When every scraper fails, `/api/media/sources/:id` returns
sources flagged `embed: true`: `vidfast.pro`, `player.videasy.net`, `vidnest.fun`,
`w1.moviesapi.to`, `web.screenscape.fun`, `player.vidzee.wtf`. URLs are built from a **numeric TMDB
id only**, and the UI renders them in a sandboxed iframe (`allow-scripts allow-same-origin
allow-presentation allow-forms`, no `allow-top-navigation`, `referrerPolicy="no-referrer"`).

## 7. Operational notes

- **curl-first transport.** Plain `fetch` from a datacenter IP is soft-blocked by their edge and
  returns an empty body; `curlGet()` shells out and only falls back to `fetch` when curl is absent.
  A container without `curl` still works, just less reliably.
- Probe budget: `MAX_SERVER_PROBES = 4` per title, fetched in parallel. Raising it multiplies
  latency and their rate-limit exposure.
- Source cache TTL is 90 s **per title *and* episode** — keying on the title alone served episode
  1's expiring URLs for episode 2 (fixed in this revision).
- The provider must never be exposed to the client as raw URLs; everything is `signedProxyPath`.
