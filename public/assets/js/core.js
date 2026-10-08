// Shared page chrome for every Blackwaves page: top bar, settings drawer,
// proxy frame, loader and toasts. Exposes helpers on window.BW.
(function () {
  const DISCORD = "https://discord.gg/Un24M9gnpN";
  const VERSION = "1.0.0";

  const store = {
    get(key, fallback = null) {
      try {
        const value = localStorage.getItem("bw:" + key);
        return value === null ? fallback : JSON.parse(value);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem("bw:" + key, JSON.stringify(value));
      } catch {}
    },
    remove(key) {
      try {
        localStorage.removeItem("bw:" + key);
      } catch {}
    },
  };

  const ENGINES = {
    duckduckgo: { name: "DuckDuckGo", url: "https://duckduckgo.com/?q=%s" },
    google: { name: "Google", url: "https://www.google.com/search?q=%s" },
    bing: { name: "Bing", url: "https://www.bing.com/search?q=%s" },
    brave: { name: "Brave", url: "https://search.brave.com/search?q=%s" },
  };

  const CLOAKS = {
    none: { name: "None" },
    classroom: { name: "Classroom", title: "Home", icon: "https://ssl.gstatic.com/classroom/favicon.png" },
    docs: { name: "Docs", title: "Google Docs", icon: "https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico" },
    drive: { name: "Drive", title: "My Drive - Google Drive", icon: "https://ssl.gstatic.com/images/branding/product/1x/drive_2020q4_32dp.png" },
    canvas: { name: "Canvas", title: "Dashboard", icon: "https://du11hjcvx0uqb.cloudfront.net/dist/images/favicon-e10d657a73.ico" },
  };

  // Themes recolour the background, the light beams and the dust (see the
  // [data-theme] blocks in main.css). The choice is applied before first paint
  // by a tiny inline script in each page's <head>.
  const THEMES = {
    midnight: "Midnight",
    ocean: "Ocean",
    aurora: "Aurora",
    ember: "Ember",
    sakura: "Sakura",
    violet: "Violet",
  };

  // Bump when the favicon changes so browsers drop their cached copy.
  const FAVICON = "/favicon.svg?v=3";

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value);
    }
    for (const child of [].concat(children)) if (child) node.append(child);
    return node;
  }

  // Icons come from a small SVG sprite (assets/img/icons.svg). Names keep the
  // Font Awesome style ("fa-solid fa-house"); the last part is the symbol id.
  const SVG_NS = "http://www.w3.org/2000/svg";
  function icon(name) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "i");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS(SVG_NS, "use");
    use.setAttribute("href", `/assets/img/icons.svg#${name.split(" ").pop().replace(/^fa-/, "")}`);
    svg.append(use);
    return svg;
  }

  // ---------- Toasts ----------
  // Glass notifications. Identical messages shown within a few seconds are
  // merged, and at most four stay on screen. Returns a function that dismisses it.
  const recentToasts = new Map();
  function toast(message, type = "info", { html = false, duration = 3500, title = "" } = {}) {
    const key = type + title + message;
    const now = Date.now();
    if (now - (recentToasts.get(key) || 0) < 3000) return () => {};
    recentToasts.set(key, now);
    const icons = { success: "fa-solid fa-circle-check", error: "fa-solid fa-circle-xmark", warning: "fa-solid fa-circle-info", info: "fa-solid fa-circle-info", discord: "fa-brands fa-discord" };
    const text = el("span");
    if (html) text.innerHTML = message;
    else text.textContent = message;
    const body = el("div", { class: "toast-body" }, [title ? el("strong", { class: "toast-title", text: title }) : null, text]);
    const node = el("div", { class: `toast ${type}`, role: type === "error" ? "alert" : "status" }, [icon(icons[type] || icons.info), body]);
    const dismiss = () => {
      if (node.classList.contains("out")) return;
      node.classList.add("out");
      setTimeout(() => node.remove(), 200);
    };
    node.append(el("button", { "aria-label": "Dismiss", onclick: dismiss }, icon("fa-solid fa-xmark")));
    const stack = document.querySelector(".toasts");
    stack.append(node);
    while (stack.children.length > 4) stack.firstElementChild.remove();
    setTimeout(dismiss, type === "error" ? Math.max(duration, 6000) : duration);
    return dismiss;
  }

  // ---------- Search helpers ----------
  function toUrl(input) {
    const query = input.trim();
    try {
      const url = new URL(query);
      if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
    } catch {}
    if (!/\s/.test(query)) {
      try {
        const url = new URL("https://" + query);
        if (url.hostname.includes(".") && !url.hostname.endsWith(".")) return url.toString();
      } catch {}
    }
    const engine = ENGINES[store.get("engine", "duckduckgo")] || ENGINES.duckduckgo;
    return engine.url.replace("%s", encodeURIComponent(query));
  }

  // ---------- Chrome ----------
  function renderTopbar() {
    const page = document.body.dataset.page;
    const brandText = el("span", { class: "brand-name" }, "blackwaves");
    const links = [
      ["/", "home", "fa-solid fa-house", "Home"],
      ["/games", "games", "fa-solid fa-gamepad", "Games"],
      ["/apps", "apps", "fa-solid fa-grip", "Apps"],
    ].map(([href, id, iconName, label]) =>
      el("a", { href, ...(page === id ? { "aria-current": "page" } : {}), title: label }, [icon(iconName), el("span", { text: label })])
    );
    return el("header", { class: "topbar" }, [
      el("a", { class: "brand", href: "/", "aria-label": "Blackwaves home" }, [el("img", { src: "/assets/img/logo.svg", alt: "" }), brandText]),
      el("nav", { class: "nav-links", "aria-label": "Main" }, links),
      el("span", { class: "divider" }),
      el("a", { class: "icon-btn", href: DISCORD, target: "_blank", rel: "noopener", title: "Discord", "aria-label": "Join our Discord" }, icon("fa-brands fa-discord")),
      el("button", { class: "icon-btn", id: "open-settings", title: "Settings", "aria-label": "Settings", onclick: openSettings }, icon("fa-solid fa-gear")),
    ]);
  }

  function renderFrame() {
    const button = (id, iconName, label, extra = "") =>
      el("button", { class: `icon-btn ${extra}`, id, title: label, "aria-label": label }, icon(iconName));
    return el("div", { class: "frame-view", id: "frame-view" }, [
      el("div", { class: "frame-bar" }, [
        el("img", { class: "brand-mini", src: "/assets/img/logo.svg", alt: "" }),
        button("frame-back", "fa-solid fa-arrow-left", "Back"),
        button("frame-forward", "fa-solid fa-arrow-right", "Forward", "hide-sm"),
        button("frame-reload", "fa-solid fa-rotate-right", "Reload"),
        el("form", { class: "field", id: "frame-form" }, [
          icon("fa-solid fa-lock"),
          el("input", { class: "input", id: "frame-url", type: "text", autocomplete: "off", spellcheck: "false", "aria-label": "Address" }),
        ]),
        button("frame-devtools", "fa-solid fa-code", "Developer tools", "hide-sm"),
        button("frame-popout", "fa-solid fa-up-right-from-square", "Open in about:blank", "hide-sm"),
        button("frame-fullscreen", "fa-solid fa-expand", "Fullscreen"),
        button("frame-close", "fa-solid fa-xmark", "Close"),
      ]),
      el("iframe", { id: "frame", title: "Proxied page", allow: "fullscreen; autoplay; clipboard-write; encrypted-media; picture-in-picture; gamepad" }),
    ]);
  }

  function renderLoader() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 120 60");
    // Each line: a faint full wave with a bright crest riding along it.
    [14, 30, 46].forEach((y, i) => {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", `swell swell-${i}`);
      for (const cls of ["trough", "crest"]) {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", `M4 ${y} c 14 -12 24 -12 38 0 s 24 12 38 0 s 24 -12 38 0`);
        path.setAttribute("class", cls);
        g.append(path);
      }
      svg.append(g);
    });
    const text = el("div", { class: "loader-text" });
    text.innerHTML = `Riding the wave&hellip; join us on <a href="${DISCORD}" target="_blank" rel="noopener">Discord</a>`;
    return el("div", { class: "loader", id: "loader", role: "status", "aria-live": "polite" }, [svg, text]);
  }

  // Three beams of light slanting down to the right, plus a canvas for the
  // dust caught in them (animated by atmosphere.js).
  function renderLight() {
    return el("div", { class: "light", "aria-hidden": "true" }, [
      el("div", { class: "beam beam-1" }),
      el("div", { class: "beam beam-2" }),
      el("div", { class: "beam beam-3" }),
      el("canvas", { class: "dust", id: "dust" }),
    ]);
  }

  function showLoader(show) {
    document.getElementById("loader").classList.toggle("show", show);
  }

  // ---------- Settings ----------
  // Liquid-glass dropdown. The menu is attached to <body> with fixed
  // positioning so scrolling containers (like the settings drawer) can't clip it.
  let openMenu = null;
  function closeDropdown() {
    if (!openMenu) return;
    const { menu, button } = openMenu;
    openMenu = null;
    button.setAttribute("aria-expanded", "false");
    menu.classList.remove("open");
    setTimeout(() => menu.remove(), 180);
  }

  function dropdown(options, current, onPick, { label = "", align = "left" } = {}) {
    let value = current;
    const text = el("span", { class: "select-value" });
    const button = el("button", { class: "select", type: "button", "aria-haspopup": "listbox", "aria-expanded": "false", "aria-label": label }, [text, icon("fa-solid fa-chevron-down")]);
    const show = () => (text.textContent = (options.find(([v]) => v === value) || options[0])[1]);
    show();

    function pick(next) {
      value = next;
      show();
      closeDropdown();
      button.focus();
      onPick(next);
    }

    function open() {
      if (openMenu && openMenu.button === button) return closeDropdown();
      closeDropdown();
      const menu = el("div", { class: "menu", role: "listbox", "aria-label": label });
      const items = options.map(([v, name]) =>
        el("button", { class: "menu-item", type: "button", role: "option", "aria-selected": String(v === value), onclick: () => pick(v) }, [
          el("span", { text: name }),
          icon("fa-solid fa-check"),
        ])
      );
      menu.append(...items);
      document.body.append(menu);
      const rect = button.getBoundingClientRect();
      const width = Math.max(rect.width, 180);
      const below = window.innerHeight - rect.bottom;
      const height = menu.offsetHeight;
      menu.style.minWidth = `${width}px`;
      menu.style.left = `${Math.max(8, Math.min(align === "right" ? rect.right - width : rect.left, window.innerWidth - width - 8))}px`;
      if (below < height + 12 && rect.top > below) {
        menu.style.top = `${rect.top - height - 6}px`;
        menu.classList.add("up");
      } else {
        menu.style.top = `${rect.bottom + 6}px`;
      }
      openMenu = { menu, button };
      button.setAttribute("aria-expanded", "true");
      requestAnimationFrame(() => menu.classList.add("open"));
      (items.find((i) => i.getAttribute("aria-selected") === "true") || items[0]).focus();
      menu.addEventListener("keydown", (e) => {
        const i = items.indexOf(document.activeElement);
        if (e.key === "ArrowDown") items[(i + 1) % items.length].focus();
        else if (e.key === "ArrowUp") items[(i - 1 + items.length) % items.length].focus();
        else if (e.key === "Home") items[0].focus();
        else if (e.key === "End") items[items.length - 1].focus();
        else if (e.key === "Escape" || e.key === "Tab") {
          closeDropdown();
          button.focus();
        } else return;
        e.preventDefault();
        e.stopPropagation();
      });
    }

    button.addEventListener("click", (e) => {
      e.stopPropagation();
      open();
    });
    button.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        open();
      }
    });
    button.setValue = (v) => {
      value = v;
      show();
    };
    return button;
  }
  document.addEventListener("pointerdown", (e) => {
    if (openMenu && !openMenu.menu.contains(e.target) && !openMenu.button.contains(e.target)) closeDropdown();
  });
  window.addEventListener("resize", closeDropdown);
  document.addEventListener("scroll", (e) => openMenu && !openMenu.menu.contains(e.target) && closeDropdown(), true);

  function engineDropdown(opts = {}) {
    const select = dropdown(Object.entries(ENGINES).map(([k, v]) => [k, v.name]), store.get("engine", "duckduckgo"), (value) => {
      store.set("engine", value);
      document.dispatchEvent(new CustomEvent("bw:engine", { detail: value }));
      toast(`Searching with ${ENGINES[value].name}.`, "success");
    }, { label: "Search engine", ...opts });
    document.addEventListener("bw:engine", (e) => select.setValue(e.detail));
    return select;
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = THEMES[theme] ? theme : "midnight";
    document.dispatchEvent(new CustomEvent("bw:theme", { detail: document.documentElement.dataset.theme }));
  }

  function setting(title, description, control) {
    return el("div", { class: "setting" }, [el("h3", { text: title }), description ? el("p", { text: description }) : null, control]);
  }

  function toggle(title, description, key, onChange) {
    const input = el("input", { type: "checkbox", role: "switch" });
    input.checked = !!store.get(key, false);
    input.addEventListener("change", () => {
      store.set(key, input.checked);
      onChange && onChange(input.checked);
    });
    return el("div", { class: "setting" }, [
      el("label", { class: "switch" }, [el("span", {}, [el("h3", { text: title }), el("p", { text: description, style: "margin:0" })]), input]),
    ]);
  }

  function renderSettings() {
    const defaultWisp = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/w/`;
    const wispInput = el("input", { class: "input plain", type: "text", value: store.get("wisp", defaultWisp), autocomplete: "off", spellcheck: "false", "aria-label": "Wisp server URL" });

    const engineSelect = engineDropdown();
    const proxyPanel = el("div", { class: "panel", id: "panel-proxy" }, [
      setting(
        "Transport",
        "How the proxy sends traffic. Try the other one if a site won't load.",
        dropdown([["epoxy", "Epoxy"], ["libcurl", "Libcurl"]], store.get("transport", "epoxy"), (value) => {
          store.set("transport", value);
          window.BW.proxy && window.BW.proxy.setTransport(value);
          if (value === "epoxy") toast("Transport set to Epoxy.", "success");
          else toast("Games only load on Epoxy. Switch back if a game won't open.", "warning", { title: "Transport set to Libcurl", duration: 6000 });
        }, { label: "Transport" })
      ),
      setting(
        "Wisp server",
        "Leave this as the default unless you know you need another server.",
        el("div", { class: "row" }, [
          wispInput,
          el("button", {
            class: "btn",
            type: "button",
            text: "Save",
            onclick() {
              const value = wispInput.value.trim();
              let ok = false;
              try {
                const url = new URL(value);
                ok = (url.protocol === "ws:" || url.protocol === "wss:") && value.endsWith("/");
              } catch {}
              if (!ok) return toast("Enter a ws:// or wss:// URL ending in /", "error");
              store.set("wisp", value);
              window.BW.proxy && window.BW.proxy.setTransport(store.get("transport", "epoxy"));
              toast(value, "success", { title: "Wisp server changed" });
            },
          }),
          el("button", {
            class: "icon-btn",
            type: "button",
            title: "Reset to default",
            "aria-label": "Reset Wisp server",
            onclick() {
              store.remove("wisp");
              wispInput.value = defaultWisp;
              window.BW.proxy && window.BW.proxy.setTransport(store.get("transport", "epoxy"));
              toast("Back to this site's own Wisp server.", "success", { title: "Wisp server reset" });
            },
          }, icon("fa-solid fa-rotate-left")),
        ])
      ),
      setting(
        "Search engine",
        "Used when you type something that isn't a URL.",
        engineSelect
      ),
    ]);

    const cloakPanel = el("div", { class: "panel", id: "panel-cloak", hidden: "" }, [
      setting(
        "Tab disguise",
        "Changes this tab's title and icon.",
        dropdown(Object.entries(CLOAKS).map(([k, v]) => [k, v.name]), store.get("cloak", "none"), (value) => {
          store.set("cloak", value);
          applyCloak();
          toast(value === "none" ? "Tab disguise turned off." : `Tab now looks like ${CLOAKS[value].name}.`, "success");
        }, { label: "Tab disguise" })
      ),
      setting("Open in about:blank", "Opens Blackwaves inside an about:blank tab so it doesn't show in your history.", el("button", { class: "btn", type: "button", onclick: launchBlank }, [icon("fa-solid fa-window-restore"), "Launch now"])),
      toggle("Auto-launch about:blank", "Do this automatically every time Blackwaves opens. Allow pop-ups for this site.", "autoblank", (on) => {
        toast(on ? "Blackwaves will open in about:blank from now on." : "Auto-launch turned off.", "success");
        if (on) launchBlank();
      }),
    ]);

    const appearancePanel = el("div", { class: "panel", id: "panel-appearance", hidden: "" }, [
      setting(
        "Theme",
        "Colours the background, the light and the dust.",
        dropdown(Object.entries(THEMES), document.documentElement.dataset.theme || "midnight", (value) => {
          store.set("theme", value);
          applyTheme(value);
          toast(`Theme set to ${THEMES[value]}.`, "success");
        }, { label: "Theme" })
      ),
    ]);

    const pingValue = el("strong", { id: "settings-ping", text: "—" });
    const aboutPanel = el("div", { class: "panel", id: "panel-about", hidden: "" }, [
      el("div", { class: "setting" }, [
        el("div", { class: "kv" }, ["Version", el("strong", { text: VERSION })]),
        el("div", { class: "kv" }, ["Server", el("strong", {}, [el("span", { class: "dot good" }), "Online"])]),
        el("div", { class: "kv" }, ["Latency", pingValue]),
      ]),
      setting("Community", "Updates, requests and support.", el("a", { class: "btn primary", href: DISCORD, target: "_blank", rel: "noopener" }, [icon("fa-brands fa-discord"), "Join the Discord"])),
    ]);

    const panels = { proxy: proxyPanel, appearance: appearancePanel, cloak: cloakPanel, about: aboutPanel };
    const tabs = el("div", { class: "tabs", role: "tablist" });
    for (const [id, label] of [["proxy", "Proxy"], ["appearance", "Appearance"], ["cloak", "Cloak"], ["about", "About"]]) {
      tabs.append(
        el("button", {
          class: "tab",
          role: "tab",
          type: "button",
          "aria-selected": String(id === "proxy"),
          text: label,
          onclick() {
            tabs.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", String(t === this)));
            for (const [key, panel] of Object.entries(panels)) panel.hidden = key !== id;
          },
        })
      );
    }

    return [
      el("div", { class: "scrim", id: "scrim", onclick: closeSettings }),
      el("aside", { class: "drawer", id: "settings", "aria-label": "Settings", "aria-hidden": "true" }, [
        el("div", { class: "drawer-head" }, [el("h2", { text: "Settings" }), el("button", { class: "icon-btn", "aria-label": "Close settings", onclick: closeSettings }, icon("fa-solid fa-xmark"))]),
        tabs,
        el("div", { class: "drawer-body" }, [proxyPanel, appearancePanel, cloakPanel, aboutPanel]),
      ]),
    ];
  }

  function openSettings() {
    document.getElementById("settings").classList.add("open");
    document.getElementById("settings").setAttribute("aria-hidden", "false");
    document.getElementById("scrim").classList.add("show");
  }

  function closeSettings() {
    document.getElementById("settings").classList.remove("open");
    document.getElementById("settings").setAttribute("aria-hidden", "true");
    document.getElementById("scrim").classList.remove("show");
  }

  // ---------- Cloaking ----------
  const originalTitle = document.title;
  function applyCloak() {
    const cloak = CLOAKS[store.get("cloak", "none")] || CLOAKS.none;
    document.title = cloak.title || originalTitle;
    document.querySelectorAll('link[rel~="icon"]').forEach((link) => link.remove());
    document.head.append(el("link", { rel: "icon", type: cloak.icon ? "" : "image/svg+xml", href: cloak.icon || FAVICON }));
  }

  function launchBlank() {
    const popup = window.open("about:blank", "_blank");
    if (!popup) return toast("Pop-up blocked. Allow pop-ups for this site and try again.", "error");
    const cloak = CLOAKS[store.get("cloak", "none")] || CLOAKS.none;
    popup.document.title = cloak.title || "Blackwaves";
    const link = popup.document.createElement("link");
    link.rel = "icon";
    link.href = cloak.icon || location.origin + FAVICON;
    popup.document.head.append(link);
    const frame = popup.document.createElement("iframe");
    frame.src = location.href;
    frame.style.cssText = "position:fixed;inset:0;width:100%;height:100%;border:0;";
    popup.document.body.style.margin = "0";
    popup.document.body.append(frame);
    location.replace("https://classroom.google.com/");
  }

  function inFrame() {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  }

  // ---------- Ping ----------
  // The ping socket doubles as the connection monitor: it reconnects with
  // backoff and tells the user when the server drops out and when it's back.
  function startPing(onLatency) {
    let lostToast = null;
    let retry = 1000;
    function connect() {
      let ws;
      try {
        ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/w/ping`);
      } catch {
        return schedule();
      }
      ws.onopen = () => {
        retry = 1000;
        if (lostToast) {
          lostToast();
          lostToast = null;
          toast("You're back online.", "success", { title: "Reconnected" });
        }
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "ping") ws.send(JSON.stringify({ type: "pong", timestamp: data.timestamp }));
          if (data.type === "latency") onLatency(data.latency);
        } catch {}
      };
      ws.onclose = () => {
        onLatency(null);
        if (!lostToast) lostToast = toast("Can't reach the Blackwaves server. Retrying…", "error", { title: "Disconnected", duration: 600000 });
        schedule();
      };
    }
    function schedule() {
      setTimeout(connect, retry);
      retry = Math.min(retry * 2, 15000);
    }
    window.addEventListener("online", () => (retry = 1000));
    connect();
  }

  // Unexpected errors in Blackwaves' own pages (not the sites inside the proxy).
  function errorText(reason) {
    return String((reason && reason.message) || reason || "Unknown error").slice(0, 160);
  }
  window.addEventListener("error", (e) => {
    if (e.filename && !e.filename.startsWith(location.origin)) return;
    toast(errorText(e.error || e.message), "error", { title: "Something went wrong" });
  });
  window.addEventListener("unhandledrejection", (e) => toast(errorText(e.reason), "error", { title: "Something went wrong" }));

  // ---------- Boot ----------
  document.body.prepend(renderLight(), renderTopbar());
  document.body.append(renderFrame(), renderLoader(), ...renderSettings(), el("div", { class: "toasts", "aria-live": "polite" }));
  document.addEventListener("keydown", (e) => e.key === "Escape" && closeSettings());
  applyTheme(store.get("theme", "midnight"));
  applyCloak();
  if (store.get("autoblank", false) && !inFrame()) launchBlank();
  startPing((ms) => {
    const label = ms === null ? "Offline" : `${ms} ms`;
    document.getElementById("settings-ping").textContent = label;
    document.dispatchEvent(new CustomEvent("bw:ping", { detail: ms }));
  });

  window.BW = { store, toast, toUrl, el, icon, showLoader, openSettings, dropdown, engineDropdown, DISCORD, ENGINES };
})();
