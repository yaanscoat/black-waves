import { engine } from "./engine.js";
import { resolveInput, formatForDisplay } from "./url.js";
import * as settings from "./settings.js";
import { TabManager } from "./tabs.js";
import * as internal from "./internal.js";
import { registerInternalPages } from "./internal-pages.js";
import { applyCloak } from "./cloak.js";
const $ = (selector) => document.querySelector(selector);
const addressBar = $("#address");
const frames = $("#frames");
const status = $("#status");
let addressBarFocused = false;
addressBar.addEventListener("focus", () => (addressBarFocused = true));
addressBar.addEventListener("blur", () => (addressBarFocused = false));
registerInternalPages();
const tabs = new TabManager(frames);
const tabStrip = $("#tabs");
tabs.onChange(() => render());
const currentSession = () => tabs.active?.session ?? null;
const currentUrl = () => tabs.active?.url ?? "";
const currentTitle = () => tabs.active?.title ?? "";
const isLoading = () => tabs.active?.loading ?? false;
const canGoBack = () => tabs.active?.canGoBack ?? false;
const canGoForward = () => tabs.active?.canGoForward ?? false;
const goBack = () => tabs.active?.back() ?? null;
const goForward = () => tabs.active?.forward() ?? null;
const renderTabs = () => {
    const nodes = tabs.tabs.map(tab => {
        const el = document.createElement("div");
        el.className = tab.id === tabs.activeId ? "tab tab--active" : "tab";
        el.setAttribute("role", "tab");
        el.setAttribute("aria-selected", String(tab.id === tabs.activeId));
        el.tabIndex = 0;
        const label = document.createElement("span");
        label.className = "tab__label";
        label.textContent = tab.loading ? "loading" : tab.title;
        label.title = tab.url || tab.title;
        const close = document.createElement("button");
        close.className = "tab__close";
        close.type = "button";
        close.setAttribute("aria-label", `Close ${tab.title}`);
        close.textContent = "x";
        close.addEventListener("click", event => {
            event.stopPropagation();
            tabs.close(tab.id);
        });
        el.append(label, close);
        el.addEventListener("click", () => tabs.select(tab.id));
        el.addEventListener("keydown", event => {
            switch (event.key) {
                case "Enter":
                case " ":
                    event.preventDefault();
                    tabs.select(tab.id);
                    break;
            }
        });
        el.addEventListener("auxclick", event => {
            if (event.button === 1) {
                event.preventDefault();
                tabs.close(tab.id);
            }
        });
        return el;
    });
    const add = document.createElement("button");
    add.type = "button";
    add.setAttribute("aria-label", "New tab");
    add.title = "New tab";
    add.textContent = "+";
    add.addEventListener("click", () => {
        tabs.open();
        void navigate(startUrl());
        addressBar.focus();
    });
    tabStrip.replaceChildren(...nodes, add);
};
const startUrl = () => {
    const configured = settings.get("homeUrl");
    if (configured)
        return configured;
    return internal.homeUrl;
};
const searchTemplate = () => {
    return settings.get("searchEngine");
};
const navigate = async (input, options = {}) => {
    const { url, kind } = resolveInput(input, searchTemplate());
    switch (kind) {
        case "empty":
            return;
        case "blocked":
            setStatus("That address cannot be opened through the proxy.");
            return;
        case "external":
            location.assign(url);
            return;
        case "internal": {
            const html = internal.render(url);
            if (html === null)
                return;
            const tab = tabs.active ?? tabs.open();
            if (options.record !== false)
                tab.internalHistory.push(url);
            if (options.record !== false)
                tab.record(url);
            tab.url = url;
            tab.title = url.replace("blackwaves://", "");
            tab.loading = false;
            tab.element.removeAttribute("src");
            tab.element.srcdoc = html;
            tabs.emit();
            return;
        }
        default: {
            setStatus("");
            const tab = tabs.active ?? tabs.open();
            if (options.record === false) {
                tab.url = url;
                tab.element.removeAttribute("srcdoc");
                await tab.ensureSession();
                tab.session.go(url);
                tabs.emit();
            }
            else {
                await tab.go(url);
            }
        }
    }
};
const refreshInternalPages = (names) => {
    for (const tab of tabs.tabs) {
        if (!internal.isInternal(tab.url) ||
            !names.includes(internal.pageName(tab.url) ?? ""))
            continue;
        const html = internal.render(tab.url);
        if (html !== null)
            tab.element.srcdoc = html;
    }
    tabs.emit();
};
addEventListener("message", event => {
    if (event.origin !== location.origin)
        return;
    if (!internal.isInternal(currentUrl()))
        return;
    if (event.source !== tabs.active?.element.contentWindow)
        return;
    const data = event.data;
    if (!data || typeof data !== "object")
        return;
    switch (data.type) {
        case "internal:open":
            if (typeof data.url === "string")
                void navigate(data.url);
            break;
        case "internal:settings": {
            if (!data.patch || typeof data.patch !== "object")
                break;
            const { rejected, persisted } = settings.set(data.patch);
            const saved = persisted
                ? "Saved."
                : "Applied for this session, but browser storage is unavailable.";
            setStatus(rejected.length
                ? `${saved} Invalid values reset: ${rejected.join(", ")}.`
                : saved);
            void applyTransport();
            applyCloak();
            void navigate(currentUrl());
            break;
        }
        case "internal:action":
            switch (data.action) {
                case "reset-settings":
                    const { persisted } = settings.reset();
                    void applyTransport();
                    applyCloak();
                    setStatus(persisted
                        ? "Settings reset."
                        : "Reset for this session, but browser storage is unavailable.");
                    void navigate(currentUrl());
                    break;
            }
            break;
        case "internal:popup-blocked":
            setStatus("The browser blocked the popup.");
            break;
    }
});
const applyTransport = async () => {
    try {
        await engine.setTransport?.({
            kind: settings.get("transport"),
            wisp: settings.get("wispUrl")
        });
    }
    catch (error) {
        setStatus(`Could not switch transport: ${error.message}`);
    }
};
const render = () => {
    renderTabs();
    const url = currentUrl();
    if (!addressBarFocused)
        addressBar.value = url ? formatForDisplay(url) : "";
    $("#back").disabled = !canGoBack();
    $("#forward").disabled = !canGoForward();
    $("#reload").disabled =
        !currentSession() && !internal.isInternal(url);
    if (isLoading())
        setStatus("Loading");
    else if (status.textContent === "Loading")
        setStatus("");
};
const setStatus = (message) => {
    status.textContent = message ?? "";
    status.hidden = !message;
};
$("#omnibox").addEventListener("submit", event => {
    event.preventDefault();
    addressBar.blur();
    void navigate(addressBar.value);
});
$("#back").addEventListener("click", () => {
    const url = goBack();
    if (url)
        void navigate(url, { record: false });
});
$("#forward").addEventListener("click", () => {
    const url = goForward();
    if (url)
        void navigate(url, { record: false });
});
$("#reload").addEventListener("click", () => {
    if (internal.isInternal(currentUrl())) {
        void navigate(currentUrl());
        return;
    }
    currentSession()?.reload();
});
const menu = $("#menu");
const menuToggle = $("#menu-toggle");
const menuRoot = menu;
const closeMenu = () => {
    menu.hidden = true;
    menuToggle.setAttribute("aria-expanded", "false");
};
menuToggle.addEventListener("click", () => {
    menu.hidden = !menu.hidden;
    menuToggle.setAttribute("aria-expanded", String(!menu.hidden));
});
for (const button of menuRoot.querySelectorAll("[data-open]")) {
    button.addEventListener("click", () => {
        closeMenu();
        void navigate(button.dataset.open);
    });
}
applyCloak();
addEventListener("keydown", event => {
    if (!(event.ctrlKey || event.metaKey))
        return;
    switch (event.key) {
        case "l":
            event.preventDefault();
            addressBar.focus();
            addressBar.select();
            break;
        case "t":
            event.preventDefault();
            tabs.open();
            void navigate(startUrl());
            addressBar.focus();
            break;
    }
});
void applyTransport();
engine.init().catch(() => setStatus("Could not reach the proxy backend."));
tabs.open();
void navigate(startUrl());
