// The Games page. Two switchable providers:
//   ckv — the gmshelf/ckv collection, served from our own origin at /cdn/ckv
//   gnm — the GN-Math catalogue, served through /cdn/gh (or jsDelivr on
//         static builds) and opened through the proxy like everything else.
// The grid is virtualised: with 800+ covers, keeping every tile in the DOM
// costs hundreds of MB, so only rows near the viewport exist at any time.
(function () {
  const { el, store, proxy, toast, IS_STATIC, GAME_PROVIDERS } = window.BW;

  // Static builds have no /cdn proxy of their own, so they talk to jsDelivr
  // directly. Self-hosted builds proxy raw.githubusercontent.com instead, which
  // also gives real content types and long cache headers to files GitHub would
  // otherwise hand over as text/plain. Both must be absolute, because GN-Math
  // URLs get used on their own rather than appended to the origin.
  const GH = IS_STATIC ? "https://cdn.jsdelivr.net/gh" : `${location.origin}/cdn/gh`;
  const CKV = IS_STATIC ? "https://cdn.jsdelivr.net/gh/gmshelf/ckv@main" : `${location.origin}/cdn/ckv`;
  const PROVIDERS = {
    ckv: {
      async load() {
        const res = await fetch("/assets/data/games.json");
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        return (data.games || []).map((game) => ({
          id: game.file,
          title: game.title,
          cover: game.cover,
          href: CKV + game.file,
          label: `${game.title} · blackwaves games`,
        }));
      },
    },
    gnm: {
      async load() {
        const res = await fetch(`${GH}/gn-math/assets@latest/zones.json`);
        if (!res.ok) throw new Error(String(res.status));
        const zones = await res.json();
        return zones
          .filter((zone) => zone && typeof zone.name === "string" && !zone.name.startsWith("[!]"))
          .map((zone) => ({
            id: `gnm:${zone.id}`,
            title: zone.name,
            cover: String(zone.cover || "").replace("{COVER_URL}", `${GH}/gn-math/covers@main`),
            // zones.json uses {HTML_URL} as a placeholder for wherever the html
            // tree is being served from; strip it and rebuild against our base.
            href: String(zone.url || "").startsWith("http")
              ? zone.url
              : `${GH}/gn-math/html@main${String(zone.url || "").replace("{HTML_URL}", "")}`,
            label: `${zone.name} · GN-Math`,
            external: String(zone.url || "").startsWith("http"),
          }));
      },
    },
  };

  const grid = document.getElementById("games-grid");
  const view = document.getElementById("games-window");
  const search = document.getElementById("games-search");
  const count = document.getElementById("games-count");
  const recentSection = document.getElementById("recent-section");
  const recentGrid = document.getElementById("recent-grid");
  const randomBtn = document.getElementById("games-random");
  const providerMount = document.getElementById("games-provider");

  let provider = GAME_PROVIDERS[store.get("game-provider", "ckv")] ? store.get("game-provider", "ckv") : "ckv";
  let games = [];
  let list = [];
  let token = 0;

  // ---------- Provider picker ----------
  const providerSelect = window.BW.dropdown(Object.entries(GAME_PROVIDERS), provider, (value) => {
    provider = value;
    store.set("game-provider", value);
    document.dispatchEvent(new CustomEvent("bw:game-provider", { detail: value }));
    load();
    toast(`Games now come from ${GAME_PROVIDERS[value]}.`, "success");
  }, { label: "Game provider" });
  providerSelect.classList.add("select");
  if (providerMount) providerMount.append(providerSelect);
  document.addEventListener("bw:game-provider", (e) => {
    if (e.detail !== provider) {
      provider = e.detail;
      providerSelect.setValue(provider);
      load();
    }
  });

  // ---------- Playing ----------
  function play(game) {
    const key = `${provider}:${game.id}`;
    const recent = store.get("recent-games", []).filter((entry) => entry.key !== key);
    store.set("recent-games", [{ key, provider, title: game.title, cover: game.cover, href: game.href, label: game.label }, ...recent].slice(0, 6));
    renderRecent();
    proxy.open(game.href, { label: game.label });
  }

  function card(game) {
    const fallback = () => el("div", { class: "tile-media fallback", text: game.title.charAt(0).toUpperCase() });
    let media = fallback();
    if (game.cover) {
      media = el("img", { class: "tile-media", src: game.cover, alt: "", width: "192", height: "192", loading: "lazy", decoding: "async" });
      media.addEventListener("error", () => media.replaceWith(fallback()), { once: true });
    }
    return el("button", { class: "tile", type: "button", title: game.title, onclick: () => play(game) }, [media, el("div", { class: "tile-title", text: game.title })]);
  }

  // ---------- Virtualised grid ----------
  const OVERSCAN = 2;
  let cols = 1, gap = 16, rowH = 0;
  let shown = new Map();
  let range = "";

  function columns() {
    const small = window.innerWidth <= 480;
    const min = small ? 118 : 156;
    gap = small ? 10 : 16;
    cols = Math.max(1, Math.floor((grid.clientWidth + gap) / (min + gap)));
  }

  function update(force) {
    if (!list.length) return;
    if (!rowH) {
      // Measure one real row to learn the row height.
      view.replaceChildren(...list.slice(0, cols).map(card));
      rowH = view.firstElementChild.offsetHeight + gap;
      shown = new Map();
      force = true;
    }
    const rows = Math.ceil(list.length / cols);
    grid.style.height = `${rows * rowH - gap}px`;
    const top = grid.getBoundingClientRect().top;
    const first = Math.max(0, Math.floor(-top / rowH) - OVERSCAN);
    const last = Math.min(rows, Math.ceil((window.innerHeight - top) / rowH) + OVERSCAN);
    const key = `${first}:${last}:${cols}`;
    if (!force && key === range) return;
    range = key;
    const next = new Map();
    for (let i = first * cols; i < Math.min(list.length, last * cols); i++) next.set(i, shown.get(i) || card(list[i]));
    for (const [i, tile] of shown) if (!next.has(i)) release(tile);
    shown = next;
    view.style.transform = `translateY(${first * rowH}px)`;
    view.replaceChildren(...next.values());
  }

  // Dropping the src lets the browser free the decoded cover once the tile has
  // scrolled away (it's re-fetched from the HTTP cache if it comes back).
  function release(tile) {
    const img = tile.querySelector("img");
    if (img) img.removeAttribute("src");
  }

  function render() {
    for (const tile of shown.values()) release(tile);
    const q = search.value.trim().toLowerCase();
    list = q ? games.filter((g) => g.title.toLowerCase().includes(q)) : games;
    const providerName = GAME_PROVIDERS[provider] || provider;
    count.textContent = q
      ? `${list.length} of ${games.length} games`
      : `${games.length} games from ${providerName}, ready to play`;
    recentSection.hidden = !!q || !recentGrid.childElementCount;
    shown = new Map();
    range = "";
    if (!list.length) {
      grid.style.height = "";
      view.style.transform = "";
      view.replaceChildren(el("p", { class: "empty", text: "No games match that search." }));
      return;
    }
    columns();
    update(true);
  }

  function load() {
    const mine = ++token;
    games = [];
    list = [];
    shown = new Map();
    range = "";
    rowH = 0;
    grid.style.height = "";
    view.style.transform = "";
    view.replaceChildren(el("p", { class: "empty", text: `Loading ${GAME_PROVIDERS[provider]}…` }));
    recentSection.hidden = true;
    PROVIDERS[provider]
      .load()
      .then((loaded) => {
        if (mine !== token) return;
        games = loaded;
        renderRecent();
        render();
      })
      .catch((err) => {
        if (mine !== token) return;
        console.warn(`[games] ${provider} failed:`, err);
        count.textContent = "Couldn't load the game library. Refresh to try again.";
        view.replaceChildren(el("p", { class: "empty", text: "That library couldn't be reached right now. Try the other provider in Settings." }));
      });
  }

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      update(false);
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", () => {
    columns();
    rowH = 0;
    update(true);
  });

  function renderRecent() {
    const entries = store.get("recent-games", []);
    const current = entries.filter((entry) => entry.provider === provider);
    const resolved = current.map((entry) => games.find((g) => `${provider}:${g.id}` === entry.key)).filter(Boolean);
    recentGrid.replaceChildren(...resolved.map(card));
    recentSection.hidden = !resolved.length || !!search.value.trim();
  }

  if (randomBtn) randomBtn.addEventListener("click", () => games.length && play(games[Math.floor(Math.random() * games.length)]));
  search.addEventListener("input", render);

  load();
})();
