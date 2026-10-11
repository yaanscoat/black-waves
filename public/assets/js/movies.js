// The Movies page. Rails come from a catalogue baked at build time by
// scripts/build-movies.mjs (assets/data/movies.json); typing in the search box
// queries TMDB live so you can reach anything that isn't on the shelves.
// Every poster opens vidsrc.sh inside the proxy frame.
(function () {
  const { el, icon, proxy, toast, showLoader, store } = window.BW;
  const TMDB_KEY = "ebbc810d0c9a9a4a13a264f96897036e";
  const TMDB = "https://api.themoviedb.org/3";
  const IMG = "https://image.tmdb.org/t/p/w342";

  const rowsBox = document.getElementById("movie-rows");
  const search = document.getElementById("movies-search");
  const count = document.getElementById("movies-count");

  // ---------- Playback ----------
  // vidsrc.sh takes TMDB ids directly: /embed/movie/<id> and
  // /embed/tv/<id>/<season>/<episode>.
  function play(item) {
    const path = item.media === "tv"
      ? `https://vidsrc.sh/embed/tv/${item.tmdb}/${item.season || 1}/${item.episode || 1}`
      : `https://vidsrc.sh/embed/movie/${item.tmdb}`;
    proxy.open(path, { label: `${item.title} · movies` });
  }

  // ---------- Lazy posters ----------
  // Only images close to the viewport get a src; anything that scrolls away
  // has its src dropped again so the decoded bitmap can be reclaimed. Keeps a
  // full page of rails well under a few MB of image memory.
  const lazyObserver = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => {
        for (const entry of entries) {
          const img = entry.target;
          if (entry.isIntersecting) {
            if (img.dataset.src && !img.src) img.src = img.dataset.src;
          } else if (img.src && !entry.isIntersecting) {
            const rect = img.getBoundingClientRect();
            if (rect.bottom < -600 || rect.top > window.innerHeight + 600) img.removeAttribute("src");
          }
        }
      }, { rootMargin: "400px 0px" })
    : null;

  // ---------- Poster ----------
  function poster(item) {
    const art = el("div", { class: "poster-art" });
    const img = el("img", { alt: "", width: "342", height: "513", decoding: "async" });
    if (item.poster) {
      if (lazyObserver) {
        img.dataset.src = item.poster;
        lazyObserver.observe(img);
      } else {
        img.src = item.poster;
      }
      img.addEventListener("error", () => img.remove(), { once: true });
      art.append(img);
    } else {
      art.append(el("div", { class: "fallback-title", text: item.title }));
    }
    art.append(el("span", { class: "poster-play" }, icon("fa-solid fa-play")));

    const meta = [item.year, item.rating ? `★ ${Number(item.rating).toFixed(1)}` : ""].filter(Boolean).join(" · ");
    return el("button", { class: "poster", type: "button", title: item.title, onclick: () => play(item) }, [
      art,
      el("span", { class: "poster-title", text: item.title }),
      meta ? el("span", { class: "poster-meta", text: meta }) : null,
    ]);
  }

  // ---------- Rails ----------
  function railRow(title, note, items) {
    const rail = el("div", { class: "rail", role: "list" }, items.map(poster));
    const scroll = (dir) => rail.scrollBy({ left: dir * Math.max(240, rail.clientWidth * 0.8), behavior: "smooth" });
    return el("section", { class: "movie-row" }, [
      el("div", { class: "row-head" }, [
        el("h2", { text: title }),
        note ? el("span", { class: "row-note", text: note }) : null,
        el("div", { class: "rail-nav" }, [
          el("button", { class: "icon-btn", type: "button", title: "Scroll left", "aria-label": `Scroll ${title} left`, onclick: () => scroll(-1) }, icon("fa-solid fa-chevron-left")),
          el("button", { class: "icon-btn", type: "button", title: "Scroll right", "aria-label": `Scroll ${title} right`, onclick: () => scroll(1) }, icon("fa-solid fa-chevron-right")),
        ]),
      ]),
      rail,
    ]);
  }

  function renderRows(rows) {
    rowsBox.replaceChildren(...rows.map((row) => railRow(row.title, row.note, row.items)));
  }

  // ---------- Live search ----------
  // TMDB answers with mixed movie/TV results; both play through vidsrc.sh.
  let searchTimer = null;
  let searchToken = 0;

  async function liveSearch(query) {
    const token = ++searchToken;
    count.textContent = `Searching for “${query}”…`;
    try {
      const url = `${TMDB}/search/multi?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}&include_adult=false`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      if (token !== searchToken) return;
      const items = (data.results || [])
        .filter((r) => (r.media_type === "movie" || r.media_type === "tv") && r.poster_path)
        .slice(0, 24)
        .map((r) => ({
          title: r.title || r.name || "Untitled",
          tmdb: r.id,
          media: r.media_type,
          year: String((r.release_date || r.first_air_date || "").slice(0, 4)) || "",
          rating: r.vote_average > 0 ? r.vote_average : null,
          poster: IMG + r.poster_path,
        }));
      if (token !== searchToken) return;
      if (!items.length) {
        rowsBox.replaceChildren(el("p", { class: "empty", text: `Nothing matched “${query}”.` }));
        count.textContent = "No results";
        return;
      }
      rowsBox.replaceChildren(railRow(`${items.length} result${items.length === 1 ? "" : "s"}`, "Press Enter to search the web instead", items));
      count.textContent = `Results for “${query}”`;
    } catch (err) {
      if (token !== searchToken) return;
      console.warn("[movies] search failed:", err);
      rowsBox.replaceChildren(el("p", { class: "empty", text: "Search is unavailable right now — the shelves below still work." }));
      count.textContent = "Search unavailable";
    }
  }

  search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const q = search.value.trim();
    if (!q) {
      searchToken++;
      boot();
      return;
    }
    searchTimer = setTimeout(() => liveSearch(q), 320);
  });

  search.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      clearTimeout(searchTimer);
      const q = search.value.trim();
      if (q) liveSearch(q);
    }
    if (e.key === "Escape") {
      search.value = "";
      searchToken++;
      boot();
    }
  });

  // ---------- Boot ----------
  function boot() {
    count.textContent = "Loading the shelf…";
    fetch("/assets/data/movies.json", { cache: "force-cache" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data) => {
        const rows = data.rows || [];
        const total = rows.reduce((n, row) => n + row.items.length, 0);
        renderRows(rows);
        count.textContent = `${total} titles across ${rows.length} shelves, ready to play`;
      })
      .catch((err) => {
        console.warn("[movies] catalogue failed:", err);
        rowsBox.replaceChildren(el("p", { class: "empty", text: "The movie shelves couldn't load. Refresh to try again." }));
        count.textContent = "Couldn't load the library";
      });
  }

  boot();
})();
