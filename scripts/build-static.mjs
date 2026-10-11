// Produces a self-contained static build in dist/, ready to drop onto any
// static host (GitHub Pages, Netlify, Vercel, Cloudflare Pages, a plain nginx
// folder...). No Node process is needed at runtime: the proxy talks to a
// public Wisp server over websockets, which is the only part that normally
// needs a backend.
//
// Usage: npm run build:static
//   WISP_URL=wss://wisp.example.com/   Wisp endpoint the front end connects to
//   PUBLIC_ORIGIN=/blackwaves          Sub-path the site is deployed under
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const OUT = path.join(ROOT, "dist");

// The packages hide ./package.json behind their "exports" map, so the package
// root is found by resolving the main entry and walking up instead.
function packageRoot(name) {
  let dir = path.dirname(require.resolve(name));
  for (let i = 0; i < 6; i++) {
    if (existsSync(path.join(dir, "package.json"))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error(`Couldn't locate the package root for ${name}`);
}

// package -> folder under the build output. Every one of these is plain static
// files, which is exactly what makes a backend-free build possible.
const VENDORS = [
  ["@mercuryworkshop/bare-mux", "baremux"],
  ["@mercuryworkshop/epoxy-transport", "epoxy"],
  ["@mercuryworkshop/libcurl-transport", "libcurl"],
  ["@titaniumnetwork-dev/ultraviolet", "uv"],
  ["@mercuryworkshop/scramjet", "scramjet"],
];

const PUBLIC_WISP = process.env.WISP_URL || "wss://wisp.mercurywork.shop/";
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || "";

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

// 1. Our own pages, assets, service workers and data.
await cp(path.join(ROOT, "public"), OUT, { recursive: true });

// 2. The proxy engines and the two transports.
for (const [pkg, dest] of VENDORS) {
  await cp(path.join(packageRoot(pkg), "dist"), path.join(OUT, dest), { recursive: true });
  console.log(`[STATIC] ${dest}/ <- ${pkg}`);
}

// 3. Flip the runtime config so the front end knows there is no /w or /cdn
//    endpoint behind it, and where to open its Wisp socket instead.
const configPath = path.join(OUT, "assets", "js", "config.js");
const config = await readFile(configPath, "utf8");
await writeFile(
  configPath,
  config
    .replace(/static:\s*false/, "static: true")
    .replace(/wisp:\s*null/, `wisp: ${JSON.stringify(PUBLIC_WISP)}`)
    .replace(/publicWisp:\s*"[^"]*"/, `publicWisp: ${JSON.stringify(PUBLIC_WISP)}`),
  "utf8"
);
console.log(`[STATIC] config.js -> static: true, wisp: ${PUBLIC_WISP}`);

// 4. Service workers must be served from the domain root, so a deployment
//    under a sub-path needs that prefix baked into both registrations.
if (PUBLIC_ORIGIN) {
  const target = path.join(OUT, "assets", "js", "proxy.js");
  const text = await readFile(target, "utf8");
  await writeFile(target, text.replaceAll("/sw.js", `${PUBLIC_ORIGIN}/sw.js`).replaceAll("/scramsw.js", `${PUBLIC_ORIGIN}/scramsw.js`), "utf8");
  const sw = path.join(OUT, "scramsw.js");
  await writeFile(sw, (await readFile(sw, "utf8")).replaceAll('"/scramjet/', `"${PUBLIC_ORIGIN}/scramjet/`), "utf8");
  console.log(`[STATIC] service worker scope rewritten for ${PUBLIC_ORIGIN}`);
}

// 5. Host-specific rewrite rules. Every static host needs the extensionless
//    URLs (/games -> /games.html) to land on the right file.
const pageRewrites = [
  ["/games", "/games.html"],
  ["/apps", "/apps.html"],
  ["/movies", "/movies.html"],
  ["/browser", "/browser.html"],
];

await writeFile(
  path.join(OUT, "_redirects"),
  pageRewrites.map(([from, to]) => `${from}  ${to}  200`).join("\n") + "\n/*  /404.html  404\n",
  "utf8"
);

await writeFile(
  path.join(OUT, "vercel.json"),
  JSON.stringify({ cleanUrls: true, rewrites: pageRewrites.map(([source, destination]) => ({ source, destination })) }, null, 2) + "\n",
  "utf8"
);

await writeFile(
  path.join(OUT, "netlify.toml"),
  `[build]\n  publish = "."\n\n` + pageRewrites.map(([from, to]) => `[[redirects]]\n  from = "${from}"\n  to = "${to}"\n  status = 200\n`).join("\n"),
  "utf8"
);

console.log(`\n[STATIC] Done. Upload the contents of ${path.relative(ROOT, OUT)}/ to any static host.`);
console.log("[STATIC] Tip: run `npm run build:movies` first so the Movies shelves are up to date.");
