// The proxy: registers the service worker for the chosen engine (Scramjet by
// default, Ultraviolet as the fallback), picks the bare-mux transport and
// drives the full-screen proxy frame. Everything page-facing goes through
// window.BW.proxy so games, movies and the browser tab can all use it.
(function () {
  const { store, toast, toUrl, showLoader, defaultWisp, IS_STATIC } = window.BW;
  const view = document.getElementById("frame-view");
  const frame = document.getElementById("frame");
  const urlInput = document.getElementById("frame-url");
  const lock = document.querySelector("#frame-form .i use");
  const connection = new BareMux.BareMuxConnection("/baremux/worker.js");
  let pollTimer = null;
  let loaderTimer = null;
  let sjFrame = null;
  let activeEngine = store.get("proxy-engine", "scramjet");

  function wispUrl() {
    return defaultWisp();
  }

  async function setTransport(name) {
    const path = name === "libcurl" ? "/libcurl/index.mjs" : "/epoxy/index.mjs";
    await connection.setTransport(path, [{ wisp: wispUrl() }]);
  }

  // Scripts are loaded once and remembered so switching engines back and forth
  // never pays the download twice.
  const loaded = new Set();
  function loadScript(src) {
    if (loaded.has(src)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = () => {
        loaded.add(src);
        resolve();
      };
      script.onerror = () => reject(new Error(`Couldn't load ${src}`));
      document.head.append(script);
    });
  }

  function historyApi(action) {
    return () => {
      try {
        action(frame.contentWindow);
      } catch {}
    };
  }

  // ---------- Ultraviolet ----------
  let uvReady = null;
  const uvEngine = {
    setup() {
      if (!uvReady) {
        uvReady = (async () => {
          if (!("serviceWorker" in navigator)) throw new Error("Service workers are not supported in this browser.");
          await navigator.serviceWorker.register("/sw.js", { scope: __uv$config.prefix });
        })();
      }
      return uvReady;
    },
    navigate(url) {
      frame.src = __uv$config.prefix + __uv$config.encodeUrl(url);
    },
    decode(href) {
      try {
        const url = new URL(href, location.origin);
        if (url.pathname.startsWith(__uv$config.prefix)) {
          return __uv$config.decodeUrl(url.pathname.slice(__uv$config.prefix.length)) + url.search + url.hash;
        }
      } catch {}
      return href;
    },
    address() {
      try {
        const href = frame.contentWindow.location.href;
        return href && href !== "about:blank" ? href : null;
      } catch {
        return null;
      }
    },
    back: historyApi((w) => w.history.back()),
    forward: historyApi((w) => w.history.forward()),
    reload: historyApi((w) => w.location.reload()),
    teardown() {
      frame.src = "about:blank";
    },
  };

  // ---------- Scramjet ----------
  let scramjetReady = null;
  const scramjetEngine = {
    setup() {
      if (!scramjetReady) {
        scramjetReady = (async () => {
          if (!("serviceWorker" in navigator)) throw new Error("Service workers are not supported in this browser.");
          // scramjet.bundle.js is an ES module (it ends in a top-level `export`)
          // and explodes if injected as a classic script. scramjet.all.js is the
          // same build wrapped in an IIFE that publishes $scramjetLoadController
          // on the global, which is what a plain <script src> needs.
          await loadScript("/scramjet/scramjet.all.js");
          if (!window.$scramjetLoadController) throw new Error("Scramjet failed to load.");
          const { ScramjetController } = window.$scramjetLoadController();
          const controller = new ScramjetController({
            prefix: "/scramjet/",
            files: {
              wasm: "/scramjet/scramjet.wasm.wasm",
              all: "/scramjet/scramjet.all.js",
              sync: "/scramjet/scramjet.sync.js",
            },
          });
          await controller.init();
          await navigator.serviceWorker.register("/scramsw.js", { scope: "/" });
          this.controller = controller;
        })();
      }
      return scramjetReady;
    },
    async navigate(url) {
      await this.setup();
      if (!sjFrame || sjFrame.frame !== frame) {
        sjFrame = this.controller.createFrame(frame);
        sjFrame.addEventListener("urlchange", (event) => {
          const real = event && event.url ? String(event.url) : "";
          if (real) urlInput.value = real;
          syncLock(real);
        });
      }
      sjFrame.go(url);
    },
    decode(href) {
      try {
        return this.controller.decodeUrl(href);
      } catch {
        return href;
      }
    },
    address() {
      if (sjFrame) {
        try {
          const url = sjFrame.url;
          if (url && url.href && url.href !== "about:blank") return url.href;
        } catch {}
      }
      return null;
    },
    back() {
      if (sjFrame) sjFrame.back();
    },
    forward() {
      if (sjFrame) sjFrame.forward();
    },
    reload() {
      if (sjFrame) sjFrame.reload();
    },
    teardown() {
      sjFrame = null;
      frame.src = "about:blank";
    },
  };

  const ENGINES = { scramjet: scramjetEngine, uv: uvEngine };
  const engine = () => ENGINES[activeEngine] || ENGINES.uv;

  // One setup for the whole page. If the preferred engine can't run here we
  // fall back to Ultraviolet rather than leaving the proxy dead — a broken
  // engine should cost you a notice, not the site.
  let setupError = null;
  const ready = (async () => {
    await setTransport(store.get("transport", "libcurl"));
    try {
      await engine().setup();
    } catch (err) {
      if (activeEngine !== "scramjet") throw err;
      console.warn("[blackwaves] Scramjet couldn't start, falling back to Ultraviolet:", err);
      activeEngine = "uv";
      store.set("proxy-engine", "uv");
      await uvEngine.setup();
      toast("Scramjet can't run in this browser, so Ultraviolet is being used instead.", "warning", { duration: 7000 });
    }
  })();
  ready.catch((err) => {
    setupError = err;
    console.error("[blackwaves] proxy setup failed:", err);
    toast("Try another browser or turn off strict privacy mode.", "error", { title: "The proxy couldn't start", duration: 8000 });
  });

  function decode(href) {
    return engine().decode(href);
  }

  // Hands out a navigation handle bound to any iframe. The fullscreen frame
  // above uses it implicitly; the Browser tab calls this once per sidebar tab
  // so every tab drives the same engine without sharing one browsing context.
  async function bind(iframe) {
    await engine().setup();
    if (activeEngine === "scramjet") {
      const sj = scramjetEngine.controller.createFrame(iframe);
      return {
        engine: "scramjet",
        go: (url) => sj.go(url),
        back: () => sj.back(),
        forward: () => sj.forward(),
        reload: () => sj.reload(),
        address: () => {
          try {
            const url = sj.url;
            return url && url.href && url.href !== "about:blank" ? url.href : null;
          } catch {
            return null;
          }
        },
        decode: (h) => {
          try {
            return scramjetEngine.controller.decodeUrl(h);
          } catch {
            return h;
          }
        },
        onUrlChange: (fn) => sj.addEventListener("urlchange", (e) => e && e.url && fn(String(e.url))),
      };
    }
    return {
      engine: "uv",
      go: (url) => {
        iframe.src = __uv$config.prefix + __uv$config.encodeUrl(url);
      },
      back: () => {
        try {
          iframe.contentWindow.history.back();
        } catch {}
      },
      forward: () => {
        try {
          iframe.contentWindow.history.forward();
        } catch {}
      },
      reload: () => {
        try {
          iframe.contentWindow.location.reload();
        } catch {}
      },
      address: () => {
        try {
          const href = iframe.contentWindow.location.href;
          return href && href !== "about:blank" ? uvEngine.decode(href) : null;
        } catch {
          return null;
        }
      },
      decode: (h) => uvEngine.decode(h),
      onUrlChange: null,
    };
  }

  // Games come from one of two hosts depending on the build; showing their raw
  // URL in the frame bar would just be noise, so the label wins instead.
  const GAME_CDN = IS_STATIC ? "https://cdn.jsdelivr.net/gh/gmshelf/ckv@" : `${location.origin}/cdn/ckv/`;
  function displayUrl(href) {
    const real = decode(href);
    if (real.startsWith(GAME_CDN)) return frame.dataset.label || real;
    return real;
  }

  function syncLock(real) {
    if (!lock) return;
    const secure = real.startsWith("https://") || real.startsWith(location.origin);
    lock.setAttribute("href", `/assets/img/icons.svg#${secure ? "lock" : "lock-open"}`);
  }

  function syncAddress() {
    const href = engine().address();
    if (!href) return;
    const shown = displayUrl(href);
    if (document.activeElement !== urlInput) urlInput.value = shown;
    syncLock(decode(href));
  }

  // Ultraviolet shows its own error page when a request fails; surface it as
  // a notification too, with a hint where one helps.
  function reportProxyError() {
    if (activeEngine !== "uv") return;
    try {
      const doc = frame.contentDocument;
      if (!doc || !doc.body || !/Error processing your request/.test(doc.body.innerText)) return;
      const trace = doc.querySelector("#errorTrace, textarea, pre");
      const detail = trace ? (trace.value || trace.textContent).trim().split("\n")[0].slice(0, 140) : "";
      const libcurl = store.get("transport", "libcurl") === "libcurl";
      toast(libcurl ? "Libcurl can't load this. Switch the transport to Epoxy in Settings." : detail || "The site couldn't be reached through the proxy.", "error", { title: "Couldn't load that page", duration: 8000 });
    } catch {}
  }

  async function open(input, { label } = {}) {
    const url = toUrl(input);
    frame.dataset.label = label || "";
    view.classList.add("open", "blank");
    document.body.style.overflow = "hidden";
    urlInput.value = label || url;
    showLoader(true);
    clearTimeout(loaderTimer);
    loaderTimer = setTimeout(() => showLoader(false), 20000);
    try {
      await engine().setup();
      await engine().navigate(url);
    } catch (err) {
      showLoader(false);
      console.error("[blackwaves] navigation failed:", err);
      if (setupError) toast("Reload the page and try again.", "error", { title: "The proxy isn't ready" });
      else toast("The proxy couldn't reach that address. Try again in a moment.", "error", { title: "Navigation failed" });
      return;
    }
    clearInterval(pollTimer);
    pollTimer = setInterval(syncAddress, 800);
    if (!sessionStorage.getItem("bw:discord-hint")) {
      sessionStorage.setItem("bw:discord-hint", "1");
      toast(`Enjoying Blackwaves? Join our <a href="${window.BW.DISCORD}" target="_blank" rel="noopener">Discord</a>.`, "discord", { html: true, duration: 6000 });
    }
  }

  function close() {
    clearInterval(pollTimer);
    clearTimeout(loaderTimer);
    showLoader(false);
    engine().teardown();
    view.classList.remove("open");
    document.body.style.overflow = "";
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  frame.addEventListener("load", () => {
    if (frame.src === "about:blank" || !view.classList.contains("open")) return;
    view.classList.remove("blank");
    clearTimeout(loaderTimer);
    showLoader(false);
    syncAddress();
    reportProxyError();
  });

  document.getElementById("frame-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (urlInput.value.trim()) open(urlInput.value);
    urlInput.blur();
  });
  urlInput.addEventListener("focus", () => urlInput.select());

  document.getElementById("frame-back").addEventListener("click", () => engine().back());
  document.getElementById("frame-forward").addEventListener("click", () => engine().forward());
  document.getElementById("frame-reload").addEventListener("click", () => engine().reload());
  document.getElementById("frame-close").addEventListener("click", close);

  document.getElementById("frame-fullscreen").addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else (frame.requestFullscreen || frame.webkitRequestFullscreen).call(frame);
  });

  document.getElementById("frame-popout").addEventListener("click", () => {
    let src = frame.src;
    try {
      src = frame.contentWindow.location.href;
    } catch {}
    const popup = window.open("about:blank", "_blank");
    if (!popup) return toast("Pop-up blocked. Allow pop-ups for this site and try again.", "error");
    popup.document.title = document.title;
    const inner = popup.document.createElement("iframe");
    inner.src = src;
    inner.allow = frame.allow;
    inner.style.cssText = "position:fixed;inset:0;width:100%;height:100%;border:0;";
    popup.document.body.style.margin = "0";
    popup.document.body.append(inner);
  });

  document.getElementById("frame-devtools").addEventListener("click", () => {
    try {
      const win = frame.contentWindow;
      if (win.eruda) {
        win.eruda._isInit ? win.eruda.destroy() : (win.eruda.init(), win.eruda.show());
        return;
      }
      const script = win.document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/eruda@3.4.3/eruda.min.js";
      script.onload = () => {
        win.eruda.init();
        win.eruda.show();
      };
      script.onerror = () => toast("Couldn't load developer tools.", "error");
      win.document.head.append(script);
    } catch {
      toast("Developer tools aren't available on this page.", "error");
    }
  });

  // Changing engine from Settings tears the old one down and warms the new one
  // up so the next page opened already has its service worker registered.
  async function setEngine(name) {
    const next = ENGINES[name] ? name : "scramjet";
    if (next === activeEngine) return;
    activeEngine = next;
    store.set("proxy-engine", next);
    close();
    try {
      await ENGINES[next].setup();
      toast(`${next === "scramjet" ? "Scramjet" : "Ultraviolet"} is ready.`, "success");
    } catch (err) {
      console.error("[blackwaves] engine setup failed:", err);
      toast("That engine couldn't start. Try the other one in Settings.", "error");
    }
  }
  document.addEventListener("bw:proxy-engine", (e) => setEngine(e.detail));

  window.BW.proxy = { open, close, setTransport, setEngine, ready, bind, decode: (h) => decode(h) };
})();
