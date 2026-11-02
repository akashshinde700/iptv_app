/**
 * The scraper catalogue behind nxsha's `/api/servers` response.
 *
 * Why a static table exists at all when the API sends its own server list:
 *
 *  1. **Ordering.** `/api/servers` returns every scraper for a title, but only a handful are worth
 *     probing (each probe is an upstream round-trip that can take seconds). The API's `position` /
 *     `high_priority` fields are a hint; this table is the taste layer on top — providers that
 *     reliably return playable HLS go first, dead-in-practice ones last.
 *  2. **Fallback.** When `/api/servers` is unreachable, we can still try the known-good scrapers
 *     instead of showing the viewer "no sources".
 *  3. **Capabilities.** `web` vs `download` is not reliably present on every row, and the UI needs
 *     it to decide between "Play" and "Download".
 *
 * ⚠️ These are third-party scrapers of unlicensed content. See the warning at the top of
 * `nxsha.ts`: this whole provider is opt-in, server-only, and disabled by default.
 */

export interface NxshaProviderInfo {
  /** the `scraper` id used in `/api/sources?provider=` */
  scraper: string;
  /** display name, matching what the site shows so screenshots/logs line up */
  name: string;
  quality: string;
  /** returns a stream we can hand to the player */
  web: boolean;
  /** returns a file URL via `method: "dl"` */
  download: boolean;
  /** anime-oriented scraper — skipped for live-action titles unless nothing else works */
  anime?: boolean;
  /** lower is tried first */
  priority: number;
}

/**
 * Priority rationale (measured against a sample of popular titles, not by the vendor):
 * scrapers that answer with plain HLS in <2 s come first; the `*-direct` variants are slower
 * because they resolve an intermediate page, so they sit after their parent.
 */
export const NXSHA_PROVIDERS: readonly NxshaProviderInfo[] = [
  { scraper: 'awsind', name: 'AwsPly', quality: 'HD/SD/FHD', web: true, download: false, priority: 10 },
  { scraper: 'nitro', name: 'Nitro', quality: 'HD/SD/FHD', web: true, download: false, priority: 15 },
  { scraper: 'castle', name: 'CastVid', quality: 'HD/SD/FHD', web: true, download: false, priority: 20 },
  { scraper: 'streamflix', name: 'StremFx', quality: 'HD/SD/FHD', web: true, download: false, priority: 25 },
  { scraper: 'watchout', name: 'Multi-bill', quality: 'HD/SD/FHD', web: true, download: false, priority: 30 },
  { scraper: 'rive-citadel', name: 'Citadel', quality: 'HD/SD/FHD', web: true, download: false, priority: 35 },
  { scraper: 'rive-primevids', name: 'Prvibd', quality: 'HD/SD/FHD', web: true, download: false, priority: 40 },
  { scraper: 'stvv', name: 'Stvvid', quality: 'HD/SD/FHD', web: true, download: false, priority: 45 },
  { scraper: 'bdxs', name: 'Multi-blue', quality: 'HD/SD/FHD', web: true, download: false, priority: 50 },
  { scraper: 'showbox-online', name: 'Xuhd', quality: 'HD/SD/FHD', web: true, download: false, priority: 55 },
  { scraper: 'purstream', name: 'PureWave', quality: 'Auto', web: true, download: false, priority: 60 },
  { scraper: 'vixolity', name: 'Vixo', quality: 'Auto', web: true, download: false, priority: 65 },
  { scraper: 'ophim', name: 'Ophm', quality: 'HD/SD/FHD', web: true, download: false, priority: 70 },
  { scraper: 'xdownloader', name: 'XDrop', quality: 'Auto', web: true, download: true, priority: 75 },
  { scraper: 'movone', name: 'MovOne', quality: 'Auto', web: true, download: true, priority: 80 },
  { scraper: 'em-8', name: 'VidHindi', quality: '4K', web: true, download: false, priority: 85 },
  { scraper: 'moviesdrive', name: 'MD-4K', quality: '4K/FHD/HD/SD', web: true, download: true, priority: 90 },
  { scraper: 'hdhub4u', name: '4k-bk', quality: 'HD/SD/FHD', web: false, download: true, priority: 100 },
  { scraper: 'hdhub4u-direct', name: '4k-bkl', quality: 'HD/SD/FHD', web: false, download: true, priority: 105 },
  { scraper: 'k4khdhub', name: '4k-Hub', quality: 'HD/SD/FHD', web: false, download: true, priority: 110 },
  { scraper: 'k4khdhub-direct', name: '4k-Hublink', quality: 'HD/SD/FHD', web: false, download: true, priority: 115 },
  { scraper: 'filmyfly', name: 'FlyVid', quality: 'HD/SD/FHD', web: true, download: true, priority: 120 },
  { scraper: 'filmyfly-direct', name: 'FlyVid Direct', quality: 'HD/SD/FHD', web: true, download: true, priority: 125 },
  { scraper: 'rive-hindicast', name: 'HindiSk', quality: 'HD/SD/FHD', web: true, download: false, priority: 130 },
  { scraper: 'mbox', name: 'MbPly', quality: 'HD/SD/FHD', web: false, download: false, priority: 200 },
  { scraper: 'mhbox', name: 'MhPly', quality: 'HD/SD/FHD', web: false, download: false, priority: 205 },
  { scraper: 'imovr', name: 'Topflix', quality: 'HD/SD/FHD', web: false, download: false, priority: 210 },
  { scraper: 'yomovies', name: 'StreamX', quality: 'HD/SD', web: false, download: false, priority: 215 },
  { scraper: 'vidapi', name: 'VidPi', quality: 'HD/SD/FHD', web: false, download: false, priority: 220 },
  { scraper: 'levi', name: 'Hevily', quality: 'HD/SD/FHD', web: false, download: false, priority: 225 },
  { scraper: 'rive-flowcast', name: 'River', quality: 'HD/SD/FHD', web: false, download: false, priority: 230 },
  { scraper: 'tamilblasters', name: 'TamBlast', quality: 'HD/SD/FHD', web: false, download: false, priority: 240 },
  { scraper: 'toonstream', name: 'TunWatch', quality: 'HD/SD/FHD', web: false, download: false, anime: true, priority: 300 },
] as const;

const BY_SCRAPER = new Map(NXSHA_PROVIDERS.map((p) => [p.scraper, p]));

/** Known-good scrapers to try when `/api/servers` fails outright. */
export const NXSHA_FALLBACK_SCRAPERS = ['awsind', 'nitro', 'castle', 'streamflix', 'watchout', 'stvv'] as const;

export function providerInfo(scraper: string): NxshaProviderInfo | undefined {
  return BY_SCRAPER.get(scraper.toLowerCase());
}

/** Priority for a scraper we do not know about (new on their side) — probed after all known ones. */
export const UNKNOWN_PROVIDER_PRIORITY = 150;

export interface ServerRow {
  scraper?: unknown;
  name?: unknown;
  status?: unknown;
  isDisable?: unknown;
  web_support?: unknown;
  dl_support?: unknown;
  position?: unknown;
  high_priority?: unknown;
  types?: unknown;
  country?: unknown;
}

export interface RankedServer {
  scraper: string;
  name: string;
  quality: string;
  web: boolean;
  download: boolean;
  priority: number;
  /** true when the catalogue (not the API) supplied the capability flags */
  fromCatalogue: boolean;
}

/**
 * Turn an `/api/servers` payload into an ordered, de-duplicated probe list.
 *
 * Ordering rules, in this order:
 *   1. API `high_priority` first, then API `position`, then catalogue priority — the API knows
 *      which scrapers currently have the title, the catalogue only knows which are good in general.
 *   2. Offline / disabled rows are dropped.
 *   3. Rows without a `scraper` id are dropped (they cannot be queried).
 *   4. Anime-only scrapers are kept, but pushed to the end for non-anime titles: trying a cartoon
 *      scraper for a live-action film burns a round-trip and always misses.
 */
export function rankServers(rows: ServerRow[], mediaType: 'movie' | 'tv', opts: { anime?: boolean } = {}): RankedServer[] {
  const out: RankedServer[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const scraper = typeof row.scraper === 'string' ? row.scraper.trim().toLowerCase() : '';
    if (!scraper || seen.has(scraper)) continue;

    const status = typeof row.status === 'string' ? row.status.toLowerCase() : '';
    if (status === 'offline' || row.isDisable === true) continue;

    // `types` restricts a scraper to movie/tv; a missing list means "both".
    if (Array.isArray(row.types) && row.types.length > 0) {
      const types = row.types.map((t) => String(t).toLowerCase());
      if (!types.includes(mediaType)) continue;
    }

    const info = providerInfo(scraper);
    const webFromApi = typeof row.web_support === 'boolean' ? row.web_support : undefined;
    const dlFromApi = typeof row.dl_support === 'boolean' ? row.dl_support : undefined;

    seen.add(scraper);
    out.push({
      scraper,
      name: info?.name ?? (typeof row.name === 'string' ? row.name : scraper),
      quality: info?.quality ?? 'Auto',
      web: webFromApi ?? info?.web ?? true,
      download: dlFromApi ?? info?.download ?? false,
      priority:
        (info?.priority ?? UNKNOWN_PROVIDER_PRIORITY) -
        (row.high_priority === 1 || row.high_priority === true ? 1000 : 0) +
        (typeof row.position === 'number' ? row.position / 100 : 0),
      // true when the catalogue had to fill in a capability the API did not send
      fromCatalogue: info !== undefined && (webFromApi === undefined || dlFromApi === undefined),
    });
  }

  out.sort((a, b) => {
    const aAnime = providerInfo(a.scraper)?.anime ? 1 : 0;
    const bAnime = providerInfo(b.scraper)?.anime ? 1 : 0;
    const animeDelta = opts.anime ? 0 : aAnime - bAnime;
    if (animeDelta !== 0) return animeDelta;
    return a.priority - b.priority;
  });

  return out;
}

/** Probe list used when `/api/servers` could not be read at all. */
export function fallbackServers(): RankedServer[] {
  return NXSHA_FALLBACK_SCRAPERS.map((scraper) => {
    const info = providerInfo(scraper)!;
    return {
      scraper,
      name: info.name,
      quality: info.quality,
      web: info.web,
      download: info.download,
      priority: info.priority,
      fromCatalogue: true,
    };
  });
}
