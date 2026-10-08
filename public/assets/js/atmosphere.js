// Atmosphere: three slanted light beams with dust drifting through them, and
// the pointer-tracked specular highlight on liquid-glass surfaces.
(function () {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- Liquid glass highlight ----------
  const GLASS = ".topbar, .btn, .input, .tile, .select, .drawer, .toast, .frame-bar, .status-chip";
  let lit = null;
  function light(target, x, y) {
    const glass = target && target.closest ? target.closest(GLASS) : null;
    if (lit && lit !== glass) lit.classList.remove("glass-lit");
    lit = glass;
    if (!glass) return;
    const rect = glass.getBoundingClientRect();
    glass.style.setProperty("--mx", `${((x - rect.left) / rect.width) * 100}%`);
    glass.style.setProperty("--my", `${((y - rect.top) / rect.height) * 100}%`);
    glass.classList.add("glass-lit");
  }
  document.addEventListener("pointermove", (e) => light(e.target, e.clientX, e.clientY), { passive: true });
  document.addEventListener("pointerdown", (e) => light(e.target, e.clientX, e.clientY), { passive: true });
  document.addEventListener("pointerleave", () => light(null));

  // ---------- Light beams + dust ----------
  const canvas = document.getElementById("dust");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const frameView = document.getElementById("frame-view");
  const beamEls = [...document.querySelectorAll(".beam")];
  const ANGLE = Math.PI / 4; // 45deg, pointing down and to the right
  const DIR = { x: Math.cos(ANGLE), y: Math.sin(ANGLE) };
  // Beam sources sit off the top-left edge; thickness and offset are fractions
  // of the viewport so the layout scales.
  const BEAMS = [
    { x: -0.12, y: 0.06, thick: 0.13, power: 1, period: 8000, phase: 4000 },
    { x: 0.1, y: -0.22, thick: 0.19, power: 0.85, period: 11000, phase: 7000 },
    { x: 0.36, y: -0.42, thick: 0.1, power: 0.75, period: 9500, phase: 1500 },
  ];
  let width = 0, height = 0, beams = [];
  let motes = [];
  const pointer = { x: -1e4, y: -1e4, vx: 0, vy: 0, t: 0 };

  // Dust colour follows the theme's light colour (--light in main.css).
  let dustColor = "rgb(236, 241, 255)";
  function readColor() {
    const rgb = getComputedStyle(document.documentElement).getPropertyValue("--light").trim();
    // Mix toward white: dust in a beam reads brighter than the beam itself.
    const mixed = rgb.split(",").map((c) => Math.round(parseFloat(c) * 0.55 + 255 * 0.45));
    if (mixed.length === 3 && mixed.every((n) => !Number.isNaN(n))) dustColor = `rgb(${mixed.join(",")})`;
  }
  readColor();
  document.addEventListener("bw:theme", readColor);

  function layout() {
    width = window.innerWidth;
    height = window.innerHeight;
    // The dust is soft, so a 1x canvas looks the same and uses a quarter of
    // the memory of a 2x one on high-DPI screens.
    canvas.width = width;
    canvas.height = height;
    const span = Math.hypot(width, height);
    beams = BEAMS.map((b, i) => {
      const beam = { ...b, sx: b.x * width, sy: b.y * height, half: (b.thick * span) / 2, length: span * 1.5 };
      const node = beamEls[i];
      if (node) {
        node.style.width = `${beam.length}px`;
        node.style.height = `${beam.half * 2}px`;
        node.style.transform = `translate(${beam.sx}px, ${beam.sy - beam.half}px) rotate(45deg)`;
        node.style.opacity = "";
      }
      return beam;
    });
    let target = Math.round(Math.min(110, Math.max(36, (width * height) / 14000)));
    if (document.documentElement.classList.contains("low-fx")) target = Math.ceil(target / 2);
    while (motes.length < target) motes.push(spawn());
    motes.length = target;
  }

  // Brightness of the light at a point: strongest along each beam's centre
  // line, soft at the edges, fading with distance from the source.
  function lightAt(x, y, t) {
    let total = 0;
    for (const b of beams) {
      const px = x - b.sx, py = y - b.sy;
      const along = px * DIR.x + py * DIR.y;
      if (along <= 0) continue;
      const across = Math.abs(px * DIR.y - py * DIR.x) / b.half;
      if (across >= 1) continue;
      const shimmer = 0.85 + 0.15 * Math.sin(((t + b.phase) / b.period) * Math.PI * 2);
      total += b.power * (1 - across * across) * Math.exp(-along / (b.length * 0.55)) * shimmer;
    }
    return Math.min(1, total);
  }

  // New motes start somewhere inside a beam, so the light always has dust in it.
  function spawn() {
    const b = beams[Math.floor(Math.random() * beams.length)] || { sx: 0, sy: 0, half: 100, length: 1000 };
    const along = Math.random() * b.length * 0.7;
    const across = (Math.random() * 2 - 1) * b.half * 0.9;
    const z = Math.pow(Math.random(), 1.5);
    // Each mote is a tiny curved fibre: a short arc that slowly tumbles.
    return {
      x: b.sx + DIR.x * along + DIR.y * across,
      y: b.sy + DIR.y * along - DIR.x * across,
      z,
      len: 2.5 + z * 6 + Math.random() * 3,
      bend: (Math.random() - 0.5) * 1.4, // curvature, as a fraction of the length
      thick: 0.5 + z * 0.9,
      angle: Math.random() * Math.PI * 2,
      turn: (Math.random() - 0.5) * 0.012, // tumble speed (radians per frame)
      vx: (Math.random() - 0.5) * 0.12,
      vy: (Math.random() - 0.5) * 0.12,
      phase: Math.random() * Math.PI * 2,
      base: 0.5 + Math.random() * 0.5,
      dark: 0,
    };
  }

  window.addEventListener("pointermove", (e) => {
    const now = performance.now();
    const dt = Math.max(16, now - pointer.t);
    if (pointer.t) {
      pointer.vx = ((e.clientX - pointer.x) / dt) * 16;
      pointer.vy = ((e.clientY - pointer.y) / dt) * 16;
    }
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.t = now;
  }, { passive: true });

  // Adaptive quality: if the first couple of seconds run well under 30 fps,
  // switch to low-effects mode (see .low-fx in main.css) and thin the dust.
  const probe = { start: 0, frames: 0, done: false };
  function measure(now) {
    if (probe.done) return;
    if (!probe.start) probe.start = now;
    probe.frames++;
    const elapsed = now - probe.start;
    if (elapsed < 2000) return;
    probe.done = true;
    if ((probe.frames / elapsed) * 1000 < 30) {
      document.documentElement.classList.add("low-fx");
      motes.length = Math.ceil(motes.length / 2);
    }
  }

  function draw(m, t) {
    const lit = lightAt(m.x, m.y, t);
    // Dust is only visible where light hits it.
    if (lit < 0.02) return false;
    // A fibre flashes brightest when it lies across the beam and dims when it
    // turns end-on, like real lint tumbling through sunlight.
    const facing = Math.abs(Math.sin(m.angle - ANGLE));
    const alpha = Math.min(1, m.base * lit * (0.3 + 0.7 * facing * facing) * 1.6);
    if (alpha < 0.015) return true;
    const half = m.len / 2;
    const cx = Math.cos(m.angle), sy = Math.sin(m.angle);
    const bx = -sy * m.bend * m.len, by = cx * m.bend * m.len;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = m.thick;
    ctx.beginPath();
    ctx.moveTo(m.x - cx * half, m.y - sy * half);
    ctx.quadraticCurveTo(m.x + bx, m.y + by, m.x + cx * half, m.y + sy * half);
    ctx.stroke();
    return true;
  }

  let last = performance.now();
  function frame(now) {
    if (document.hidden || (frameView && frameView.classList.contains("open"))) {
      last = now;
      return setTimeout(() => requestAnimationFrame(frame), 500);
    }
    measure(now);
    const dt = Math.min(3, (now - last) / 16.67);
    last = now;
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = dustColor;
    ctx.lineCap = "round";
    pointer.vx *= 0.9;
    pointer.vy *= 0.9;

    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      const depth = 0.35 + m.z * 0.9; // parallax: near motes cross the screen faster
      // Brownian jitter + slow convection currents, with a whisper of settling.
      m.vx += ((Math.random() - 0.5) * 0.026 + Math.sin(m.y * 0.0045 + now * 0.00021 + m.phase) * 0.0032) * dt;
      m.vy += ((Math.random() - 0.5) * 0.026 + Math.cos(m.x * 0.0032 + now * 0.00016) * 0.0024 + 0.0008) * dt;
      // Air pushed by the pointer stirs nearby motes.
      const dx = m.x - pointer.x, dy = m.y - pointer.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 25600) {
        const f = (1 - Math.sqrt(d2) / 160) * 0.045 * depth;
        m.vx += pointer.vx * f;
        m.vy += pointer.vy * f;
      }
      const damp = Math.pow(0.982, dt);
      m.vx *= damp;
      m.vy *= damp;
      m.x += m.vx * depth * dt;
      m.y += m.vy * depth * dt;
      m.angle += (m.turn + m.vx * 0.01) * dt;

      // A mote that has drifted out of the light for a while is recycled into a beam.
      if (draw(m, now)) m.dark = 0;
      else if (++m.dark > 90 || m.x < -40 || m.y > height + 40 || m.x > width + 40) motes[i] = spawn();
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(frame);
  }

  layout();
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layout, 150);
  });
  if (reduceMotion) {
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = dustColor;
    ctx.lineCap = "round";
    for (const m of motes) draw(m, 0);
  } else {
    requestAnimationFrame(frame);
  }
})();
