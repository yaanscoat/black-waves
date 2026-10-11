// Builds public/assets/data/games.json from the gmshelf/ckv catalog.
// Each catalog entry points at a wrapper page (title bar + iframe); we resolve
// the inner game page so games open without the wrapper's chrome.
// Covers are shrunk to 192px WebP thumbnails in public/assets/covers: the
// iliketypingrandsommstuffinheretomakeitseemlikeimdoingsmth jokes.. maybe?
// Usage: npm run build:games            (reuses existing thumbnails)
//        npm run build:games -- --force (regenerates every thumbnail)
import { writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const RAW = "https://raw.githubusercontent.com/gmshelf/ckv/main";
const OUT = path.join(process.cwd(), "public", "assets", "data", "games.json");
const COVERS = path.join(process.cwd(), "public", "assets", "covers");
const CONCURRENCY = 16;
const THUMB = 192;
const FORCE = process.argv.includes("--force");

async function text(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

const rawUrl = (file) => RAW + file.split("/").map(encodeURIComponent).join("/");

async function exists(file) {
  const res = await fetch(rawUrl(file), { method: "HEAD" });
  return res.ok;
}

const usedNames = new Set();
function thumbName(cover) {
  const base = path.basename(cover).replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "cover";
  let name = base;
  for (let n = 2; usedNames.has(name); n++) name = `${base}-${n}`;
  usedNames.add(name);
  return `${name}.webp`;
}

// Returns the site path of the thumbnail, or null if the cover couldn't be made.
async function makeThumb(entry, name) {
  const out = path.join(COVERS, name);
  if (!FORCE) {
    try {
      await access(out);
      return `/assets/covers/${name}`;
    } catch {}
  }
  try {
    const res = await fetch(rawUrl(entry.img));
    if (!res.ok) throw new Error(`${res.status}`);
    await sharp(Buffer.from(await res.arrayBuffer()), { animated: false })
      .resize(THUMB, THUMB, { fit: "cover" })
      .webp({ quality: 76, effort: 5 })
      .toFile(out);
    return `/assets/covers/${name}`;
  } catch (err) {
    console.warn(`[games] cover for ${entry.name}: ${err.message}`);
    return null;
  }
}

async function resolveGame(entry) {
  const dir = entry.url.replace(/[^/]*$/, "");
  let file = entry.url;
  let title = entry.name;
  try {
    const html = await text(rawUrl(entry.url));
    const frame = html.match(/id="gameFrame"\s+src="([^"]+)"/) || html.match(/<iframe[^>]*\ssrc="([^"]+)"/);
    const label = html.match(/class="toolbar">\s*<span>([^<]*)<\/span>/);
    if (label && label[1].trim()) title = label[1].trim();
    if (frame && !/^[a-z]+:/i.test(frame[1])) {
      // Upstream mangles titles containing apostrophes into the src, e.g.
      // "fnaf2.html's.html"; the real file ends at the first ".html".
      const inner = dir + frame[1].replace(/(\.html?).*$/i, "$1");
      if (!(await exists(inner))) {
        console.warn(`[games] skipping ${entry.name}: ${inner} is missing upstream`);
        return null;
      }
      file = inner;
    }
  } catch (err) {
    console.warn(`[games] ${entry.name}: ${err.message}, using wrapper page`);
  }
  const cover = entry.img ? await makeThumb(entry, thumbName(entry.img)) : null;
  return { title, file, cover };
}

await mkdir(COVERS, { recursive: true });
const { games } = JSON.parse(await text(`${RAW}/ckv.json`));
const results = new Array(games.length);
let next = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < games.length) {
      const i = next++;
      results[i] = await resolveGame(games[i]);
    }
  })
);

const playable = results.filter(Boolean);
playable.sort((a, b) => a.title.localeCompare(b.title, "en", { numeric: true, sensitivity: "base" }));
await writeFile(OUT, JSON.stringify({ source: "https://github.com/gmshelf/ckv", games: playable }) + "\n");
console.log(`[games] wrote ${playable.length} games to ${path.relative(process.cwd(), OUT)}`);
