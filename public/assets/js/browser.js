// Sidebar-tab browser. Each tab owns exactly one proxied iframe; switching away
// from a tab for more than a minute discards it (the iframe is removed from the
// DOM entirely and rebuilt on return), so half a dozen open sites still cost
// roughly what a single page does.
(function () {
  const { el, icon, store, toUrl, toast, proxy, openSettings, showLoader } = window.BW;

  const MAX_TABS = 6;
  const DISCARD_MS = 60000;

  const railTabs = document.getElementById("rail-tabs");
  const views = document.getElementById("browser-views");
  const blank = document.getElementById("browser-blank");
  const addressForm = document.getElementById("b-form");
  const addressInput = document.getElementById("b-url");

  let tabs = [];
  let activeId = null;
  let nextId = 1;
  let pollTimer = null;

  // ---------- Tabs ----------
  function newTab(url, { activate = true } = {}) {
    if (tabs.length >= MAX_TABS) {
      toast(`Close a tab first — Blackwaves keeps at most ${MAX_TABS} open so memory stays low.`, "warning", { title: "Tab limit reached" });
      return null;
    }
    const tab = { id: nextId++, url: url || "", title: url ? hostOf(url) : "New tab", iframe: null, handle: null, frame: null, blank: !url, timer: null };
    tabs.push(tab);
    renderRail();
    if (activate) activateTab(tab.id);
    return tab;
  }

  function closeTab(id) {
    const index = tabs.findIndex((t) => t.id === id);
    if (index < 0) return;
    const [tab] = tabs.splice(index, 1);
    discard(tab, true);
    if (!tabs.length) {
      newTab();
      return;
    }
    if (activeId === id) activateTab(tabs[Math.min(index, tabs.length - 1)].id);
    else renderRail();
  }

  // Tearing the iframe out of the document destroys its browsing context, which
  // is the only reliable way to give the memory back.
  function discard(tab, force = false) {
    clearTimeout(tab.timer);
    tab.timer = null;
    if (!tab.iframe) return;
    if (force || tab.id !== activeId) {
      tab.iframe.remove();
      tab.iframe = null;
      tab.handle = null;
      tab.restored = false;
    }
  }

  function armDiscard(tab) {
    clearTimeout(tab.timer);
    if (tab.blank) return;
    tab.timer = setTimeout(() => discard(tab), DISCARD_MS);
  }

  function hostOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "New tab";
    }
  }

  // ---------- Rendering ----------
  function faviconFor(url) {
    try {
      const host = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(host)}`;
    } catch {
      return "";
    }
  }

  function renderRail() {
    railTabs.replaceChildren(
      ...tabs.map((tab) => {
        const selected = tab.id === activeId;
        const mark = tab.blank
          ? el("span", { class: "favicon blank" }, icon("fa-solid fa-window-maximize"))
          : el("span", { class: "favicon", ...(faviconFor(tab.url) ? { style: `background-image:url("${faviconFor(tab.url)}")` } : {}) });
        return el(
          "button",
          {
            class: "rail-tab",
            type: "button",
            role: "tab",
            "aria-selected": String(selected),
            title: tab.title,
            onclick: () => activateTab(tab.id),
          },
          [
            mark,
            el("span", { class: "title", text: tab.title }),
            el("button", { class: "close", type: "button", title: "Close tab", "aria-label": `Close ${tab.title}`, onclick: (e) => { e.stopPropagation(); closeTab(tab.id); } }, icon("fa-solid fa-xmark")),
          ]
        );
      })
    );
  }

  function activateTab(id) {
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;
    if (activeId !== null && activeId !== id) {
      const previous = tabs.find((t) => t.id === activeId);
      if (previous) armDiscard(previous);
    }
    activeId = id;
    renderRail();

    for (const other of tabs) {
      if (other.iframe) other.iframe.hidden = other.id !== id;
    }

    if (tab.blank || !tab.url) {
      blank.hidden = false;
      addressInput.value = "";
      stopPolling();
      return;
    }
    blank.hidden = true;
    ensureFrame(tab);
    syncAddress();
    startPolling();
  }

  function ensureFrame(tab) {
    if (tab.iframe) {
      tab.iframe.hidden = false;
      return;
    }
    clearTimeout(tab.timer);
    const iframe = el("iframe", { title: tab.title || "Proxied page", allow: "fullscreen; autoplay; clipboard-write; encrypted-media; picture-in-picture; gamepad" });
    for (const other of tabs) if (other.iframe && other.id !== tab.id) other.iframe.hidden = true;
    views.insertBefore(iframe, blank);
    tab.iframe = iframe;
    tab.handle = null;
    proxy
      .bind(iframe)
      .then((handle) => {
        if (tab.iframe !== iframe) return;
        tab.handle = handle;
        if (handle.onUrlChange) handle.onUrlChange((url) => onTabUrl(tab, url));
        handle.go(tab.url);
        tab.restored = true;
        showLoader(true);
        setTimeout(() => showLoader(false), 15000);
      })
      .catch((err) => {
        console.error("[browser] bind failed:", err);
        toast("Reload the page and try again.", "error", { title: "The proxy isn't ready" });
      });
    iframe.addEventListener("load", () => {
      if (tab.id !== activeId) return;
      showLoader(false);
      syncAddress();
      refreshTitle(tab);
    });
    startPolling();
  }

  function refreshTitle(tab) {
    if (!tab.iframe) return;
    let title = "";
    try {
      title = (tab.iframe.contentDocument && tab.iframe.contentDocument.title) || "";
    } catch {}
    const next = title.trim().slice(0, 80) || hostOf(tab.url);
    if (next && next !== tab.title) {
      tab.title = next;
      renderRail();
    }
  }

  function onTabUrl(tab, url) {
    if (!url) return;
    tab.url = url;
    if (tab.id === activeId) {
      syncAddress();
      refreshTitle(tab);
      renderRail();
    }
  }

  function activeTab() {
    return tabs.find((t) => t.id === activeId) || null;
  }

  function syncAddress() {
    const tab = activeTab();
    if (!tab || !tab.handle) return;
    const real = tab.handle.address();
    if (!real) return;
    if (real !== tab.url) tab.url = real;
    if (document.activeElement !== addressInput) addressInput.value = real;
    if (tab.title === hostOf(real) || tab.blank) refreshTitle(tab);
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(() => {
      const tab = activeTab();
      if (!tab || !tab.handle) return stopPolling();
      syncAddress();
    }, 900);
  }

  function stopPolling() {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  // ---------- Navigation ----------
  function navigate(input) {
    const raw = input.trim();
    if (!raw) return;
    const tab = activeTab() || newTab();
    if (!tab) return;
    const url = toUrl(raw);
    tab.url = url;
    tab.blank = false;
    if (tab.title === "New tab") tab.title = hostOf(url);
    blank.hidden = true;
    renderRail();
    if (!tab.iframe) {
      activateTab(tab.id);
      return;
    }
    if (!tab.handle) return;
    showLoader(true);
    setTimeout(() => showLoader(false), 15000);
    tab.handle.go(url);
    startPolling();
  }

  addressForm.addEventListener("submit", (e) => {
    e.preventDefault();
    navigate(addressInput.value);
    addressInput.blur();
  });
  addressInput.addEventListener("focus", () => addressInput.select());

  document.getElementById("b-back").addEventListener("click", () => { const t = activeTab(); t && t.handle && t.handle.back(); });
  document.getElementById("b-forward").addEventListener("click", () => { const t = activeTab(); t && t.handle && t.handle.forward(); });
  document.getElementById("b-reload").addEventListener("click", () => { const t = activeTab(); t && t.handle && t.handle.reload(); });
  document.getElementById("b-close-tab").addEventListener("click", () => { const t = activeTab(); t && closeTab(t.id); });
  document.getElementById("new-tab").addEventListener("click", () => newTab());
  document.getElementById("browser-settings").addEventListener("click", openSettings);
  document.getElementById("b-home").addEventListener("click", () => {
    const tab = activeTab();
    if (!tab) return newTab();
    discard(tab, true);
    tab.url = "";
    tab.blank = true;
    tab.title = "New tab";
    blank.hidden = false;
    addressInput.value = "";
    stopPolling();
    renderRail();
    document.getElementById("blank-query").focus();
  });

  document.getElementById("blank-search").addEventListener("submit", (e) => {
    e.preventDefault();
    navigate(document.getElementById("blank-query").value);
    document.getElementById("blank-query").value = "";
  });

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "t") {
      e.preventDefault();
      newTab();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "w") {
      const tab = activeTab();
      if (tab) {
        e.preventDefault();
        closeTab(tab.id);
      }
    }
  });

  // Switching proxy engines invalidates every handle, so all tabs go back to
  // their stored URL and rebuild against the new engine on the next visit.
  document.addEventListener("bw:proxy-engine", () => {
    for (const tab of tabs) discard(tab, true);
    const tab = activeTab();
    if (tab && tab.url && !tab.blank) activateTab(tab.id);
  });

  document.addEventListener("bw:ping", (e) => {
    const node = document.getElementById("browser-ping");
    if (node) node.textContent = e.detail === null ? "Offline" : `Connected · ${e.detail} ms`;
  });

  window.addEventListener("pagehide", () => {
    for (const tab of tabs) discard(tab, true);
  });

  // ---------- Boot ----------
  // Restoring last session's tabs would immediately put several proxy frames
  // back in memory, so Blackwaves always opens on a single fresh tab.
  newTab();
  addressInput.focus();
})();
