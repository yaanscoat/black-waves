// Runtime configuration. `npm run build:static` rewrites this file inside the
// built output, so a copy deployed to a static host knows it has no backend of
// its own and where to open its Wisp websocket instead.
window.BW_CONFIG = {
  // true  -> no /w, /cdn or /movies endpoints exist; the frontend works around it
  static: false,
  // Wisp endpoint for self-hosted builds (null = this origin's own /w/)
  wisp: null,
  // Wisp endpoint used when the build is static
  publicWisp: "wss://wisp.mercurywork.shop/",
};
