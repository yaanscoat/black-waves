// Ultraviolet proxy: registers the service worker, picks the bare-mux
// transport, and drives the full-screen proxy frame.
(function () {
  const { store, toast, toUrl, showLoader } = window.BW;
  const view = document.getElementById("frame-view");
  const frame = document.getElementById("frame");
  const urlInput = document.getElementById("frame-url");
  const lock = document.querySelector("#frame-form .i use");
  const connection = new BareMux.BareMuxConnection("/baremux/worker.js");
  let pollTimer = null;
  let loaderTimer = null;

  function wispUrl() {
    return store.get("wisp", `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/w/`);
  }

  async function setTransport(name) {
    const path = name === "libcurl" ? "/libcurl/index.mjs" : "/epoxy/index.mjs";
    await connection.setTransport(path, [{ wisp: wispUrl() }]);
  }

  const ready = (async () => {
    if (!("serviceWorker" in navigator)) throw new Error("Service workers are not supported in this browser.");
    await navigator.serviceWorker.register("/sw.js", { scope: __uv$config.prefix });
    await setTransport(store.get("transport", "epoxy"));
  })();
  ready.catch((err) => {
    console.error("[blackwaves] proxy setup failed:", err);
    toast("Try another browser or turn off strict privacy mode.", "error", { title: "The proxy couldn't start", duration: 8000 });
  });

  function encode(url) {
    return __uv$config.prefix + __uv$config.encodeUrl(url);
  }

  function decode(href) {
    try {
      const url = new URL(href, location.origin);
      if (url.pathname.startsWith(__uv$config.prefix)) {
        return __uv$config.decodeUrl(url.pathname.slice(__uv$config.prefix.length)) + url.search + url.hash;
      }
    } catch {}
    return href;
  }

  // Pages served from our own origin (games) show a friendly label instead of a raw path.
  function displayUrl(href) {
    const real = decode(href);
    if (real.startsWith(location.origin + "/cdn/ckv/")) return frame.dataset.label || real;
    return real;
  }

  function syncAddress() {
    try {
      const href = frame.contentWindow.location.href;
      if (!href || href === "about:blank") return;
      if (document.activeElement !== urlInput) urlInput.value = displayUrl(href);
      const secure = decode(href).startsWith("https://") || decode(href).startsWith(location.origin);
      lock.setAttribute("href", `/assets/img/icons.svg#${secure ? "lock" : "lock-open"}`);
    } catch {}
  }

  // Ultraviolet shows its own error page when a request fails; surface it as
  // a notification too, with a hint where one helps.
  function reportProxyError() {
    try {
      const doc = frame.contentDocument;
      if (!doc || !doc.body || !/Error processing your request/.test(doc.body.innerText)) return;
      const trace = doc.querySelector("#errorTrace, textarea, pre");
      const detail = trace ? (trace.value || trace.textContent).trim().split("\n")[0].slice(0, 140) : "";
      const libcurl = store.get("transport", "epoxy") === "libcurl";
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
      await ready;
      frame.src = encode(url);
    } catch {
      showLoader(false);
      toast("Reload the page and try again.", "error", { title: "The proxy isn't ready" });
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
    frame.src = "about:blank";
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

  const history = (fn) => () => {
    try {
      fn(frame.contentWindow);
    } catch {}
  };
  document.getElementById("frame-back").addEventListener("click", history((w) => w.history.back()));
  document.getElementById("frame-forward").addEventListener("click", history((w) => w.history.forward()));
  document.getElementById("frame-reload").addEventListener("click", history((w) => w.location.reload()));
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

  window.BW.proxy = { open, close, setTransport, ready };
})();
