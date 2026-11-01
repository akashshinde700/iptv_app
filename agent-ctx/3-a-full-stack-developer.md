# Task 3-a — Backend API layer (channels / meta / featured / proxy)

Agent: full-stack-developer
Status: DONE
Files owned: src/lib/server/iptv.ts, src/app/api/{channels,channels/[id],channels/by-ids,meta,featured,proxy}/route.ts

## What was built

1. **src/lib/server/iptv.ts** — shared backend helpers:
   - Types: `ChannelItem`, `BestStream`, `ChannelDetail`, `Paged<T>`, `ListChannelsOptions`, `ChannelSort`.
   - `STREAM_SELECT` (id,url,quality,title,referrer,userAgent) + Prisma payload types.
   - `splitPipe` (pipe column -> string[]), `qualityRank` ("1080p" -> 1080, null -> -1).
   - `sortStreams`: HLS (url contains m3u8) first, then quality desc (parsed number), then has-quality first.
   - `pickBestStream`, `toChannelItem` (computes streamCount + bestStream, no raw streams exposed).
   - `buildChannelWhere` (nsfw=false default, country IN, category/language pipe-contains ORs, name contains search).
   - `parseListParams` (page>=1, pageSize default 24 max 100, sort name|nameDesc).
   - `listChannels(opts)` -> `{ items, total, page, pageSize, totalPages }` (count + findMany in parallel).

2. **API routes** (all `export const dynamic = 'force-dynamic'`):
   - `GET /api/channels` — filters: search, country csv, category csv, language csv, nsfw ("true" disables NSFW filter), page, pageSize (max 100), sort.
   - `GET /api/channels/[id]` — Next 16 `await params`; `{ channel: ChannelItem & { streams: [...] } }` streams sorted best-first; 404 JSON if missing.
   - `GET /api/channels/by-ids?ids=c1,c2` — dedupe, max 200 (else 400), `{ items: ChannelItem[] }` (DB order).
   - `GET /api/meta` — `{ totalChannels, totalStreams, categories[{slug,name,count}], countries[{code,name,flag,count}], languages[{name,count}] }`; categories/languages aggregated in JS from all rows (pipe split), countries via groupBy(country,countryName,countryFlag) filtered non-null; slug->display map (entertainment fixed, undefined->Other, capitalize fallback); module-level cache TTL 10 min.
   - `GET /api/featured` — 11 rows (in/news/sports/movies/music/kids/entertainment/documentary/religious/us/uk), pageSize 18, nsfw false, reuses listChannels; cache TTL 10 min.
   - `GET /api/proxy?url=&ua=&ref=` — runtime nodejs; validates http(s), SSRF string guard (localhost/.local/.internal, 127/10/192.168/172.16-31/169.254/0.0.0.0/::1/IPv6 private), forwards Range + custom UA (default modern Chrome) + referer; 30s AbortController, redirect follow, 502 JSON {error:'Upstream fetch failed'} on fetch error. Playlists (content-type mpegurl or .m3u8 path): every segment line + every URI="..." attribute absolutized (vs final redirect URL) and rewritten to `/api/proxy?url=<enc>[&ua=][&ref=]`, served as application/vnd.apple.mpegurl + no-store. Segments: body streamed with status passthrough, only content-type/content-length/accept-ranges/content-range forwarded (CSP/XFO/COOP/CORP dropped), cache-control no-store, ACAO * on all responses.

## Verified test results (curl against dev server)

- `/api/meta`: totalChannels **9948**, totalStreams **14902**; categories desc: General 2510, News 926, Entertainment 758, Religious 730, Music 703, Movies 585, Sports 409...; 2nd call cached ~17ms.
- `/api/channels?country=IN&pageSize=2`: total 680; samples: **&TV** (Z network, Hindi, movies, bestStream 1080p m3u8) and **&pictures** (720p).
- `?search=star&category=sports`: matches LIKE substring (e.g. "Deportes por Movi**star** Plus+"); `sort=nameDesc` gives Zoom/Zing!/Zee Zest; `page=2` paginates; `language=Hindi` -> 285.
- `/api/channels/[id]`: &TV detail — 2 streams best-first, first == bestStream.
- `/api/channels/by-ids?ids=...,...`: 2 items returned.
- `/api/featured`: 11 rows × 18 items (totals: IN 680, news 926, sports 409, movies 585, music 702, kids 317, entertainment 758, documentary 205, religious 730, US 1700, UK 185).
- **Proxy**: 2M Monde master playlist (needs Referer http://www.radio2m.ma/) fully rewritten — variant URIs -> `/api/proxy?url=...&ref=...`; variant media playlist segments rewritten incl. ref propagation; segment fetch -> HTTP 200, video/MP2T, 812,536 bytes, TS sync byte **0x47** at offset 0; Range -> **206** 100 bytes; SSRF (localhost/192.168.x/10.x/.local) -> 400; missing url / ftp:// -> 400; upstream 40x status passthrough. Also verified 4 more live playlists (streamingconnect.tv, Quortex/CloudFront, freevisiontv.co.za, xsg.ge).
- `bun run lint` clean; `tsc --noEmit` clean for src/ (pre-existing errors only in examples/skills); dev.log 0 errors.

## Caveats / notes for next agents

- Frontend must use bestStream (or detail streams[0]) via `/api/proxy?url=...&ua=...&ref=...` for playback — never fetch upstream directly.
- Many iptv-org upstreams are dead/geo-blocked; proxy fixes headers/CORS only, not dead streams. UI should handle player errors gracefully.
- meta/featured cached 10 min in module scope (per server instance, reset on dev reload).
- `db.ts` logs Prisma queries to stdout — dev.log grows; ignore noise.
