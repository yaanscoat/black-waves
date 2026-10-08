// Games from the gmshelf/ckv collection. Files are served from our origin at
// /cdn/ckv (see index.mjs) and opened through the Ultraviolet proxy.
(function () {
  const { el, store, proxy } = window.BW;
  const CDN = "/cdn/ckv";
  const grid = document.getElementById("games-grid");
  const search = document.getElementById("games-search");
  const count = document.getElementById("games-count");
  const recentSection = document.getElementById("recent-section");
  const recentGrid = document.getElementById("recent-grid");
  let games = [];

  function play(game) {
    const recent = store.get("recent-games", []).filter((file) => file !== game.file);
    store.set("recent-games", [game.file, ...recent].slice(0, 6));
    renderRecent();
    proxy.open(location.origin + CDN + game.file, { label: `${game.title} · blackwaves games` });
  }

  function card(game) {
    const fallback = () => el("div", { class: "tile-media fallback", text: game.title.charAt(0).toUpperCase() });
    let media = fallback();
    if (game.cover) {
      // Small pre-built thumbnails (see scripts/build-games.mjs), 192px WebP.
      media = el("img", { class: "tile-media", src: game.cover, alt: "", width: "192", height: "192", loading: "lazy", decoding: "async" });
      media.addEventListener("error", () => media.replaceWith(fallback()), { once: true });
    }
    return el("button", { class: "tile", type: "button", title: game.title, onclick: () => play(game) }, [media, el("div", { class: "tile-title", text: game.title })]);
  }

  // Virtualised grid: with 800+ covers, keeping every tile (and its decoded
  // image) alive costs hundreds of MB. Only rows near the viewport are in the
  // DOM; tiles already on screen are reused so nothing flickers while scrolling.
  const view = document.getElementById("games-window");
  const OVERSCAN = 2;
  let list = [];
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

  // Dropping the src lets the browser free the decoded cover once the tile
  // has scrolled away (it's re-fetched from the HTTP cache if it comes back).
  function release(tile) {
    const img = tile.querySelector("img");
    if (img) img.removeAttribute("src");
  }

  function render() {
    for (const tile of shown.values()) release(tile);
    const q = search.value.trim().toLowerCase();
    list = q ? games.filter((g) => g.title.toLowerCase().includes(q)) : games;
    count.textContent = q ? `${list.length} of ${games.length} games` : `${games.length} games, ready to play`;
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
    const byFile = new Map(games.map((g) => [g.file, g]));
    const recent = store.get("recent-games", []).map((f) => byFile.get(f)).filter(Boolean);
    recentGrid.replaceChildren(...recent.map(card));
    recentSection.hidden = !recent.length || !!search.value.trim();
  }

  document.getElementById("games-random").addEventListener("click", () => {
    if (games.length) play(games[Math.floor(Math.random() * games.length)]);
  });
  search.addEventListener("input", render);

  fetch("/assets/data/games.json")
    .then((res) => res.json())
    .then((data) => {
      games = data.games;
      renderRecent();
      render();
    })
    .catch(() => {
      count.textContent = "Couldn't load the game library. Refresh to try again.";
    });
})();
