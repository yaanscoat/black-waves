// Shared page chrome for every Blackwaves page: top bar, settings drawer,
// proxy frame, loader, wallpaper and toasts. Exposes helpers on window.BW.
(function () {
  const DISCORD = "https://discord.gg/Un24M9gnpN";
  const VERSION = "0.1.0";

  // Set by assets/js/config.js. Static builds flip `static` to true so the
  // frontend knows there is no /cdn or /w endpoint behind it.
  const CONFIG = window.BW_CONFIG || {};
  const IS_STATIC = !!CONFIG.static;

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

  // The 40 theme ids live in assets/css/themes.css (one block each, so adding
  // a theme never means touching two palettes). This map only supplies the
  // pretty label; anything present in the CSS but missing here is title-cased.
  const THEME_LABELS = {
    midnight: "Midnight", ocean: "Ocean", aurora: "Aurora", ember: "Ember",
    sakura: "Sakura", violet: "Violet", crimson: "Crimson", cyberpunk: "Cyberpunk",
    neon: "Neon", solar: "Solar", forest: "Forest", lavender: "Lavender",
    rose: "Rose", arctic: "Arctic", magma: "Magma", jade: "Jade", indigo: "Indigo",
    peach: "Peach", mint: "Mint", gold: "Gold", steel: "Steel", plum: "Plum",
    citrus: "Citrus", tide: "Tide", orchid: "Orchid", copper: "Copper",
    glacier: "Glacier", moss: "Moss", bubblegum: "Bubblegum", aqua: "Aqua",
    sunset: "Sunset", bloodmoon: "Blood Moon", cobalt: "Cobalt", sand: "Sand",
    eclipse: "Eclipse", lagoon: "Lagoon", ruby: "Ruby", space: "Space",
    noir: "Noir", halo: "Halo",
  };

  const GLASS_STYLES = {
    clear: "Clear",
    frosted: "Frosted",
    liquid: "Liquid",
    matte: "Matte",
    holographic: "Holographic",
    prism: "Prism",
    neumorph: "Neumorph",
    gel: "Gel",
    minimal: "Minimal",
  };

  // name -> css colour used for the swatch
  const TINTS = {
    none: { name: "Theme", css: "" },
    white: { name: "White", css: "#f2f3f7" },
    blue: { name: "Blue", css: "#6098ff" },
    purple: { name: "Purple", css: "#9e70ff" },
    pink: { name: "Pink", css: "#ff6ebe" },
    red: { name: "Red", css: "#ff5c5c" },
    orange: { name: "Orange", css: "#ff9e40" },
    yellow: { name: "Yellow", css: "#ffdc5a" },
    green: { name: "Green", css: "#58e68c" },
    teal: { name: "Teal", css: "#46e6dc" },
    black: { name: "Black", css: "#0a0a0c" },
  };

  // Background effects the user can switch off one by one.
  const FX = {
    beams: { label: "Light beams", cls: "no-beams" },
    dust: { label: "Dust motes", cls: "no-dust" },
    sheen: { label: "Glass sheen", cls: "no-sheen" },
    specular: { label: "Pointer highlight", cls: "no-specular" },
    blur: { label: "Backdrop blur", cls: "no-glass-blur" },
  };

  const GAME_PROVIDERS = {
    ckv: "CKV Collection",
    gnm: "GN-Math",
  };

  const ENGINES_PROXY = {
    scramjet: "Scramjet (recommended)",
    uv: "Ultraviolet",
  };

  const TRANSPORTS = {
    libcurl: "Libcurl (recommended)",
    epoxy: "Epoxy",
  };

  // Where the transports open their websocket. Self-hosted builds use the
  // server's own /w/ endpoint; static builds point at a public Wisp server.
  function defaultWisp() {
    if (IS_STATIC) return CONFIG.publicWisp || "wss://wisp.mercurywork.shop/";
    return CONFIG.wisp || `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/w/`;
  }

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
    const links = [
      ["/", "home", "fa-solid fa-house", "Home"],
      ["/games.html", "games", "fa-solid fa-gamepad", "Games"],
      ["/apps.html", "apps", "fa-solid fa-grip", "Apps"],
      ["/movies.html", "movies", "fa-solid fa-film", "Movies"],
      ["/browser.html", "browser", "fa-solid fa-window-maximize", "Browser"],
    ].map(([href, id, iconName, label]) =>
      el("a", { href, ...(page === id ? { "aria-current": "page" } : {}), title: label }, [icon(iconName), el("span", { text: label })])
    );
    return el("header", { class: "topbar" }, [
      el("a", { class: "brand", href: "/", "aria-label": "Blackwaves home" }, [el("img", { src: "/assets/img/logo.svg", alt: "" }), el("span", { class: "brand-name" }, "blackwaves")]),
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
  // dust caught in them (animated by atmosphere.js) and the wallpaper layer.
  function renderLight() {
    return el("div", { class: "light", "aria-hidden": "true" }, [
      el("div", { class: "beam beam-1" }),
      el("div", { class: "beam beam-2" }),
      el("div", { class: "beam beam-3" }),
      el("canvas", { class: "dust", id: "dust" }),
    ]);
  }

  function showLoader(show) {
    const node = document.getElementById("loader");
    if (node) node.classList.toggle("show", show);
  }

  // ---------- Appearance ----------
  const root = document.documentElement;

  function applyTheme(theme) {
    root.dataset.theme = KNOWN_THEME_IDS.has(theme) ? theme : "midnight";
    document.dispatchEvent(new CustomEvent("bw:theme", { detail: root.dataset.theme }));
  }

  // Ids actually shipped in themes.css, discovered once from the stylesheet.
  const KNOWN_THEME_IDS = (() => {
    const ids = new Set(Object.keys(THEME_LABELS));
    for (const sheet of document.styleSheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      if (!rules) continue;
      for (const rule of rules) {
        const match = rule.selectorText && rule.selectorText.match(/^\[data-theme="([\w-]+)"\]$/);
        if (match) ids.add(match[1]);
      }
    }
    return ids;
  })();

  function applyGlass(style) {
    root.dataset.glass = GLASS_STYLES[style] ? style : "clear";
  }

  function applyTint(tint, custom) {
    if (tint === "custom" && custom) {
      const rgb = hexToRgb(custom);
      if (rgb) {
        root.style.setProperty("--glass", `rgba(${rgb}, 0.085)`);
        root.style.setProperty("--glass-hover", `rgba(${rgb}, 0.14)`);
        root.style.setProperty("--glass-strong", `rgba(${rgb}, 0.42)`);
        root.style.setProperty("--glass-edge", `rgba(${rgb}, 0.28)`);
        root.style.setProperty("--glass-edge-strong", `rgba(${rgb}, 0.44)`);
        root.dataset.tint = "custom";
        return;
      }
    }
    for (const key of ["--glass", "--glass-hover", "--glass-strong", "--glass-edge", "--glass-edge-strong"]) root.style.removeProperty(key);
    root.dataset.tint = TINTS[tint] ? tint : "none";
  }

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
  }

  // Wallpaper: an uploaded image (shrunk to a JPEG before it is stored) or a
  // remote URL. Both end up as one CSS background on a fixed layer.
  function applyWallpaper() {
    const node = document.querySelector(".wallpaper");
    const src = store.get("wallpaper-src", "");
    root.classList.toggle("has-wallpaper", !!src);
    root.classList.toggle("wallpaper-solid", !!store.get("wallpaper-dim", false));
    if (node) node.style.backgroundImage = src ? `url("${src}")` : "";
  }

  function setWallpaper(src, label) {
    store.set("wallpaper-src", src);
    applyWallpaper();
    document.dispatchEvent(new CustomEvent("bw:wallpaper"));
    if (label) toast(label, "success", { title: "Background updated" });
  }

  // Reads an uploaded image, scales it down and stores it as a small JPEG so
  // it never blows the localStorage budget or the tab's memory.
  function readImageFile(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) return reject(new Error("Pick an image file."));
      if (file.size > 20 * 1024 * 1024) return reject(new Error("That image is over 20 MB."));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Couldn't read that file."));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("That file isn't a usable image."));
        img.onload = () => {
          const max = 1440;
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          let out;
          try {
            out = canvas.toDataURL("image/jpeg", 0.72);
          } catch {
            return reject(new Error("Couldn't process that image."));
          }
          resolve(out);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function applyFx() {
    const fx = store.get("fx", {}) || {};
    for (const [key, def] of Object.entries(FX)) {
      const on = fx[key] === undefined ? true : !!fx[key];
      root.classList.toggle(def.cls, !on);
    }
    // Wallpaper drift defaults on; it is a transform-only animation.
    root.classList.toggle("fx-motion", fx.motion === undefined ? true : !!fx.motion);
    applyLowRam();
    document.dispatchEvent(new CustomEvent("bw:fx"));
  }

  function lowRamDefault() {
    const mem = navigator.deviceMemory;
    return (typeof mem === "number" && mem <= 4) || window.innerWidth < 640;
  }

  function lowRamOn() {
    const stored = store.get("lowram", null);
    if (stored === null) return lowRamDefault();
    return !!stored;
  }

  function applyLowRam() {
    const on = lowRamOn();
    root.classList.toggle("low-ram", on);
    document.dispatchEvent(new CustomEvent("bw:lowram", { detail: on }));
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
    const show = () => (text.textContent = (options.find(([v]) => v === value) || options[0] || ["", "—"])[1]);
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
      el("label", { class: "switch" }, [el("span", {}, [el("h3", { text: title }), description ? el("p", { text: description, style: "margin:0" }) : null]), input]),
    ]);
  }

  // A switch whose value lives inside a settings object instead of its own key.
  function fxToggle(title, description, fxKey) {
    const input = el("input", { type: "checkbox", role: "switch" });
    const fx = store.get("fx", {}) || {};
    input.checked = fx[fxKey] === undefined ? true : !!fx[fxKey];
    input.addEventListener("change", () => {
      const next = store.get("fx", {}) || {};
      next[fxKey] = input.checked;
      store.set("fx", next);
      applyFx();
    });
    return el("div", { class: "setting" }, [
      el("label", { class: "switch" }, [el("span", {}, [el("h3", { text: title }), description ? el("p", { text: description, style: "margin:0" }) : null]), input]),
    ]);
  }

  function renderProxyPanel() {
    const defaultWispUrl = defaultWisp();
    const wispInput = el("input", { class: "input plain", type: "text", value: store.get("wisp", defaultWispUrl), autocomplete: "off", spellcheck: "false", "aria-label": "Wisp server URL" });

    const panel = el("div", { class: "panel", id: "panel-proxy" }, [
      setting(
        "Proxy engine",
        "Scramjet is the modern rewrite engine and handles most sites. Fall back to Ultraviolet if something breaks.",
        dropdown(Object.entries(ENGINES_PROXY), store.get("proxy-engine", "scramjet"), (value) => {
          store.set("proxy-engine", value);
          document.dispatchEvent(new CustomEvent("bw:proxy-engine", { detail: value }));
          toast(`${ENGINES_PROXY[value].split(" (")[0]} will be used for new pages.`, "success");
        }, { label: "Proxy engine" })
      ),
      setting(
        "Transport",
        "How the proxy sends traffic. Libcurl is the recommended transport; switch to Epoxy if a site misbehaves.",
        dropdown(Object.entries(TRANSPORTS), store.get("transport", "libcurl"), (value) => {
          store.set("transport", value);
          window.BW.proxy && window.BW.proxy.setTransport(value);
          toast(`Transport set to ${TRANSPORTS[value].split(" (")[0]}.`, "success");
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
              window.BW.proxy && window.BW.proxy.setTransport(store.get("transport", "libcurl"));
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
              wispInput.value = defaultWispUrl;
              window.BW.proxy && window.BW.proxy.setTransport(store.get("transport", "libcurl"));
              toast("Back to this site's own Wisp server.", "success", { title: "Wisp server reset" });
            },
          }, icon("fa-solid fa-rotate-left")),
        ])
      ),
      setting(
        "Search engine",
        "Used when you type something that isn't a URL.",
        engineDropdown()
      ),
      setting(
        "Game provider",
        "Which library the Games page pulls from.",
        dropdown(Object.entries(GAME_PROVIDERS), store.get("game-provider", "ckv"), (value) => {
          store.set("game-provider", value);
          document.dispatchEvent(new CustomEvent("bw:game-provider", { detail: value }));
          toast(`Games now come from ${GAME_PROVIDERS[value]}.`, "success");
        }, { label: "Game provider" })
      ),
    ]);
    return panel;
  }

  function themeDotColor(id) {
    const probe = el("div", { style: "position:absolute;visibility:hidden;pointer-events:none" });
    probe.dataset.theme = id;
    document.body.append(probe);
    const light = getComputedStyle(probe).getPropertyValue("--light").trim() || "226, 233, 255";
    probe.remove();
    return `rgb(${light})`;
  }

  function renderThemeGrid() {
    const grid = el("div", { class: "theme-grid", role: "group", "aria-label": "Theme" });
    const ids = [...KNOWN_THEME_IDS];
    let built = false;
    const build = () => {
      if (built) return;
      built = true;
      const current = root.dataset.theme || "midnight";
      for (const id of ids) {
        const chip = el("button", {
          class: "theme-chip",
          type: "button",
          "aria-pressed": String(id === current),
          title: THEME_LABELS[id] || id,
          onclick() {
            store.set("theme", id);
            applyTheme(id);
            grid.querySelectorAll(".theme-chip").forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
          },
        }, [el("span", { class: "theme-dot", style: `background:${themeDotColor(id)}` }), el("span", { text: THEME_LABELS[id] || id })]);
        grid.append(chip);
      }
      document.addEventListener("bw:theme", (e) => {
        grid.querySelectorAll(".theme-chip").forEach((c) => c.setAttribute("aria-pressed", String(c.textContent === (THEME_LABELS[e.detail] || e.detail))));
      });
    };
    grid.addEventListener("click", build, { once: true });
    setTimeout(build, 0);
    return grid;
  }

  function renderTintRow() {
    const row = el("div", { class: "swatches", role: "group", "aria-label": "Glass tint" });
    const custom = el("input", { type: "color", value: "#6098ff", "aria-label": "Custom tint colour", style: "width:38px;height:30px;padding:0;border:1px solid var(--glass-edge-strong);border-radius:10px;background:none;cursor:pointer" });
    const current = store.get("tint", "none");
    for (const [id, tint] of Object.entries(TINTS)) {
      const swatch = el("button", {
        class: `swatch${id === "none" ? " none" : ""}`,
        type: "button",
        title: tint.name,
        "aria-label": `Tint: ${tint.name}`,
        "aria-pressed": String(id === current),
        ...(tint.css ? { style: `background:${tint.css}` } : {}),
        onclick() {
          store.set("tint", id);
          applyTint(id, store.get("tint-custom"));
          row.querySelectorAll(".swatch").forEach((s) => s.setAttribute("aria-pressed", String(s === swatch)));
        },
      });
      row.append(swatch);
    }
    custom.addEventListener("input", () => {
      store.set("tint", "custom");
      store.set("tint-custom", custom.value);
      applyTint("custom", custom.value);
      row.querySelectorAll(".swatch").forEach((s) => s.setAttribute("aria-pressed", "false"));
    });
    if (current === "custom") custom.value = store.get("tint-custom", "#6098ff");
    row.append(el("span", { class: "note", text: "or" }), custom);
    return row;
  }

  function renderWallpaper() {
    const file = el("input", { type: "file", accept: "image/*", style: "display:none" });
    const preview = el("div", { class: "wall-preview", text: "No custom background" });
    const status = el("p", { class: "note", text: "" });

    const sync = () => {
      const src = store.get("wallpaper-src", "");
      preview.style.backgroundImage = src ? `url("${src}")` : "";
      preview.textContent = src ? "" : "No custom background";
    };

    const accept = async (candidate) => {
      try {
        const dataUrl = await readImageFile(candidate);
        setWallpaper(dataUrl, "Using your uploaded image.");
        sync();
      } catch (err) {
        toast(err.message || "Couldn't use that image.", "error");
      }
    };

    file.addEventListener("change", () => file.files[0] && accept(file.files[0]));

    const drop = el("div", {
      class: "drop",
      role: "button",
      tabindex: "0",
      onclick: () => file.click(),
      onkeydown: (e) => (e.key === "Enter" || e.key === " ") && file.click(),
    }, [icon("fa-solid fa-cloud-arrow-up"), el("span", { text: "Drop an image here or click to upload" })]);
    for (const type of ["dragover", "dragenter"]) drop.addEventListener(type, (e) => { e.preventDefault(); drop.classList.add("over"); });
    for (const type of ["dragleave", "drop"]) drop.addEventListener(type, (e) => { e.preventDefault(); drop.classList.remove("over"); });
    drop.addEventListener("drop", (e) => e.dataTransfer.files[0] && accept(e.dataTransfer.files[0]));

    const urlInput = el("input", { class: "input plain", type: "url", placeholder: "https://example.com/wallpaper.jpg", autocomplete: "off", "aria-label": "Background image URL" });
    const applyUrl = () => {
      const value = urlInput.value.trim();
      if (!value) return;
      try {
        const url = new URL(value);
        if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
      } catch {
        return toast("Enter a valid http(s) image URL.", "error");
      }
      setWallpaper(value, "Using your linked image.");
      sync();
    };

    sync();
    return el("div", {}, [
      preview,
      el("div", { style: "height:10px" }),
      drop,
      file,
      el("div", { style: "height:10px" }),
      el("div", { class: "row" }, [
        urlInput,
        el("button", { class: "btn", type: "button", text: "Use link", onclick: applyUrl }),
      ]),
      el("div", { style: "height:8px" }),
      el("div", { class: "row" }, [
        el("button", {
          class: "btn small",
          type: "button",
          onclick() {
            store.remove("wallpaper-src");
            applyWallpaper();
            sync();
            urlInput.value = "";
            toast("Back to the plain background.", "success");
          },
        }, [icon("fa-solid fa-xmark"), "Remove"]),
        el("label", { class: "switch", style: "flex:1" }, [
          el("span", {}, [el("h3", { text: "Extra dim" }), el("p", { text: "Darkens the wallpaper so text stays readable.", style: "margin:0" })]),
          (() => {
            const input = el("input", { type: "checkbox", role: "switch" });
            input.checked = !!store.get("wallpaper-dim", false);
            input.addEventListener("change", () => {
              store.set("wallpaper-dim", input.checked);
              applyWallpaper();
            });
            return input;
          })(),
        ]),
      ]),
      status,
    ]);
  }

  function renderAppearancePanel() {
    return el("div", { class: "panel", id: "panel-appearance", hidden: "" }, [
      setting("Theme", "40 palettes for the background, the light and the dust.", renderThemeGrid()),
      setting("Glass style", "Reshapes every glass surface in the app.", dropdown(Object.entries(GLASS_STYLES), store.get("glass", "clear"), (value) => {
        store.set("glass", value);
        applyGlass(value);
        toast(`Glass style set to ${GLASS_STYLES[value]}.`, "success");
      }, { label: "Glass style" })),
      setting("Glass tint", "Re-colours the glass without touching the theme.", renderTintRow()),
      setting("Background", "Upload your own image or link one from anywhere on the web.", renderWallpaper()),
      el("div", { class: "section-label", text: "Background effects" }),
      ...Object.entries(FX).map(([key, def]) =>
        fxToggle(def.label, key === "blur" ? "Backdrop blur is the biggest memory user; turning it off saves a lot." : "Part of the animated atmosphere.", key)
      ),
      fxToggle("Wallpaper drift", "Slowly pans a still background image.", "motion"),
      (() => {
        const input = el("input", { type: "checkbox", role: "switch" });
        input.checked = lowRamOn();
        input.addEventListener("change", () => {
          store.set("lowram", input.checked);
          applyLowRam();
          toast(input.checked ? "Low RAM mode on: the idle page stays near 20 MB." : "Full effects restored.", "success");
        });
        document.addEventListener("bw:lowram", (e) => (input.checked = !!e.detail));
        return el("div", { class: "setting" }, [
          el("label", { class: "switch" }, [
            el("span", {}, [el("h3", { text: "Low RAM mode" }), el("p", { text: "Cuts backdrop blur, the dust canvas and animated sheens. Defaults on for light devices.", style: "margin:0" })]),
            input,
          ]),
        ]);
      })(),
    ]);
  }

  function renderCloakPanel() {
    return el("div", { class: "panel", id: "panel-cloak", hidden: "" }, [
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
  }

  // ---------- Changelog ----------
  const KIND_LABEL = { feature: "Feature", fix: "Fix", broken: "Broken", change: "Change", perf: "Perf" };
  function renderChangelog() {
    const box = el("div", { class: "changelog" }, [el("p", { class: "note", text: "Loading the changelog…" })]);
    fetch("/assets/data/changelog.json", { cache: "no-cache" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("missing"))))
      .then((data) => {
        const releases = Array.isArray(data.releases) ? data.releases : [];
        if (!releases.length) throw new Error("empty");
        const pending = Array.isArray(data.pending) ? data.pending : [];
        box.replaceChildren(
          ...releases.slice(0, 8).map((release) =>
            el("div", { class: "release" }, [
              el("div", { class: "release-head" }, [
                el("strong", { text: `v${release.version}` }),
                el("span", { text: release.date || "" }),
              ]),
              el("ul", {}, (release.items || []).map((item) =>
                el("li", {}, [
                  el("span", { class: `badge ${item.kind || "change"}`, text: KIND_LABEL[item.kind] || "Change" }),
                  el("span", { text: item.text }),
                ])
              )),
            ])
          ),
          pending.length
            ? el("div", { class: "release" }, [
                el("div", { class: "release-head" }, [el("strong", { text: "Unreleased" }), el("span", { text: `${pending.length} since v${data.version}` })]),
                el("ul", {}, pending.map((item) =>
                  el("li", {}, [el("span", { class: `badge ${item.kind || "change"}`, text: KIND_LABEL[item.kind] || "Change" }), el("span", { text: item.text })])
                )),
              ])
            : null,
          el("p", { class: "note", text: "Every 5 shipped changes move the version forward by 0.0.1." })
        );
      })
      .catch(() => box.replaceChildren(el("p", { class: "note", text: "The changelog couldn't be loaded right now." })));
    return box;
  }

  function renderAboutPanel() {
    const pingValue = el("strong", { id: "settings-ping", text: "—" });
    return el("div", { class: "panel", id: "panel-about", hidden: "" }, [
      el("div", { class: "setting" }, [
        el("div", { class: "kv" }, ["Version", el("strong", { text: VERSION })]),
        el("div", { class: "kv" }, ["Proxy engine", el("strong", { text: ENGINES_PROXY[store.get("proxy-engine", "scramjet")].split(" (")[0] })]),
        el("div", { class: "kv" }, ["Server", el("strong", {}, [el("span", { class: "dot good" }), IS_STATIC ? "Static build" : "Online"])]),
        el("div", { class: "kv" }, ["Latency", pingValue]),
      ]),
      setting("Community", "Updates, requests and support.", el("a", { class: "btn primary", href: DISCORD, target: "_blank", rel: "noopener" }, [icon("fa-brands fa-discord"), "Join the Discord"])),
      setting("Changelog", "Everything that landed, newest first.", renderChangelog()),
    ]);
  }

  function renderSettings() {
    const panels = { proxy: renderProxyPanel(), appearance: renderAppearancePanel(), cloak: renderCloakPanel(), about: renderAboutPanel() };
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
        el("div", { class: "drawer-body" }, [panels.proxy, panels.appearance, panels.cloak, panels.about]),
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

  // ---------- Connection monitor ----------
  // The ping socket doubles as the connection monitor. It used to drop every
  // minute or so because a silent socket was never noticed and a single missed
  // ping was reported as an outage; now the server heartbeats with protocol
  // frames, the client has a watchdog, and two failures are needed before the
  // user is told anything.
  function startPing(onLatency) {
    let lostToast = null;
    let retry = 400;
    let socket = null;
    let failures = 0;
    let lastMessage = Date.now();
    let watchdog = null;

    function reportLost() {
      if (lostToast) return;
      lostToast = toast("Can't reach the Blackwaves server. Retrying…", "error", { title: "Disconnected", duration: 600000 });
    }

    function connect() {
      if (socket) {
        socket.onclose = null;
        socket.onerror = null;
        try {
          socket.close();
        } catch {}
        socket = null;
      }
      let ws;
      try {
        ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/w/ping`);
      } catch {
        return schedule();
      }
      socket = ws;
      ws.onopen = () => {
        retry = 400;
        failures = 0;
        lastMessage = Date.now();
        if (lostToast) {
          lostToast();
          lostToast = null;
          toast("You're back online.", "success", { title: "Reconnected" });
        }
      };
      ws.onmessage = (event) => {
        lastMessage = Date.now();
        try {
          const data = JSON.parse(event.data);
          if (data.type === "ping") ws.send(JSON.stringify({ type: "pong", timestamp: data.timestamp }));
          if (data.type === "latency") onLatency(data.latency);
        } catch {}
      };
      ws.onerror = () => {};
      ws.onclose = () => {
        if (socket !== ws) return;
        socket = null;
        onLatency(null);
        failures++;
        if (failures >= 2) reportLost();
        schedule();
      };
    }

    function schedule() {
      setTimeout(connect, retry);
      retry = Math.min(retry * 2, 15000);
    }

    // Nothing has arrived for a while: the socket is probably half-open, so
    // force a close and let the reconnect path take over.
    watchdog = setInterval(() => {
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      if (Date.now() - lastMessage > 20000) {
        try {
          socket.close();
        } catch {}
      }
    }, 5000);

    window.addEventListener("online", () => {
      retry = 400;
      if (!socket) connect();
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && !socket) {
        retry = 400;
        connect();
      }
    });
    connect();
    return () => clearInterval(watchdog);
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
  if (document.body.dataset.page !== "browser") {
    document.body.prepend(renderLight(), renderTopbar());
  }
  document.body.prepend(el("div", { class: "wallpaper", "aria-hidden": "true" }));
  document.body.append(renderFrame(), renderLoader(), ...renderSettings(), el("div", { class: "toasts", "aria-live": "polite" }));
  document.addEventListener("keydown", (e) => e.key === "Escape" && closeSettings());

  applyTheme(store.get("theme", "midnight"));
  applyGlass(store.get("glass", "clear"));
  applyTint(store.get("tint", "none"), store.get("tint-custom"));
  applyWallpaper();
  applyFx();
  applyCloak();
  if (store.get("autoblank", false) && !inFrame()) launchBlank();
  startPing((ms) => {
    const label = ms === null ? "Offline" : `${ms} ms`;
    const node = document.getElementById("settings-ping");
    if (node) node.textContent = label;
    document.dispatchEvent(new CustomEvent("bw:ping", { detail: ms }));
  });

  window.BW = {
    store, toast, toUrl, el, icon, showLoader, openSettings, dropdown, engineDropdown,
    DISCORD, ENGINES, VERSION, IS_STATIC, CONFIG,
    ENGINES_PROXY, TRANSPORTS, GLASS_STYLES, TINTS, THEME_LABELS, GAME_PROVIDERS, FX,
    applyTheme, applyGlass, applyTint, applyWallpaper, setWallpaper, applyFx, applyLowRam,
    readImageFile, lowRamOn, defaultWisp,
  };
})();
