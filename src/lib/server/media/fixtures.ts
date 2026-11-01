/**
 * Fixture catalog for evaluating the media hub **without a database**.
 *
 * Enable with `MEDIA_FIXTURES=1`. It exists so a fresh clone can demo the new
 * Movies & TV experience (hero, rails, search, seasons, resume, player) before any
 * portal is connected — the posters are real TMDB images, the streams are public test
 * HLS renditions. It never runs when the variable is unset, and it's excluded from
 * production builds by that same check.
 */
import { signedProxyPath } from "@/lib/server/proxy-sign";
import type {
  MediaCard,
  MediaContext,
  MediaDetail,
  MediaHome,
  MediaProvider,
  MediaSources,
  MediaTab,
} from "./types";
import { mediaId } from "./types";

const IMG = "https://image.tmdb.org/t/p/w500";
const BACKDROP = "https://image.tmdb.org/t/p/w1280";
/** Public test renditions, useful for verifying the player + quality picker end to end. */
const TEST_STREAMS = [
  "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
  "https://test-streams.mux.dev/pts_shift/master.m3u8",
];

type Seed = {
  ref: string;
  kind: "movie" | "series";
  title: string;
  poster: string;
  backdrop: string;
  year: string;
  rating: string;
  plot: string;
  genre: string;
};

const SEEDS: Seed[] = [
  {
    ref: "fx-01",
    kind: "movie",
    title: "Neon Monsoon",
    poster: `${IMG}/qJ2tW6WMUDux911r6m7haRef0WH.jpg`,
    backdrop: `${BACKDROP}/hkBaDkMWbLaf8B1lsWsKX7Ew3Xq.jpg`,
    year: "2024",
    rating: "7.8",
    plot: "A courier in a flooded Mumbai chases a package that everyone wants back.",
    genre: "Thriller",
  },
  {
    ref: "fx-02",
    kind: "movie",
    title: "The Last Projectionist",
    poster: `${IMG}/9GBhzXMFjgcZ3FdR9w3bUMMTps5.jpg`,
    backdrop: `${BACKDROP}/xJHokMbljvjADYdit5fK5VQsXEG.jpg`,
    year: "2023",
    rating: "8.1",
    plot: "A small-town cinema refuses to close, one stubborn screening at a time.",
    genre: "Drama",
  },
  {
    ref: "fx-03",
    kind: "movie",
    title: "Kite Season",
    poster: `${IMG}/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg`,
    backdrop: `${BACKDROP}/5P8SmMzSNYikXpxil6BYzJ16611.jpg`,
    year: "2022",
    rating: "6.9",
    plot: "Two rivals meet again on the rooftops where they learned to fly.",
    genre: "Drama",
  },
  {
    ref: "fx-04",
    kind: "movie",
    title: "Concrete Ocean",
    poster: `${IMG}/pThyQovXQrw2m0s9x82twj48Jq4.jpg`,
    backdrop: `${BACKDROP}/5a4JdoFwll5DRtKNNc5d66AjsQI.jpg`,
    year: "2025",
    rating: "7.2",
    plot: "A marine biologist finds a new species — and a very old secret — in the harbour.",
    genre: "Sci-Fi",
  },
  {
    ref: "fx-05",
    kind: "movie",
    title: "Third Innings",
    poster: `${IMG}/6KErczPBROQty7QoIsaa6wJYXZi.jpg`,
    backdrop: `${BACKDROP}/A0lD5cDLZ2hSJ88p8WnhGDHN3vV.jpg`,
    year: "2021",
    rating: "7.6",
    plot: "A washed-up coach gets one season to save the club that raised him.",
    genre: "Sports",
  },
  {
    ref: "fx-06",
    kind: "movie",
    title: "Night Bus 71",
    poster: `${IMG}/2LqaLgk4Z226KkgPJuiOQ58wvrm.jpg`,
    backdrop: `${BACKDROP}/6MKr3KgOLvI1tqzhmve1t9F6BwH.jpg`,
    year: "2024",
    rating: "7.0",
    plot: "Twelve strangers, one bus, and a route no one remembers booking.",
    genre: "Thriller",
  },
  {
    ref: "fx-07",
    kind: "series",
    title: "Kaali Quarter",
    poster: `${IMG}/u3bZgnGQ9T01sWNhyveQz0wH0Hl.jpg`,
    backdrop: `${BACKDROP}/9faGSFi5jam6pDWGNd0p8JcJgXQ.jpg`,
    year: "2025",
    rating: "8.4",
    plot: "A Delhi night-shift detective and a teenage hacker close cases the department buried.",
    genre: "Crime",
  },
  {
    ref: "fx-08",
    kind: "series",
    title: "Salt & Signal",
    poster: `${IMG}/ljsZTbVsrQSqZgWeep2B1QiDKuh.jpg`,
    backdrop: `${BACKDROP}/qdIMHd4sEfJSckfVJfKQvisL02a.jpg`,
    year: "2024",
    rating: "8.0",
    plot: "A lighthouse keeper's radio picks up conversations from a timeline that shouldn't exist.",
    genre: "Sci-Fi",
  },
  {
    ref: "fx-09",
    kind: "series",
    title: "Small Town Legends",
    poster: `${IMG}/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg`,
    backdrop: `${BACKDROP}/bQXAqRx2Fgc46uCVWgoPz5L5Dtr.jpg`,
    year: "2023",
    rating: "7.5",
    plot: "Every episode, one impossible story from a town nobody believes.",
    genre: "Documentary",
  },
  {
    ref: "fx-10",
    kind: "series",
    title: "The Saffron Line",
    poster: `${IMG}/sgx6q5kdaMvy8x1FcY1cPvL8r7i.jpg`,
    backdrop: `${BACKDROP}/o0zXj8EHhmS5pIAdC2c1X4GZz9K.jpg`,
    year: "2022",
    rating: "7.9",
    plot: "Two families, one railway platform, and fifty years of grudges.",
    genre: "Drama",
  },
];

function card(seed: Seed): MediaCard {
  return {
    id: mediaId("catalog", seed.kind, seed.ref),
    provider: "catalog",
    kind: seed.kind,
    title: seed.title,
    poster: seed.poster,
    backdrop: seed.backdrop,
    year: seed.year,
    rating: seed.rating,
    plot: seed.plot,
    badges: [seed.genre],
  };
}

const TABS: MediaHome["tabs"] = [
  { key: "home", label: "For you" },
  { key: "movies", label: "Movies" },
  { key: "series", label: "TV Shows" },
];

function episodesFor(seed: Seed) {
  const season1 = Array.from({ length: 6 }).map((_, index) => ({
    id: `${seed.ref}-s1e${index + 1}`,
    season: 1,
    episode: index + 1,
    title: ["Cold Open", "Second Signal", "The Quiet Part", "Paper Trail", "Blackout", "Afterglow"][index] ?? `Episode ${index + 1}`,
    plot: "A fixture episode, so the season/episode UI can be demoed without a portal.",
    still: seed.backdrop,
    durationSecs: 42 * 60 + index * 60,
    rating: (7 + (index % 3) * 0.4).toFixed(1),
  }));
  const season2 = season1.slice(0, 4).map((ep) => ({ ...ep, id: `${seed.ref}-s2e${ep.episode}`, season: 2 }));
  return [
    { season: 1, name: "Season 1", episodes: season1 },
    { season: 2, name: "Season 2", episodes: season2 },
  ];
}

async function home(_ctx: MediaContext, tab: MediaTab): Promise<MediaHome> {
  const movies = SEEDS.filter((s) => s.kind === "movie").map(card);
  const series = SEEDS.filter((s) => s.kind === "series").map(card);
  const hero = [series[0], movies[0], series[1], movies[1]].filter((c): c is MediaCard => !!c);
  const rails =
    tab === "movies"
      ? [{ key: "fx-movies", title: "Movies", items: movies }]
      : tab === "series"
        ? [{ key: "fx-series", title: "TV Shows", items: series }]
        : [
            { key: "fx-new", title: "New on StreamKaro", items: [...series, ...movies] },
            { key: "fx-movies", title: "Movies", items: movies },
            { key: "fx-series", title: "TV Shows", items: series },
          ];
  return { provider: "catalog", tabs: TABS, hero, rails, geo: null };
}

async function search(_ctx: MediaContext, query: string): Promise<MediaCard[]> {
  const q = query.trim().toLowerCase();
  return SEEDS.filter((seed) => seed.title.toLowerCase().includes(q)).map(card);
}

async function detail(_ctx: MediaContext, id: string): Promise<MediaDetail | null> {
  const seed = SEEDS.find((s) => id.endsWith(s.ref));
  if (!seed) return null;
  const base = card(seed);
  const seasons = seed.kind === "series" ? episodesFor(seed) : [];
  return {
    ...base,
    genres: [seed.genre, "Fixture"],
    seasons,
    playUrl: seed.kind === "movie" ? signedProxyPath(TEST_STREAMS[0]) : null,
    needsEpisode: seed.kind === "series",
  };
}

async function sources(_ctx: MediaContext, id: string): Promise<MediaSources | null> {
  const seed = SEEDS.find((s) => id.endsWith(s.ref));
  if (!seed) return null;
  return {
    title: seed.title,
    startAt: 0,
    sources: TEST_STREAMS.map((url, index) => ({
      id: `${seed.ref}-src-${index}`,
      server: index === 0 ? "Fixture A" : "Fixture B",
      label: index === 0 ? "1080p" : "720p",
      quality: index === 0 ? "1080p" : "720p",
      type: "hls" as const,
      url: signedProxyPath(url),
      subtitles: [],
    })),
  };
}

export const fixturesProvider: MediaProvider = {
  name: "catalog",
  description: "Bundled sample catalog (MEDIA_FIXTURES=1) — no database required",
  home,
  search,
  detail,
  sources,
};

export function fixturesEnabled(): boolean {
  return process.env.MEDIA_FIXTURES === "1";
}
