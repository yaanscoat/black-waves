import { definePage, escapeHtml, listPages } from "./internal.js";
import { engine } from "./engine.js";
import * as settings from "./settings.js";
const transportOptions = [
    { id: "libcurl", label: "libcurl", detail: "curl in WebAssembly, over wisp. Widest site compatibility." },
    { id: "epoxy", label: "epoxy", detail: "A Rust TLS stack in WebAssembly, over wisp. Smaller than libcurl." },
    { id: "bare", label: "bare", detail: "The only transport that runs on request/response serverless hosts. Your server can inspect target request and response data, and WebSocket sites will not work." }
];
const options = (list, selected, valueOf) => list
    .map(item => `<option value="${escapeHtml(valueOf(item))}"${valueOf(item) === selected ? " selected" : ""}>${escapeHtml(item.label)}</option>`)
    .join("");
const row = (name, def, control) => `
  <div class="field">
    <label for="f-${name}">${escapeHtml(def.label)}</label>
    ${control}
    ${def.help ? `<p class="field__help">${escapeHtml(def.help)}</p>` : ""}
  </div>`;
const control = (name, def, value) => {
    switch (name) {
        case "searchEngine":
            return `<select id="f-${name}" name="${name}">${options(settings.searchEngines, value, e => e.template)}</select>`;
        case "transport":
            return `<select id="f-${name}" name="${name}">${options(transportOptions, value, t => t.id)}</select>`;
        case "cloakPreset":
            return `<select id="f-${name}" name="${name}">${settings.cloakPresets
                .map(preset => `<option value="${preset.id}" data-title="${escapeHtml(preset.title)}" data-favicon="${escapeHtml(preset.favicon)}"${preset.id === value ? " selected" : ""}>${escapeHtml(preset.label)}</option>`)
                .join("")}</select>`;
        default:
            const type = ["homeUrl", "wispUrl", "cloakFavicon"].includes(name)
                ? "url"
                : "text";
            const custom = ["cloakTitle", "cloakFavicon"].includes(name)
                ? " data-custom-cloak"
                : "";
            return typeof def.default === "boolean"
                ? `<input id="f-${name}" type="checkbox" name="${name}"${value ? " checked" : ""}>`
                : `<input id="f-${name}" type="${type}" name="${name}" value="${escapeHtml(value ?? "")}" autocomplete="off" spellcheck="false"${custom}>`;
    }
};
export const registerInternalPages = () => {
    definePage("home", {
        title: "new tab",
        render: () => `
      <main class="internal">
        <h1>Blackwaves</h1>
        <p>type an address above</p>
        <ul>
          ${listPages()
            .filter(page => page.name !== "home")
            .map(page => `<li><a href="#" data-open="${page.url}">${escapeHtml(page.url)}</a></li>`)
            .join("")}
        </ul>
      </main>`
    });
    definePage("about", {
        title: "about",
        render: () => {
            const sj = window.$scramjet;
            const facts = [
                ["engine", "Scramjet"],
                ["version", sj?.versionInfo?.version ?? "2.0.67-alpha.2"],
                [
                    "transport",
                    engine.getTransport?.().kind ?? "libcurl"
                ],
                ["cross-origin isolated", crossOriginIsolated ? "yes" : "no"],
                [
                    "service worker",
                    navigator.serviceWorker?.controller?.scriptURL ??
                        "not controlling"
                ]
            ];
            return `
      <main class="internal">
        <h1>about</h1>
        <ul>
          ${facts
                .map(([k, v]) => `<li>${escapeHtml(k)}: <span class="dim">${escapeHtml(v)}</span></li>`)
                .join("")}
        </ul>
      </main>`;
        }
    });
    definePage("settings", {
        title: "settings",
        render: () => {
            const current = settings.all();
            const fields = Object.entries(settings.schema);
            const section = (id, label) => {
                const rows = fields
                    .filter(([, def]) => def.section === id)
                    .map(([name, def]) => row(name, def, control(name, def, current[name])))
                    .join("");
                if (!rows)
                    return "";
                const preset = settings.cloakPresets.find(item => item.id === settings.get("cloakPreset"));
                const cloakTitle = preset && preset.id !== "custom"
                    ? preset.title
                    : settings.get("cloakTitle");
                const cloakFavicon = preset && preset.id !== "custom"
                    ? preset.favicon
                    : settings.get("cloakFavicon");
                const extra = id === "cloaking"
                    ? `<div class="actions">
                 <button type="button" data-action="cloak-aboutblank" data-cloak-title="${escapeHtml(cloakTitle)}" data-cloak-favicon="${escapeHtml(cloakFavicon)}">open in about:blank</button>
                 <button type="button" data-action="cloak-blob" data-cloak-title="${escapeHtml(cloakTitle)}" data-cloak-favicon="${escapeHtml(cloakFavicon)}">open as blob</button>
               </div>`
                    : "";
                return `<h2>${escapeHtml(label)}</h2>${rows}${extra}`;
            };
            return `
        <main class="internal">
          <h1>settings</h1>
          <form data-settings-form>
            ${settings.sections.map(s => section(s.id, s.label)).join("")}
            <div class="actions">
              <button type="submit">save</button>
              <button type="button" data-action="reset-settings">reset</button>
            </div>
          </form>
        </main>`;
        }
    });
};
