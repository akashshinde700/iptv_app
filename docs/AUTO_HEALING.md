# Auto-healing sources, one-link playlists, and the simpler admin

Three things an operator asked for, and how they work:

1. “I add channels from M3U / Xtream / Stalker. If one doesn’t work it should disappear by
   itself, and the working one should play.”
2. “On my laptop and phone I keep switching servers manually — that should be automatic.”
3. “The app is complicated — make it as simple as possible.” Plus: playlists.

---

## 1. The health doctor (dead channels remove themselves)

`src/lib/server/health-doctor.ts`

A **probe** is not just “does the URL answer 200”. Dead IPTV panels are famous for answering
`200 OK` with an HTML “account expired” page, so the doctor:

| Stream type | What counts as working |
|---|---|
| HLS (`.m3u8`) | body really contains `#EXTM3U` **and** at least one variant/segment line |
| Progressive (`.ts`, `.mp4`, `.mkv`) | successful `206/200` ranged GET with bytes, and not `text/html` |
| Anything else | never probed — only public `http(s)` hosts (SSRF guard, `net-guard.ts`) |

Each probe records `status`, `failureCount`, `latencyMs`, `lastProbeAt`, `lastError`.

**Streams**: after `FAILURE_THRESHOLD` (5) consecutive failures a stream is set to `DISABLED`.
The catalog stops offering it. It is still re-probed, so it recovers by itself when the
provider fixes it.

**Channels**: after every probe batch the doctor recomputes `Channel.healthStatus`:

| Status | Meaning | Catalog effect |
|---|---|---|
| `OK` | every probe works | visible |
| `DEGRADED` | at least one source works | visible, dead sources already skipped |
| `DEAD` | no working source | **hidden** (`isActive=false` + `autoHiddenAt`) |
| `UNKNOWN` | never probed yet | visible (first scan fixes this) |

Recovery is automatic: the first successful probe clears `autoHiddenAt` and puts the channel
back. Operators never have to find and delete rows; nothing is ever destroyed either — a
restore button exists for the rare wrong call.

Demo channels (`isDemo`) are never auto-hidden; they are the free showcase.

### Running it

**Manually** — Admin → **Auto-fix** → “Scan & fix now”. Each click probes the next batch
(120 streams, 25 s budget) and reports what it found. Click again to continue; the button
always continues where it stopped.

**Automatically** — add to any scheduler:

```bash
# every 10 minutes
curl -fsS -X POST https://your-host/api/cron/health \
  -H "authorization: Bearer $CRON_SECRET"
```

`CRON_SECRET` must be set in the environment (the endpoint returns 503 without it, so it can
never be an open probe service). Per-tenant budget is ~15 s, so a 10-minute cadence keeps a
large catalog fresh without hammering providers. `?org=<slug>` limits a run to one tenant.

**On customer failure** — when a player reports a failure that disables a stream, the server
immediately schedules a recheck of that channel’s *other* sources (debounced to once/minute).
The next visit picks a provider that works, with no operator involvement.

### Recheck order

`lastProbeAt ASC` (never probed first), then most-recently-failed, with a 6 h staleness gate.
Freshly added playlists are validated first; a catalog that just broke is rechecked soon;
healthy sources are re-verified in the background.

---

## 2. Automatic server switching (no more “change server”)

Two layers, because a stream can fail loudly **or** silently:

1. **Ranking** (`sortStreams` in `src/lib/server/iptv.ts`). The player receives sources in
   this order, and fails over top-to-bottom:
   - works vs. auto-disabled
   - played successfully in the last 24 h (health doctor’s `lastOkAt`)
   - fewest consecutive failures
   - operator `priority`, then HLS, then quality
2. **Watchdog** (`STALL_WATCHDOG_MS` in `src/components/tv/Player.tsx`). A stream that loads
   and then freezes — black screen, stalled segment, dead panel — never fires an HLS error.
   If there is no playback progress for 22 s the player reports the failure and the page
   switches source automatically (and the server counts it against that source). A paused
   video is a viewer choice and is ignored.

Cross-portal failover already existed: the same channel from M3U + Xtream + Stalker is one
logical channel, and every provider’s copy is in the failover list. So “server” is now an
implementation detail — the UI says *Auto server switching on* and keeps the manual picker
collapsed behind “Choose a server”.

If *every* provider for a channel is dead, the watch page says “Fixing this channel…” and
retries on its own up to three times instead of showing a dead-end error.

---

## 3. Playlists (watch anywhere, still self-healing)

Every customer has one stable link:

```
https://your-host/api/playlist/<signed-token>/streamkaro.m3u
```

- found in **Settings → Watch anywhere** and **Profile → Watch in another app** (copy button
  + QR code),
- opens in VLC, TiviMate, OTT Navigator, Kodi, IPTV Smarters, GSE — phone, laptop, TV box,
- contains only channels in their plan **that currently have a working source**, each pointing
  at the best-ranked source through the same opaque `/api/proxy` tokens as the web player,
- dead entries disappear on the next refresh, so the playlist heals itself,
- the token is HMAC-signed (`playlist.ts`), carries no portal credentials, and is rate
  limited. Rotating `PROXY_SIGNING_SECRET` invalidates every playlist at once.

`GET /api/my/playlist` returns the link for the signed-in customer only.

---

## 4. Simpler admin

The old menu had two near-identical entries — “Failover Sources” and “Stalker Portals” —
which was the main source of confusion. Now:

| Menu | What it is |
|---|---|
| Dashboard | money + library at a glance |
| **My sources** | add a source in one step — **playlist first** in the tab order, then Xtream, then Stalker; adding now also imports the channels and runs a health pass, so there is no “now press Sync” step |
| **Auto-fix** | the health doctor: scan, stats, auto-removed channels + restore, cron setup |
| Channels | channel library |
| Channel sources | per-channel source list / manual priority (was “Failover Sources”) |
| Customers · Plans · Audit Logs · Settings | unchanged |

Old deep links (`#admin#portals`) still resolve.

---

## Migration / rollout

The health columns are new, so run the schema push once:

```bash
bun run db:push          # adds Channel.healthStatus/lastHealthAt/autoHiddenAt,
                         # Stream.lastProbeAt/latencyMs and their indexes
bun run db:generate
```

Then, in order:

1. Set `CRON_SECRET` and add the cron job (§1) — or press “Scan & fix now” daily.
2. Open **Auto-fix** once and let the first full scan finish (a few clicks for a big catalog,
   or let the cron drain it).
3. Tell customers about **Settings → Watch anywhere** — it removes most “server change”
   support questions.

### Notes

- Nothing is deleted: dead streams are `DISABLED`, dead channels are hidden with
  `autoHiddenAt` set. Both come back automatically.
- Probes run server-side only, public hosts only, 10 s timeout, 8 at a time.
- `Channel.healthStatus` is advisory for the admin UI; the customer catalog is filtered by
  `isActive` + “has at least one non-disabled stream”.
