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
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
// wisp-server-node is deprecated upstream (and now warns on import); wisp-js is
// the maintained replacement from the same authors and speaks the same protocol,
// so the transports don't change. The /server entrypoint nests its API under a
// `server` namespace: routeRequest, options, ServerConnection, ...
import { server as wisp } from "@mercuryworkshop/wisp-js/server";

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
// Behind a local reverse proxy (e.g. Caddy from setup.sh) trust its X-Forwarded-*
// headers; on Vercel TLS is already terminated at their edge before we see it.
app.set("trust proxy", process.env.VERCEL ? true : "loopback");
// 512 B rather than the 1 KB default. The shell of every page is a few hundred
// bytes of HTML and CSS, and not compressing those costs a round trip's worth of
// latency for almost nothing in CPU.
app.use(compression({ threshold: 512 }));

app.use("/baremux/", express.static(baremuxPath));
app.use("/epoxy/", express.static(epoxyPath));
app.use("/libcurl/", express.static(libcurlPath));

// Long-lived caching for things that don't change between deploys. These have to
// sit before the catch-all below, or they'd get a generic cache policy and every
// visit would re-download 800-odd game covers.
const cacheFor = (maxAge, immutable = false) => ({ maxAge, immutable, fallthrough: true });
app.use("/assets/img/", express.static(path.join(publicPath, "assets/img"), cacheFor("30d", true)));
app.use("/assets/covers/", express.static(path.join(publicPath, "assets/covers"), cacheFor("12h")));
app.use("/assets/data/", express.static(path.join(publicPath, "assets/data"), cacheFor("5m")));
app.use("/assets/css/", express.static(path.join(publicPath, "assets/css"), cacheFor("10m")));
app.use("/assets/js/", express.static(path.join(publicPath, "assets/js"), cacheFor("10m")));

app.use(express.static(publicPath, { extensions: ["html"] }));
app.use("/uv/", express.static(uvPath));

// Scramjet's controller bundle plus the wasm/worker files the service worker
// pulls in. Cached hard because the wasm alone is ~520 KB and never changes.
app.use("/scramjet/", express.static(scramjetPath, { immutable: true, maxAge: "1y", fallthrough: true }));

const pages = { "/": "index.html", "/games": "games.html", "/apps": "apps.html", "/movies": "movies.html", "/browser": "browser.html" };
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
// assets are streamed straight through. The cache is deliberately generous:
// a few tens of megabytes of RAM buys a hot path that never touches GitHub, so
// the second visit to any game is served straight out of the process.
const CACHE_MAX_ENTRY = 2 * 1024 * 1024;
const gameCache = new LRUCache({
  maxSize: 48 * 1024 * 1024,
  sizeCalculation: (v) => v.length || 1,
  ttl: 1000 * 60 * 60 * 12,
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

// Wisp refuses to open tunnels into loopback or private ranges, so the proxy
// can't be turned into a door into your own network. Client IPs forwarded by a
// local reverse proxy (or Vercel's edge) are used for connection logging.
wisp.options.allow_private_ips = false;
wisp.options.allow_loopback_ips = false;
wisp.options.parse_real_ip_from = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];

const server = createServer(app);

// Keep-alive timeouts are the usual cause of "disconnected every minute".
// Node's 5 s default is shorter than the idle timeout of most reverse proxies
// (Caddy, nginx and every host's load balancer sit at 60 s), so the proxy would
// decide to reuse a connection a moment after Node had already torn it down.
// Sitting above the common 60 s ceiling keeps a single request from being
// routed onto a socket that no longer exists.
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
// Downloads (a game bundle, a movie) routinely outlive any sane request
// timeout, so the HTTP layer should never cut them off by itself.
server.requestTimeout = 0;

// A dead TCP path looks exactly like an idle one until you try to use it.
// TCP keepalive makes the kernel notice within ~30 s and error out instead of
// hanging, so the client's watchdog can reconnect immediately.
server.on("connection", (socket) => {
  socket.setKeepAlive(true, 30000);
  socket.setNoDelay(true);
});

const pingWSS = new WebSocketServer({ noServer: true, clientTracking: true, perMessageDeflate: false });pingWSS.on("connection", (ws, req) => {
  const remoteAddress = (req.socket && req.socket.remoteAddress) || "unknown";
  let latencies = [];
  let missed = 0;
  let alive = true;

  const sendPing = () => ws.send(JSON.stringify({ type: "ping", timestamp: Date.now() }));
  const pingInterval = setInterval(sendPing, 5000);
  sendPing();

  // Protocol-level heartbeat on top of the JSON one. `ws` answers pong frames
  // for us, so a socket that stops answering is closed here rather than left
  // half-open until something else trips over it.
  const beat = setInterval(() => {
    if (!alive) return ws.terminate();
    alive = false;
    missed++;
    if (missed > 1) return;
    ws.ping();
  }, 15000);

  ws.on("pong", () => {
    alive = true;
    missed = 0;
  });

  ws.on("message", (message) => {
    alive = true;
    missed = 0;
    try {
      const data = JSON.parse(message);
      if (data.type === "pong" && data.timestamp) {
        const latency = Date.now() - data.timestamp;
        latencies.push(latency);
        if (latencies.length > 60) latencies.shift();
        ws.send(JSON.stringify({ type: "latency", latency }));
      }
    } catch (error) {}
  });

  ws.on("error", () => {});
  ws.on("close", () => {
    clearInterval(pingInterval);
    clearInterval(beat);
    const avgLatency = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
    console.log(`[WS] ${new Date().toISOString()} - ${remoteAddress} disconnected. Avg latency: ${avgLatency.toFixed(2)}ms.`);
  });
});

server.on("upgrade", (req, socket, head) => {
  // Wisp tunnels carry long-lived websockets for the proxy itself; they need
  // the same keepalive treatment or a silent network blip strands them.
  socket.setKeepAlive(true, 30000);
  socket.setNoDelay(true);
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

// Vercel invokes the exported server itself (their WebSocket support expects an
// http.Server as the default export); everywhere else we bind our own port.
if (process.env.VERCEL) console.log("[BLACKWAVES] Running on Vercel.");
else server.listen(port);

export default server;
