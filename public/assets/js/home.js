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

  // The logo is a party popper. There is no cooldown on purpose — clicking it
  // as fast as you can simply stacks bursts on top of each other.
  const confetti = window.BW && window.BW.confetti;
  const mark = document.querySelector(".home-mark");
  const word = document.querySelector(".wordmark");
  const celebrate = (node) => {
    if (!confetti || !node) return;
    const rect = node.getBoundingClientRect();
    confetti.burst(rect.left + rect.width / 2, rect.top + rect.height / 2, { count: 110, power: 1 });
    // Restart the pop animation; without the reflow it won't re-run on a second
    // click that lands while the first one is still playing.
    node.classList.remove("logo-pop");
    void node.offsetWidth;
    node.classList.add("logo-pop");
  };
  for (const node of [mark, word]) {
    if (!node) continue;
    node.addEventListener("click", () => celebrate(node));
  }
  if (mark) {
    mark.role = "button";
    mark.tabIndex = 0;
    mark.title = "Tap the logo";
    mark.setAttribute("aria-label", "Celebrate");
    mark.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        celebrate(mark);
      }
    });
  }
  if (word) word.title = "Tap the wordmark";

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
