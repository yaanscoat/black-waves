(function () {
  const { el, icon, proxy } = window.BW;
  const APPS = [
    { title: "YouTube", url: "https://www.youtube.com", icon: "fa-brands fa-youtube", color: "#ff0033" },
    { title: "Google", url: "https://www.google.com", icon: "fa-brands fa-google", color: "#4285f4" },
    { title: "Discord", url: "https://discord.com/app", icon: "fa-brands fa-discord", color: "#5865f2" },
    { title: "Spotify", url: "https://open.spotify.com", icon: "fa-brands fa-spotify", color: "#1ed760" },
    { title: "Reddit", url: "https://www.reddit.com", icon: "fa-brands fa-reddit-alien", color: "#ff4500" },
    { title: "X", url: "https://x.com", icon: "fa-brands fa-x-twitter", color: "#e7e9ea" },
    { title: "Twitch", url: "https://www.twitch.tv", icon: "fa-brands fa-twitch", color: "#a970ff" },
    { title: "TikTok", url: "https://www.tiktok.com", icon: "fa-brands fa-tiktok", color: "#25f4ee" },
    { title: "Instagram", url: "https://www.instagram.com", icon: "fa-brands fa-instagram", color: "#e1306c" },
    { title: "GitHub", url: "https://github.com", icon: "fa-brands fa-github", color: "#e6edf3" },
    { title: "SoundCloud", url: "https://soundcloud.com", icon: "fa-brands fa-soundcloud", color: "#ff5500" },
    { title: "Wikipedia", url: "https://www.wikipedia.org", icon: "fa-brands fa-wikipedia-w", color: "#e6e6e6" },
    { title: "Steam", url: "https://store.steampowered.com", icon: "fa-brands fa-steam", color: "#66c0f4" },
    { title: "Pinterest", url: "https://www.pinterest.com", icon: "fa-brands fa-pinterest", color: "#e60023" },
    { title: "GeForce NOW", url: "https://play.geforcenow.com", icon: "fa-solid fa-cloud", color: "#76b900" },
    { title: "now.gg", url: "https://now.gg", icon: "fa-solid fa-mobile-screen", color: "#18e3a6" },
  ];

  const grid = document.getElementById("apps-grid");
  const search = document.getElementById("apps-search");

  function card(app) {
    const media = el("div", { class: "tile-media fallback" }, icon(app.icon));
    media.style.color = app.color;
    media.style.background = `radial-gradient(70% 70% at 50% 35%, ${app.color}22, transparent 70%), #0e0e12`;
    return el("button", { class: "tile", type: "button", title: app.title, onclick: () => proxy.open(app.url) }, [
      media,
      el("div", { class: "tile-title", text: app.title }),
    ]);
  }

  function render() {
    const q = search.value.trim().toLowerCase();
    const list = APPS.filter((app) => app.title.toLowerCase().includes(q));
    grid.replaceChildren(...(list.length ? list.map(card) : [el("p", { class: "empty", text: "No apps match that search." })]));
  }

  search.addEventListener("input", render);
  render();
})();
