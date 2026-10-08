(function () {
  const { proxy, engineDropdown } = window.BW;
  const form = document.getElementById("home-search");
  const input = document.getElementById("home-query");
  const chip = document.getElementById("status-chip");

  const hour = new Date().getHours();
  document.getElementById("greeting").textContent =
    hour < 5 ? "Up late?" : hour < 12 ? "Good morning." : hour < 17 ? "Good afternoon." : hour < 21 ? "Good evening." : "Good night.";

  // Search-engine picker inside the search bar (same glass dropdown as Settings).
  const engine = engineDropdown({ align: "right" });
  engine.classList.add("engine");
  document.getElementById("engine-label").replaceWith(engine);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!input.value.trim()) return;
    proxy.open(input.value);
    input.value = "";
  });

  document.addEventListener("bw:ping", (e) => {
    const ms = e.detail;
    const tone = ms === null ? "bad" : ms < 150 ? "good" : "warn";
    chip.replaceChildren(
      Object.assign(document.createElement("span"), { className: `dot ${tone}` }),
      document.createTextNode(ms === null ? "Offline" : `Connected · ${ms} ms`)
    );
  });
})();
