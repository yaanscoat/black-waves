import express from "express";
import { createServer } from "http";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import compression from "compression";
import { WebSocketServer } from "ws";
import { LRUCache } from "lru-cache";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { uvPath } from "@titaniumnetwork-dev/ultraviolet";
import wisp from "wisp-server-node";

const __dirname = process.cwd();

const publicPath = path.join(__dirname, "public");
const port = parseInt(process.env.PORT || "3000");
const GAMES_RAW = "https://raw.githubusercontent.com/gmshelf/ckv/main";

// GitHub fetch with one retry on network errors (connect timeouts, resets).
async function upstreamFetch(url, init) {
  try {
    return await fetch(url, init);
  } catch {
    return fetch(url, init);
  }
}

const app = express();
app.disable("x-powered-by");
// Behind a local reverse proxy (e.g. Caddy from setup.sh), trust its X-Forwarded-* headers.
app.set("trust proxy", "loopback");
app.use(compression());

app.use("/baremux/", express.static(baremuxPath));
app.use("/epoxy/", express.static(epoxyPath));
app.use("/libcurl/", express.static(libcurlPath));
app.use(express.static(publicPath, { extensions: ["html"] }));
app.use("/uv/", express.static(uvPath));

const pages = { "/": "index.html", "/games": "games.html", "/apps": "apps.html" };
for (const [route, file] of Object.entries(pages)) {
  app.get(route, (req, res) => res.sendFile(path.join(publicPath, file)));
}

// --- Games: serve GitHub-hosted game files from our origin -------------------
// GitHub's raw host sends everything as text/plain, so games can't be loaded
// from it directly. We fetch, cache, and re-serve them with real content types.
// Many games pull assets from jsDelivr/githack, which have blocked a lot of the
// GitHub accounts involved, so those URLs are rewritten to fetch from GitHub
// through /cdn/gh/<user>/<repo>@<ref>/<path> instead.
const MIME = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8", js: "text/javascript", mjs: "text/javascript",
  css: "text/css", json: "application/json", wasm: "application/wasm", png: "image/png", jpg: "image/jpeg",
  jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", ico: "image/x-icon",
  mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", mp4: "video/mp4", webm: "video/webm",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", txt: "text/plain; charset=utf-8", xml: "application/xml",
  otf: "font/otf", m4a: "audio/mp4", swf: "application/x-shockwave-flash", zip: "application/zip",
  gz: "application/gzip", br: "application/octet-stream", glb: "model/gltf-binary", gltf: "model/gltf+json",
  data: "application/octet-stream", unityweb: "application/octet-stream", pck: "application/octet-stream",
};
const TEXT_EXT = new Set(["html", "htm", "js", "mjs", "css", "json"]);
// Rewritten to absolute URLs: some loaders (e.g. Unity) prepend their base path
// to anything that isn't absolute.
const GH_REWRITES = [
  [/(?:https?:)?\/\/cdn\.jsdelivr\.net\/gh\//g, "/cdn/gh/"],
  [/(?:https?:)?\/\/(?:raw|rawcdn)\.githack\.com\/([\w.-]+)\/([\w.-]+)\/([\w.-]+)\//g, "/cdn/gh/$1/$2@$3/"],
];

function rewriteGitHubUrls(body, origin) {
  let text = body.toString("utf8");
  for (const [pattern, replacement] of GH_REWRITES) text = text.replace(pattern, origin + replacement);
  return text;
}
// Only small files (pages, scripts, covers) are cached in memory; big game
// assets are streamed straight through so they never sit in RAM.
const CACHE_MAX_ENTRY = 512 * 1024;
const gameCache = new LRUCache({
  maxSize: 24 * 1024 * 1024,
  sizeCalculation: (v) => v.length || 1,
  ttl: 1000 * 60 * 60 * 6,
});

function safePath(rel) {
  return rel && !/[\x00-\x1f\\]/.test(rel) && !rel.split("/").some((part) => part === ".." || part === ".");
}

async function serveGitHub(req, res, rawUrl, rel) {
  const ext = rel.includes(".") ? rel.split(".").pop().toLowerCase() : "";
  const isText = TEXT_EXT.has(ext);
  const send = (body) => res.send(isText ? rewriteGitHubUrls(body, `${req.protocol}://${req.get("host")}`) : body);
  res.set("Content-Type", MIME[ext] || "application/octet-stream");
  res.set("Cache-Control", "public, max-age=86400");
  res.set("Access-Control-Allow-Origin", "*");
  try {
    const cached = gameCache.get(rawUrl);
    if (cached) return send(cached);
    const upstream = await upstreamFetch(rawUrl);
    if (!upstream.ok) {
      upstream.body?.cancel();
      return res.sendStatus(upstream.status === 404 ? 404 : 502);
    }
    const length = Number(upstream.headers.get("content-length")) || 0;
    if (!isText && (!length || length > CACHE_MAX_ENTRY)) {
      if (length) res.set("Content-Length", String(length));
      await pipeline(Readable.fromWeb(upstream.body), res);
      return;
    }
    const body = Buffer.from(await upstream.arrayBuffer());
    if (body.length <= CACHE_MAX_ENTRY) gameCache.set(rawUrl, body);
    send(body);
  } catch (err) {
    if (err.code === "ERR_STREAM_PREMATURE_CLOSE") return;
    console.error(`[GAMES] ${rawUrl}: ${err.message}`);
    if (!res.headersSent) res.sendStatus(502);
    else res.destroy();
  }
}

const encodePath = (rel) => rel.split("/").map(encodeURIComponent).join("/");

// The gmshelf/ckv catalog itself: /cdn/ckv/ckv/<game>.html, /cdn/ckv/covers/<img>
app.get("/cdn/ckv/*file", (req, res) => {
  const rel = req.params.file.join("/");
  if (!safePath(rel)) return res.sendStatus(400);
  serveGitHub(req, res, `${GAMES_RAW}/${encodePath(rel)}`, rel);
});

// jsDelivr-style GitHub paths: /cdn/gh/<user>/<repo>[@<ref>]/<path>
app.get("/cdn/gh/:user/:repo/*file", (req, res) => {
  const { user } = req.params;
  const [repo, ref = "HEAD"] = req.params.repo.split("@");
  const rel = req.params.file.join("/");
  if (!/^[\w.-]+$/.test(user) || !/^[\w.-]+$/.test(repo) || !/^[\w.\-/]+$/.test(ref) || !safePath(rel)) return res.sendStatus(400);
  const branch = ref === "latest" ? "HEAD" : ref;
  serveGitHub(req, res, `https://raw.githubusercontent.com/${user}/${repo}/${branch}/${encodePath(rel)}`, rel);
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(publicPath, "404.html"));
});

const server = createServer(app);

const pingWSS = new WebSocketServer({ noServer: true });
pingWSS.on("connection", (ws, req) => {
  const remoteAddress = (req.socket && req.socket.remoteAddress) || "unknown";
  let latencies = [];
  const sendPing = () => ws.send(JSON.stringify({ type: "ping", timestamp: Date.now() }));
  const pingInterval = setInterval(sendPing, 5000);
  sendPing();

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === "pong" && data.timestamp) {
        const latency = Date.now() - data.timestamp;
        latencies.push(latency);
        ws.send(JSON.stringify({ type: "latency", latency }));
      }
    } catch (error) {}
  });

  ws.on("close", () => {
    clearInterval(pingInterval);
    const avgLatency = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
    console.log(`[WS] ${new Date().toISOString()} - ${remoteAddress} disconnected. Avg latency: ${avgLatency.toFixed(2)}ms.`);
  });
});

server.on("upgrade", (req, socket, head) => {
  if (req.url === "/w/ping") {
    pingWSS.handleUpgrade(req, socket, head, (ws) => {
      pingWSS.emit("connection", ws, req);
    });
  } else if (req.url.startsWith("/w/")) {
    wisp.routeRequest(req, socket, head);
  } else {
    socket.end();
  }
});

server.on("listening", () => {
  const address = server.address();
  if (address && typeof address === "object") {
    console.log(`[BLACKWAVES] Running at http://localhost:${address.port}`);
  } else {
    console.error("[BLACKWAVES] Failed to start.");
  }
});

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

async function shutdown(signal) {
  console.log(`[SHUTDOWN] ${new Date().toISOString()} - ${signal} received. Shutting down...`);
  setTimeout(() => process.exit(0), 3000).unref();
  try {
    for (const client of pingWSS.clients) client.terminate();
    const closing = closeServer(server, "HTTP server");
    server.closeAllConnections();
    await closing;
    console.log("[SHUTDOWN] Servers shut down successfully.");
    process.exit(0);
  } catch (err) {
    console.error(`[SHUTDOWN ERROR] ${err.message}`);
    process.exit(1);
  }
}

function closeServer(server, name) {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) {
        console.error(`[CLOSE ERROR] ${name}: ${err.message}`);
        reject(err);
      } else {
        console.log(`[CLOSE] ${name} closed.`);
        resolve();
      }
    });
  });
}

server.listen(port);
