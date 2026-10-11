// Canvas confetti for the homepage logo. Bursts are pure canvas particles with
// no libraries and no idle cost: the animation frame is cancelled the moment the
// last piece leaves the screen, so a page nobody is celebrating on runs the same
// as one without this file. Clicking the logo as fast as you can just stacks
// bursts on top of each other — there is deliberately no cooldown.
(function () {
  const MAX_PARTICLES = 900;
  const GRAVITY = 1150; // px/s^2 — floaty enough to read as confetti, not shrapnel
  const STILL = ["#7cf4ff", "#a97bff", "#ff8ad4", "#ffd166", "#8effc1", "#ffffff"];

  let canvas = null;
  let ctx = null;
  let parts = [];
  let rings = [];
  let raf = 0;
  let last = 0;

  const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lowRam = () => document.documentElement.classList.contains("low-ram");

  // Colour of the current theme's light beams, so the confetti always belongs to
  // whatever palette is on screen rather than fighting it.
  function palette() {
    let light = "226, 233, 255";
    try {
      light = (getComputedStyle(document.documentElement).getPropertyValue("--light") || "").trim() || light;
    } catch {}
    return [`rgb(${light})`, ...STILL];
  }

  function ensure() {
    if (canvas) return;
    canvas = document.createElement("canvas");
    canvas.className = "confetti-layer";
    canvas.setAttribute("aria-hidden", "true");
    document.body.append(canvas);
    ctx = canvas.getContext("2d");
    resize();
    window.addEventListener("resize", resize, { passive: true });
  }

  function resize() {
    if (!canvas) return;
    // Capped at 2x so a 4K display doesn't quadruple the fill cost.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function burst(x, y, { count = 100, power = 1 } = {}) {
    ensure();
    const scale = (reducedMotion() ? 0.45 : 1) * (lowRam() ? 0.6 : 1);
    const n = Math.max(12, Math.round(count * scale));
    const cols = palette();

    for (let i = 0; i < n; i++) {
      // Every third piece is a long streamer; the rest are chips.
      const streamer = i % 3 === 0;
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.25;
      const speed = (300 + Math.random() * 560) * power;
      parts.push({
        x: x + (Math.random() - 0.5) * 18,
        y: y + (Math.random() - 0.5) * 18,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        w: streamer ? 3 + Math.random() * 3 : 5 + Math.random() * 7,
        h: streamer ? 14 + Math.random() * 16 : 5 + Math.random() * 7,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 14,
        phase: Math.random() * Math.PI * 2,
        vp: 5 + Math.random() * 9,
        color: cols[(Math.random() * cols.length) | 0],
        life: 1,
        decay: 0.12 + Math.random() * 0.18,
      });
    }

    // Spamming past the cap drops the oldest pieces instead of growing forever.
    if (parts.length > MAX_PARTICLES) parts.splice(0, parts.length - MAX_PARTICLES);
    if (!reducedMotion()) rings.push({ x, y, r: 8, max: 140 + power * 80, alpha: 0.5, color: cols[0] });

    start();
  }

  function start() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function frame(now) {
    raf = 0;
    const dt = Math.min(0.034, Math.max(0, (now - last) / 1000));
    last = now;
    ctx.clearRect(0, 0, innerWidth, innerHeight);

    for (let i = rings.length - 1; i >= 0; i--) {
      const ring = rings[i];
      ring.r += (ring.max - ring.r) * Math.min(1, dt * 7);
      ring.alpha *= Math.pow(0.0025, dt);
      if (ring.alpha < 0.02) {
        rings.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = ring.alpha;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = 3 * ring.alpha + 0.6;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
      ctx.stroke();
    }

    const drag = Math.pow(0.5, dt); // air resistance per frame, independent of fps
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.vy += GRAVITY * dt;
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.phase += p.vp * dt;
      p.life -= p.decay * dt;
      if (p.life <= 0 || p.y > innerHeight + 60 || p.x < -100 || p.x > innerWidth + 100) {
        parts.splice(i, 1);
        continue;
      }
      draw(p);
    }

    ctx.globalAlpha = 1;
    if (parts.length || rings.length) raf = requestAnimationFrame(frame);
  }

  // The |cos(phase)| squash fakes a piece of paper tumbling in three
  // dimensions without paying for any 3D maths.
  function draw(p) {
    ctx.globalAlpha = Math.min(1, p.life * 2.2);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.scale(1, Math.max(0.18, Math.abs(Math.cos(p.phase))));
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  }

  window.BW = window.BW || {};
  window.BW.confetti = { burst };
})();
