/**
 * nxsha provider — an OPTIONAL, server-only adapter for the third-party "nxsha/MovieBox"
 * aggregator that powers the reference demo app.
 *
 * ⚠️  READ THIS BEFORE ENABLING IT
 * nxsha is a *reverse-engineered* front end for pirate stream scrapers: the AES key in this
 * file was extracted from their JS bundle, and the streams it returns are not licensed.
 * Shipping this in production shifts real legal, hosting and takedown risk onto you, and its
 * API can change or disappear at any time. It is therefore:
 *   • disabled by default (needs NXSHA_ENABLED=true *and* MEDIA_PROVIDER=nxsha),
 *   • server-only — the key never reaches the browser,
 *   • isolated behind the same MediaProvider interface as our own catalog, so removing
 *     one file (and flipping an env var) is a complete rollback.
 *
 * Prefer `catalog` (your own Xtream portals) unless you have an explicit licence.
 */
import type { MediaCard, MediaContext, MediaDetail, MediaProvider, MediaHome, MediaSources, MediaSeason, MediaTab } from "./types";
import { mediaId } from "./types";
import { signedProxyPath } from "@/lib/server/proxy-sign";

const NXSHA_BASE = process.env.NXSHA_BASE ?? "https://nxsha.space";
const PASSPHRASE = process.env.NXSHA_AES_KEY ?? "f4488ab4da401203d23baa129fc546153898162524635d6776826d0c867ccaa3";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const TIMEOUT_MS = 20_000;
/** Cap on scrapers we probe per title — each probe is one upstream round-trip. */
const MAX_SERVER_PROBES = 4;

/* ------------------------------- crypto ---------------------------------- */

async function nodeCrypto() {
  // Keep `node:crypto` out of any edge bundle; these routes are nodejs-only anyway.
  const { createCipheriv, createDecipheriv, createHash, randomBytes } = await import("node:crypto");
  return { createCipheriv, createDecipheriv, createHash, randomBytes };
}

type CryptoMod = Awaited<ReturnType<typeof nodeCrypto>>;

/** OpenSSL EVP_BytesToKey (MD5) — what CryptoJS does under the hood. */
function deriveKey(mod: CryptoMod, password: Buffer, salt: Buffer) {
  const out: Buffer[] = [];
  let prev = Buffer.alloc(0);
  let total = 0;
  while (total < 48) {
    prev = mod.createHash("md5").update(prev).update(password).update(salt).digest();
    out.push(prev);
    total += prev.length;
  }
  const derived = Buffer.concat(out);
  return { key: derived.subarray(0, 32), iv: derived.subarray(32, 48) };
}

async function encryptQ(payload: Record<string, unknown>): Promise<string> {
  const mod = await nodeCrypto();
  const salt = mod.randomBytes(8);
  const { key, iv } = deriveKey(mod, Buffer.from(PASSPHRASE, "utf8"), salt);
  const cipher = mod.createCipheriv("aes-256-cbc", key, iv);
  const body = Buffer.from(
    JSON.stringify({ ...payload, _req_ts: Date.now(), _req_salt: Math.random().toString(36).slice(2, 12) }),
    "utf8",
  );
  const pad = 16 - (body.length % 16);
  const padded = Buffer.concat([body, Buffer.alloc(pad, pad)]);
  const ct = Buffer.concat([cipher.update(padded), cipher.final()]);
  return Buffer.concat([Buffer.from("Salted__", "utf8"), salt, ct]).toString("base64url");
}

async function decryptHash(hash: string): Promise<Record<string, unknown> | null> {
  try {
    const mod = await nodeCrypto();
    const raw = Buffer.from(hash, "base64url");
    if (raw.length < 32 || raw.subarray(0, 8).toString("utf8") !== "Salted__") return null;
    const { key, iv } = deriveKey(mod, Buffer.from(PASSPHRASE, "utf8"), raw.subarray(8, 16));
    const decipher = mod.createDecipheriv("aes-256-cbc", key, iv);
    const pt = Buffer.concat([decipher.update(raw.subarray(16)), decipher.final()]);
    const json = JSON.parse(pt.toString("utf8")) as Record<string, unknown>;
    delete json._req_ts;
    delete json._req_salt;
    return json;
  } catch {
    return null;
  }
}

/* ------------------------------- transport -------------------------------- */
/*
 * nxsha's edge soft-blocks by TLS fingerprint: BoringSSL/undici fetches come back
 * 200-with-empty-body, while OpenSSL clients (curl, python) work. So we shell out to curl,
 * and fall back to fetch (for environments without curl, e.g. serverless images).
 */
async function curlGet(url: string): Promise<{ status: number; body: string } | null> {
  try {
    const { execFile } = await import("node:child_process");
    return await new Promise((resolve) => {
      execFile(
        "curl",
        [
          "-sS",
          "-L",
          "--max-time",
          String(Math.ceil(TIMEOUT_MS / 1000)),
          "-w",
          "\n%{http_code}",
          "-H",
          `user-agent: ${UA}`,
          "-H",
          `referer: ${NXSHA_BASE}/`,
          "-H",
          "accept: */*",
          url,
        ],
        { timeout: TIMEOUT_MS + 5000, maxBuffer: 10 * 1024 * 1024 },
        (err, stdout) => {
          if (err && !stdout) return resolve(null);
          const idx = stdout.lastIndexOf("\n");
          const status = idx >= 0 ? Number(stdout.slice(idx + 1).trim()) : 0;
          resolve({ status, body: idx >= 0 ? stdout.slice(0, idx) : stdout });
        },
      );
    });
  } catch {
    return null;
  }
}

async function transportGet(path: string): Promise<Record<string, unknown> | null> {
  const url = `${NXSHA_BASE}${path}`;
  const viaCurl = await curlGet(url);
  if (viaCurl && viaCurl.status >= 200 && viaCurl.status < 300 && viaCurl.body.trim().startsWith("{")) {
    try {
      return JSON.parse(viaCurl.body) as Record<string, unknown>;
    } catch {
      /* fall through */
    }
  }
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, referer: `${NXSHA_BASE}/`, accept: "*/*" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function encrypted(
  endpoint: "/api/servers" | "/api/sources" | "/api/subtitles",
  params: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const q = await encryptQ(params);
  const json = await transportGet(`${endpoint}?q=${encodeURIComponent(q)}`);
  if (!json || json.error) return null;
  const hash = typeof json._hash === "string" ? json._hash : null;
  if (!hash) return null;
  return decryptHash(hash);
}

/* --------------------------------- cache ---------------------------------- */

/** Cards seen in feeds, so a detail page can be rendered without a metadata API. */
const cardCache = new Map<string, MediaCard>();
const sourceCache = new Map<string, { at: number; data: MediaSources | null }>();
const SOURCE_TTL_MS = 90_000;

function remember(card: MediaCard) {
  cardCache.set(card.id, card);
  if (cardCache.size > 800) cardCache.delete(cardCache.keys().next().value as string);
  return card;
}

/* -------------------------------- mapping --------------------------------- */

type NxItem = Record<string, unknown>;

function nxKind(value: unknown): "movie" | "series" {
  return value === "tv" || value === "series" ? "series" : "movie";
}

function nxCard(item: NxItem, fallbackKind?: "movie" | "series"): MediaCard | null {
  const tmdbId = Number(item.id ?? item.tmdbId ?? item.tmdb_id);
  if (!Number.isFinite(tmdbId) || tmdbId <= 0) return null;
  const kind = nxKind(item.mediaType ?? item.media_type ?? fallbackKind);
  const poster = (item.poster as string) || null;
  const backdrop = (item.backdrop as string) || null;
  const date = (item.date as string) || (item.release_date as string) || (item.first_air_date as string) || "";
  const card: MediaCard = {
    id: mediaId("nxsha", kind, String(tmdbId)),
    provider: "nxsha",
    kind,
    title: String(item.title ?? item.name ?? "Untitled"),
    poster,
    backdrop: backdrop ?? poster,
    year: (item.year as string) || (date ? date.slice(0, 4) : null),
    rating: item.rating != null && item.rating !== "" ? String(item.rating) : item.vote_average != null ? String(item.vote_average) : null,
    plot: (item.description as string) || (item.overview as string) || null,
    badges: [],
  };
  return remember(card);
}

function nxCards(list: unknown, fallbackKind?: "movie" | "series"): MediaCard[] {
  if (!Array.isArray(list)) return [];
  const out: MediaCard[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const card = nxCard(raw as NxItem, fallbackKind);
    if (!card || seen.has(card.id)) continue;
    seen.add(card.id);
    out.push(card);
  }
  return out;
}

async function homeFeed(tabKey: string, country: string): Promise<Record<string, unknown> | null> {
  return transportGet(`/api/home-feed?tabKey=${encodeURIComponent(tabKey)}&country=${encodeURIComponent(country)}`);
}

/* -------------------------------- provider -------------------------------- */

const TABS: MediaHome["tabs"] = [
  { key: "home", label: "For you" },
  { key: "movies", label: "Movies" },
  { key: "series", label: "TV Shows" },
  { key: "anime", label: "Anime" },
];

async function home(ctx: MediaContext, tab: MediaTab): Promise<MediaHome> {
  const country = (ctx.country ?? "IN").toUpperCase().slice(0, 2);
  const tabKey = tab === "series" ? "tv" : tab;
  const feed = await homeFeed(tabKey, country);
  if (!feed) return { provider: "nxsha", tabs: TABS, hero: [], rails: [], geo: null };

  const hero = nxCards(feed.sliderItems).slice(0, 8);
  const sections = Array.isArray(feed.fetchedSections) ? (feed.fetchedSections as NxItem[]) : [];
  const rails = sections
    .map((section) => {
      const key = String(section.key ?? section.heading ?? Math.random());
      const heading = String(section.heading ?? section.display ?? "More");
      return { key, title: heading, items: nxCards(section.items) };
    })
    .filter((rail) => rail.items.length > 0);
  const geo = (feed.geo ?? null) as MediaHome["geo"];

  return { provider: "nxsha", tabs: TABS, hero, rails, geo };
}

/** nxsha has no public search endpoint — searching is a catalog-only feature. */
async function search(): Promise<MediaCard[]> {
  return [];
}

async function seasonEpisodes(tmdbId: number, season: number): Promise<MediaSeason[]> {
  try {
    const res = await fetch(`https://fk.nxsha.xyz/api/v1/wxdb/3/tv/${tmdbId}/season/${season}`, {
      headers: { "user-agent": UA, referer: `${NXSHA_BASE}/` },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { episodes?: Record<string, unknown>[] };
    const episodes = Array.isArray(json.episodes) ? json.episodes : [];
    return [
      {
        season,
        name: `Season ${season}`,
        episodes: episodes.map((e, index) => {
          const still = (e.still_path as string) || null;
          return {
            id: String(e.id ?? `${tmdbId}-${season}-${index + 1}`),
            season,
            episode: Number(e.episode_number ?? index + 1),
            title: String(e.name ?? `Episode ${index + 1}`),
            plot: (e.overview as string) || null,
            still: still ? (still.startsWith("http") ? still : `https://image.tmdb.org/t/p/w300${still}`) : null,
            durationSecs: e.runtime ? Number(e.runtime) * 60 : null,
            rating: e.vote_average != null ? String(e.vote_average) : null,
          };
        }),
      },
    ];
  } catch {
    return [];
  }
}

async function detail(ctx: MediaContext, id: string, season = 1): Promise<MediaDetail | null> {
  const card = cardCache.get(id);
  if (!card) return null;
  const tmdbId = Number(id.split(":").pop());
  const seasons = card.kind === "series" && Number.isFinite(tmdbId) ? await seasonEpisodes(tmdbId, season) : [];
  return {
    ...card,
    genres: [],
    seasons,
    playUrl: null,
    needsEpisode: card.kind === "series",
  };
}

async function sources(ctx: MediaContext, id: string, episode?: { season: number; episode: number }): Promise<MediaSources | null> {
  const cached = sourceCache.get(id);
  if (cached && Date.now() - cached.at < SOURCE_TTL_MS) return cached.data;

  const parts = id.split(":");
  const kind = parts[1] === "series" ? "tv" : "movie";
  const tmdbId = Number(parts[2]);
  if (!Number.isFinite(tmdbId)) return null;
  const season = kind === "tv" ? (episode?.season ?? 1) : 1;
  const ep = kind === "tv" ? (episode?.episode ?? 1) : 1;

  const serversPayload = await encrypted("/api/servers", { tmdbId, imdb_id: "", type: kind, season, episode: ep });
  const servers = Array.isArray(serversPayload?.servers) ? (serversPayload!.servers as NxItem[]) : [];
  const usable = servers.filter((s) => s.status !== "offline" && !s.isDisable).slice(0, MAX_SERVER_PROBES);

  const [subtitlesPayload, ...probeResults] = await Promise.all([
    encrypted("/api/subtitles", { tmdbId, imdb_id: "", type: kind, season, episode: ep }),
    ...usable.map((server) =>
      encrypted("/api/sources", {
        ex_lang: false,
        provider: String(server.scraper ?? server.name ?? ""),
        tmdbId,
        imdb_id: "",
        type: kind,
        season,
        episode: ep,
      }),
    ),
  ]);

  const subtitles = (
    Array.isArray(subtitlesPayload?.subtitles) ? (subtitlesPayload!.subtitles as NxItem[]) : []
  )
    .map((s, index) => ({
      id: String(s.id ?? index),
      label: String(s.label ?? s.language ?? s.lang ?? "Subtitle"),
      lang: String(s.lang ?? s.language ?? "und").slice(0, 5),
      url: String(s.url ?? s.file ?? ""),
    }))
    .filter((s) => s.url.length > 0);

  const out: MediaSources = { title: cardCache.get(id)?.title ?? "Stream", startAt: 0, sources: [] };
  probeResults.forEach((result, index) => {
    const server = usable[index];
    const list = Array.isArray(result?.sources) ? (result!.sources as NxItem[]) : [];
    for (const src of list) {
      const url = String(src.url ?? "");
      if (!url) continue;
      out.sources.push({
        id: `${id}-${index}-${out.sources.length}`,
        server: String(server?.name ?? server?.scraper ?? "Server"),
        label: String(src.label ?? src.quality ?? "Auto"),
        quality: (src.quality as string) || null,
        type: src.type === "mp4" ? "file" : "hls",
        // Same-origin only: an encrypted, expiring token — never the raw upstream URL.
        url: signedProxyPath(url, UA, `${NXSHA_BASE}/`),
        subtitles,
      });
    }
  });

  const data = out.sources.length > 0 ? out : null;
  sourceCache.set(id, { at: Date.now(), data });
  return data;
}

export const nxshaProvider: MediaProvider = {
  name: "nxsha",
  description: "Third-party aggregator (nxsha/MovieBox) — unlicensed, demo use only",
  home,
  search,
  detail,
  sources,
};
