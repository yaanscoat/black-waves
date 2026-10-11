# Black-waves

A clean, heavily customisable UBG-style web proxy — with games, movies and a sidebar browser on top.

[![Join the Discord](https://invidget.switchblade.xyz/Un24M9gnpN)](https://discord.gg/Un24M9gnpN)

> [!NOTE]
> Black-waves is in its early stages. If you hit a bug, tell us on Discord.

> [!IMPORTANT]
> If you fork this, please consider giving the repository a star! &lt;3

---

## Feautures

- Slick glass UI
- Fast proy and transport
- The tuffest UBG web proxy to exist
- SO MUCH MORE DAWG

---

## Supported sites

- [Google](https://google.com)
- [Spotify](https://spotify.com)
- [Discord](https://discord.com)
- [Reddit](https://reddit.com)
- [GeForce NOW](https://play.geforcenow.com/)
- [TikTok](https://www.tiktok.com)

---

## Running it

Requires latest version of node/npm or bun.

```bash
git clone https://github.com/yaanscoat/black-waves
cd black-waves
npm install
npm start          # http://localhost:3000
```

`npm run dev` runs it under nodemon.

## Deploying

>[!WARNING]
>Blackwaves can now be deployed on static hosting websites!

### Self-hosted (Linux)

```bash
CADDY_EMAIL=you@example.com sh setup.sh
```

### Vercel

`vercel.json` is already wired up: the whole app — pages, `/cdn`, `/uv`, `/scramjet` and the Wisp websocket at `/w/` — runs from a single Node function.

```bash
npm i -g vercel
vercel deploy
```

Notes:

- Vercel's WebSocket support is still in **public beta** (since June 2026) and needs **Fluid Compute**, which is on by default for projects created after April 2025. On older projects, enable it under *Settings → Functions* and redeploy.
- Connections are capped at **5 minutes** by default (30 minutes on Pro/Enterprise). That's fine here — the client reconnects on its own, and the watchdog keeps the "Disconnected" toast from firing during the handover.
- If you'd rather not rely on the beta, set the `WISP_URL` env var and deploy the static build instead (below).

### Static hosting

```bash
npm run build:movies          # optional: refresh the movie shelves
npm run build:static
```

That writes a self-contained `dist/` you can upload to GitHub Pages, Netlify, Cloudflare Pages or a plain nginx folder. Rewrite rules for all three are generated for you (`_redirects`, `vercel.json`, `netlify.toml`).

There is no backend, so the build:

- flips `BW_CONFIG.static` to `true`, and the front end stops looking for `/w`, `/cdn` and `/movies`;
- opens its Wisp socket on a public server instead of this origin (default `wss://wisp.mercurywork.shop/`);
- talks to jsDelivr for the game libraries instead of the local `/cdn` proxy.

Both are overridable:

```bash
WISP_URL=wss://wisp.example.com/  npm run build:static   # your own Wisp endpoint
PUBLIC_ORIGIN=/blackwaves          npm run build:static   # deployed under a sub-path
```

`PUBLIC_ORIGIN` rewrites both service worker registrations, which have to be served from the domain root.

---

## Configuration

`public/assets/js/config.js` is the single runtime config, and `build:static` rewrites it in the output:

```js
window.BW_CONFIG = {
  static: false,                  // true on static builds
  wisp: null,                     // null = this origin's own /w/
  publicWisp: "wss://wisp.mercurywork.shop/",
};
```

The movie catalogue is generated at build time by `scripts/build-movies.mjs`. It reads `TMDB_API_KEY` from the environment and falls back to a built-in key if that's unset. The key is a public, read-only one and it does ship to the browser so the search box can query TMDB live — swap in your own if you'd rather.

---

## Versioning

Black-waves is at **v0.1.0**. The changelog lives in *Settings → About*, backed by `public/assets/data/changelog.json`.

Every five entries logged under `pending` gets folded into a release and moves the patch version forward by one:

```bash
npm run bump          # 0.1.0 -> 0.1.1 once five entries are waiting
npm run bump -- --dry # show what would happen without writing anything
```

The bump rewrites `changelog.json`, `package.json` and the `VERSION` constant in `assets/js/core.js` together, so the three can't drift.

---

## Credits

- [gmshelf](https://github.com/gmshelf/ckv) — the CKV game collection
- [GN-Math](https://github.com/gn-math) — the GN-Math game library
- [Titanium Network](https://github.com/titaniumnetwork-dev/ultraviolet) — Ultraviolet
- [Mercury Workshop](https://github.com/mercuryworkshop) — Scramjet, bare-mux, libcurl, epoxy and wisp-js
- [vidsrc.sh](https://vidsrc.sh) — movie and TV playback
- [TMDB](https://www.themoviedb.org/) — movie metadata
- [Font Awesome Free](https://fontawesome.com/) — icons (CC BY 4.0)

## License

This project is licensed under the [Blackwaves LICENSE-1.0](LICENSE).
