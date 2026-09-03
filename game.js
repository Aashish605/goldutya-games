/* Goldutya Fly — production flappy. Viewport-pixel world, classic feel. */

"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const startBtn = document.getElementById("startBtn");
const bestEl = document.getElementById("best");

const GOLD = "#F5C518";
const GOLD2 = "#FFDF59";
const RED = "#D42B2B";
const DARK = "#0B0B0D";

let W = 390;
let H = 844;
let DPR = 1;
let GROUND_H = 70;
let PIPE_W = 70;
let PIPE_GAP = 190;
let PIPE_SPEED = 3.2;
let PIPE_SPACING = 220;
let GRAVITY = 0.45;
let FLAP_V = -8.5;
let DUCK_W = 56;
let DUCK_H = 47;

function fitCanvas() {
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, rect.width);
  const cssH = Math.max(1, rect.height);
  DPR = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssW * DPR);
  canvas.height = Math.round(cssH * DPR);
  W = cssW;
  H = cssH;
  GROUND_H = Math.max(64, Math.round(H * 0.13));
  PIPE_W = Math.max(58, Math.min(90, Math.round(W * 0.18)));
  PIPE_GAP = Math.max(150, Math.min(240, Math.round(H * 0.23)));
  PIPE_SPEED = Math.max(2.8, Math.min(5.2, W * 0.008));
  PIPE_SPACING = Math.max(180, Math.round(W * 0.58));
  GRAVITY = H * 0.00125;
  FLAP_V = -H * 0.021;
  DUCK_W = Math.max(48, Math.min(72, Math.min(W, H) * 0.12));
  DUCK_H = DUCK_W * 0.83;
}

if (typeof ResizeObserver !== "undefined") {
  new ResizeObserver(fitCanvas).observe(canvas);
} else {
  window.addEventListener("resize", fitCanvas);
}

const duckImg = new Image();
duckImg.src = "assets/duck.svg";

const states = { READY: "ready", PLAY: "play", OVER: "over" };
let duck, pipes, clouds, score, best, state, frame, particles, invuln;

best = Number(localStorage.getItem("goldutya-fly-best") || 0);
bestEl.textContent = best;

/* ---------- audio ---------- */
let audioCtx = null;
function initAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    audioCtx = null;
  }
}
function beep(freq, dur, type, vol) {
  if (!audioCtx) return;
  if (audioCtx.state === "suspended") audioCtx.resume();
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.55), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(audioCtx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}
function quack() {
  beep(340, 0.14, "sawtooth", 0.16);
}
function scoreBlip() {
  beep(980, 0.09, "square", 0.1);
}
function thud() {
  beep(110, 0.28, "sine", 0.28);
}

function reset() {
  fitCanvas();
  duck = {
    x: W * 0.32,
    y: H * 0.42,
    w: DUCK_W,
    h: DUCK_H,
    vy: 0,
    rot: 0,
    t: 0,
  };
  pipes = [];
  clouds = [];
  for (let i = 0; i < 5; i++) {
    clouds.push({
      x: Math.random() * W,
      y: H * (0.08 + Math.random() * 0.35),
      s: 0.5 + Math.random() * 0.8,
      a: 0.12 + Math.random() * 0.12,
    });
  }
  score = 0;
  frame = 0;
  particles = [];
  invuln = 40;
  state = states.READY;
}

reset();

/* ---------- duck ---------- */
function drawDuck() {
  ctx.save();
  ctx.translate(duck.x, duck.y);
  ctx.rotate(duck.rot);
  const bob = state === states.READY ? Math.sin(duck.t * 0.12) * 6 : 0;
  ctx.translate(0, bob);
  if (duckImg.complete && duckImg.naturalWidth > 0) {
    ctx.drawImage(duckImg, -duck.w / 2, -duck.h / 2, duck.w, duck.h);
  } else {
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.ellipse(0, 0, duck.w / 2, duck.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* ---------- pipes ---------- */
function spawnPipe() {
  const playable = H - GROUND_H;
  const minCenter = PIPE_GAP / 2 + 24;
  const maxCenter = playable - PIPE_GAP / 2 - 24;
  const center = minCenter + Math.random() * Math.max(1, maxCenter - minCenter);
  pipes.push({
    x: W + PIPE_W,
    gapY: center,
    scored: false,
  });
}

function drawPipes() {
  for (const p of pipes) {
    const topH = p.gapY - PIPE_GAP / 2;
    const botY = p.gapY + PIPE_GAP / 2;
    const botH = H - GROUND_H - botY;
    const cap = Math.max(18, Math.round(H * 0.028));

    const grad = ctx.createLinearGradient(p.x, 0, p.x + PIPE_W, 0);
    grad.addColorStop(0, "#0B6B3A");
    grad.addColorStop(0.45, "#14B35A");
    grad.addColorStop(1, "#0B6B3A");
    ctx.fillStyle = grad;

    if (topH > 0) ctx.fillRect(p.x, 0, PIPE_W, topH);
    if (botH > 0) ctx.fillRect(p.x, botY, PIPE_W, botH);

    ctx.fillStyle = "#086033";
    ctx.fillRect(p.x - 6, topH - cap, PIPE_W + 12, cap);
    ctx.fillRect(p.x - 6, botY, PIPE_W + 12, cap);

    ctx.fillStyle = "rgba(245,197,24,0.55)";
    ctx.fillRect(p.x, topH - cap, 5, cap);
    ctx.fillRect(p.x, botY, 5, cap);
  }
}

/* ---------- clouds / ground / sky ---------- */
function drawSky() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#1a3a66");
  g.addColorStop(0.55, "#123056");
  g.addColorStop(1, "#0c2748");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const sun = ctx.createRadialGradient(W * 0.82, H * 0.14, 8, W * 0.82, H * 0.14, Math.max(80, W * 0.35));
  sun.addColorStop(0, "rgba(245,197,24,0.22)");
  sun.addColorStop(1, "rgba(245,197,24,0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "rgba(255,255,255,0.14)";
  for (const c of clouds) {
    ctx.globalAlpha = c.a;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, 48 * c.s, 18 * c.s, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x + 28 * c.s, c.y + 4, 32 * c.s, 14 * c.s, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x - 24 * c.s, c.y + 6, 28 * c.s, 12 * c.s, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawGround() {
  const gy = H - GROUND_H;
  ctx.fillStyle = "#0E7C45";
  ctx.fillRect(0, gy, W, GROUND_H);
  ctx.fillStyle = "#0A5E34";
  ctx.fillRect(0, gy, W, 10);
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, gy, W, 3);

  const dash = 46;
  const off = (frame * PIPE_SPEED * 0.55) % (dash * 2);
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  for (let x = -off; x < W; x += dash * 2) {
    ctx.fillRect(x, gy + GROUND_H * 0.45, dash * 0.65, 4);
  }
}

/* ---------- particles ---------- */
function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 1 + Math.random() * 4;
    particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - 1.5,
      life: 28 + Math.random() * 18,
      color,
      r: 2 + Math.random() * 3,
    });
  }
}
function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.14;
    p.life--;
    if (p.life <= 0) particles.splice(i, 1);
  }
}
function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.min(1, p.life / 24);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* ---------- input ---------- */
function flap() {
  initAudio();
  if (state === states.OVER) {
    reset();
  }
  if (state === states.READY) {
    state = states.PLAY;
    overlay.classList.add("hidden");
    invuln = 36;
  }
  if (state !== states.PLAY) return;
  duck.vy = FLAP_V;
  duck.rot = -0.45;
  quack();
  burst(duck.x - duck.w * 0.3, duck.y + duck.h * 0.2, GOLD, 4);
}

function handleKey(e) {
  if (e.code === "Space" || e.code === "ArrowUp") {
    e.preventDefault();
    flap();
  }
}
function tap(e) {
  e.preventDefault();
  flap();
}
document.addEventListener("keydown", handleKey);
canvas.addEventListener("pointerdown", tap);
startBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  flap();
});

/* ---------- collision ---------- */
function hitbox() {
  const hw = duck.w * 0.28;
  const hh = duck.h * 0.28;
  return {
    l: duck.x - hw,
    r: duck.x + hw,
    t: duck.y - hh,
    b: duck.y + hh,
  };
}

function collides() {
  const hb = hitbox();
  if (hb.t < 0) return true;
  if (hb.b > H - GROUND_H) return true;
  for (const p of pipes) {
    const topH = p.gapY - PIPE_GAP / 2;
    const botY = p.gapY + PIPE_GAP / 2;
    const inX = hb.r > p.x && hb.l < p.x + PIPE_W;
    if (!inX) continue;
    if (hb.t < topH || hb.b > botY) return true;
  }
  return false;
}

function gameOver() {
  if (state !== states.PLAY) return;
  state = states.OVER;
  thud();
  burst(duck.x, duck.y, RED, 18);
  burst(duck.x, duck.y, GOLD, 12);
  if (score > best) {
    best = score;
    localStorage.setItem("goldutya-fly-best", String(best));
    bestEl.textContent = best;
  }
  setTimeout(() => {
    if (state !== states.OVER) return;
    overlay.classList.remove("hidden");
    overlay.querySelector(".overlay-sub").textContent =
      score > 0
        ? "You scored " + score + (score === 1 ? " point!" : " points!")
        : "Quack. Try again.";
    overlay.querySelector(".btn").textContent = "PLAY AGAIN";
  }, 850);
}

/* ---------- update ---------- */
function update() {
  frame++;
  duck.t++;

  for (const c of clouds) {
    c.x -= (state === states.PLAY ? PIPE_SPEED : PIPE_SPEED * 0.25) * 0.22 * c.s;
    if (c.x < -80) {
      c.x = W + 60;
      c.y = H * (0.08 + Math.random() * 0.35);
    }
  }

  if (state === states.READY) {
    duck.rot = Math.sin(duck.t * 0.12) * 0.08;
    updateParticles();
    return;
  }

  duck.vy += GRAVITY;
  duck.y += duck.vy;
  duck.rot = Math.max(-0.55, Math.min(1.15, duck.vy * 0.055));

  if (state === states.OVER) {
    if (duck.y > H - GROUND_H - duck.h * 0.25) {
      duck.y = H - GROUND_H - duck.h * 0.25;
      duck.vy = 0;
    }
    updateParticles();
    return;
  }

  if (invuln > 0) invuln--;

  if (frame === 50) spawnPipe();
  const last = pipes[pipes.length - 1];
  if (last && last.x < W - PIPE_SPACING) spawnPipe();

  for (const p of pipes) p.x -= PIPE_SPEED;
  pipes = pipes.filter((p) => p.x + PIPE_W > -20);

  for (const p of pipes) {
    if (!p.scored && p.x + PIPE_W < duck.x) {
      p.scored = true;
      score++;
      scoreBlip();
      burst(duck.x + 16, duck.y - 18, GOLD2, 7);
    }
  }

  updateParticles();

  if (invuln <= 0 && collides()) gameOver();
}

/* ---------- HUD ---------- */
function drawScore() {
  if (state === states.READY) return;
  const size = Math.max(42, Math.round(H * 0.07));
  ctx.save();
  ctx.font = "700 " + size + 'px "Bebas Neue", sans-serif';
  ctx.textAlign = "center";
  ctx.lineWidth = Math.max(4, size * 0.1);
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.strokeText(String(score), W / 2, Math.max(72, H * 0.13));
  ctx.fillStyle = GOLD;
  ctx.fillText(String(score), W / 2, Math.max(72, H * 0.13));
  ctx.restore();
}

/* ---------- loop ---------- */
function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  drawSky();
  drawPipes();
  drawGround();
  drawParticles();
  drawDuck();
  drawScore();
}

function loop() {
  update();
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
document.addEventListener("pointerdown", initAudio, { once: true });
