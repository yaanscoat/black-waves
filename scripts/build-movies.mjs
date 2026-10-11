// Builds public/assets/data/movies.json from the TMDB API.
//
// The rails are baked at build time so the Movies page can render instantly
// from one small JSON file. The key is also embedded in assets/js/movies.js so
// the search box can query TMDB live — it is a public read-only key with no
// privileges, and you can swap it for your own via TMDB_API_KEY.
//
// Usage: npm run build:movies
import { writeFile } from "node:fs/promises";
import path from "node:path";

const KEY = process.env.TMDB_API_KEY || "ebbc810d0c9a9a4a13a264f96897036e";
const BASE = "https://api.themoviedb.org/3";
const POSTER = "https://image.tmdb.org/t/p/w342";
const OUT = path.join(process.cwd(), "public", "assets", "data", "movies.json");
const PER_ROW = 16;

// The six rails the Movies page shows. Each one is a single TMDB query; the
// ids double as the VidSrc embed ids, so no extra lookups are needed.
const ROWS = [
  { id: "trending", title: "Trending", note: "What everyone is watching this week", path: "/trending/movie/week", params: {} },
  {
    id: "hollywood",
    title: "Hollywood",
    note: "Blockbusters from the US and UK",
    path: "/discover/movie",
    params: { with_original_language: "en", region: "US", sort_by: "popularity.desc", "vote_count.gte": 500 },
  },
  {
    id: "bollywood",
    title: "Bollywood",
    note: "Hindi cinema's biggest hits",
    path: "/discover/movie",
    params: { with_original_language: "hi", sort_by: "popularity.desc", "vote_count.gte": 40 },
  },
  {
    id: "kids",
    title: "Kids",
    note: "Family films for every age",
    path: "/discover/movie",
    params: { with_genres: "10751", with_original_language: "en", sort_by: "popularity.desc" },
  },
  {
    id: "cartoons",
    title: "Cartoons",
    note: "Animated favourites, old and new",
    path: "/discover/movie",
    params: { with_genres: "16", with_original_language: "en", sort_by: "popularity.desc", "vote_count.gte": 120 },
  },
  {
    id: "anime",
    title: "Anime",
    note: "Japan's most loved animated films",
    path: "/discover/movie",
    params: { with_genres: "16", with_origin_country: "JP", sort_by: "popularity.desc" },
  },
];

async function tmdb(queryPath, params = {}) {
  const url = new URL(BASE + queryPath);
  url.searchParams.set("api_key", KEY);
  url.searchParams.set("include_adult", "false");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${queryPath} (${res.statusText})`);
  return res.json();
}

const year = (date) => (date ? String(date).slice(0, 4) : "");

async function buildRow(row) {
  const data = await tmdb(row.path, row.params);
  const items = (data.results || [])
    .filter((movie) => movie.poster_path && movie.title)
    .slice(0, PER_ROW)
    .map((movie) => ({
      title: movie.title,
      tmdb: movie.id,
      year: year(movie.release_date),
      rating: movie.vote_average ? Math.round(movie.vote_average * 10) / 10 : null,
      poster: `${POSTER}${movie.poster_path}`,
    }));
  return { id: row.id, title: row.title, note: row.note, items };
}

const built = [];
for (const row of ROWS) {
  try {
    const result = await buildRow(row);
    if (!result.items.length) throw new Error("empty row");
    built.push(result);
    console.log(`[MOVIES] ${row.id}: ${result.items.length} titles`);
  } catch (err) {
    console.error(`[MOVIES] ${row.id} failed: ${err.message}`);
  }
}

if (!built.length) {
  console.error("[MOVIES] No rows built - keeping the existing movies.json.");
  process.exit(1);
}

await writeFile(OUT, `${JSON.stringify({ source: "https://vidsrc.sh", provider: "TMDB", rows: built }, null, 0)}\n`, "utf8");
console.log(`[MOVIES] Wrote ${built.reduce((n, r) => n + r.items.length, 0)} titles to ${path.relative(process.cwd(), OUT)}`);
