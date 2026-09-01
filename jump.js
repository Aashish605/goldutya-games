/* Goldutya Jump — auto-run duck, tap to jump, dodge + collect. Vanilla canvas, zero deps. */

"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const overlay = document.getElementById("overlay");
const startBtn = document.getElementById("startBtn");
const bestEl = document.getElementById("best");

/* logical playfield, adapts to any aspect ratio */
let W = 960;
let H = 640;
let K = 1;
let SCALE = 1;
let DPR = window.devicePixelRatio || 1;

function fitCanvas() {
  const rect = canvas.getBoundingClientRect();
  DPR = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * DPR));
  canvas.height = Math.max(1, Math.round(rect.height * DPR));
  W = 960;
  H = Math.max(1, Math.round(rect.width * (rect.height / rect.width)));
  SCALE = rect.width / W;
  K = H / 640;
  GRAVITY = BASE_GRAVITY * K;
  JUMP_V = BASE_JUMP * K;
  BASE_SPEED = BASE_SPEED_BASE * K;
  OBSTACLE_GAP_MIN = Math.round(BASE_GAP_MIN * K);
  OBSTACLE_GAP_MAX = Math.round(BASE_GAP_MAX * K);
  COIN_R = Math.max(8, Math.round(BASE_COIN_R * K));
  OBSTACLE_W = Math.round(56 * K);
  OBSTACLE_MIN_H = Math.round(60 * K);
  OBSTACLE_MAX_H = Math.round(180 * K);
  GROUND_H = Math.max(24, Math.round(BASE_GROUND_H * K));
}

const GOLD = "#F5C518";
const GOLD2 = "#FFDF59";
const RED = "#D42B2B";
const CYAN = "#56D9FF";
const DARK = "#0B0B0D";

/* ---------- base constants ---------- */
const BASE_GRAVITY = 0.42;
const BASE_JUMP = -10.5;
const BASE_SPEED_BASE = 4.0;
const BASE_GAP_MIN = 520;
const BASE_GAP_MAX = 750;
const BASE_COIN_R = 18;
const BASE_GROUND_H = 56;

let GRAVITY = BASE_GRAVITY;
let JUMP_V = BASE_JUMP;
let BASE_SPEED = BASE_SPEED_BASE;
let OBSTACLE_GAP_MIN = BASE_GAP_MIN;
let OBSTACLE_GAP_MAX = BASE_GAP_MAX;
let COIN_R = BASE_COIN_R;
let OBSTACLE_W = 56;
let OBSTACLE_MIN_H = 60;
let OBSTACLE_MAX_H = 180;
let GROUND_H = BASE_GROUND_H;

fitCanvas();
if (typeof ResizeObserver !== "undefined") {
  new ResizeObserver(fitCanvas).observe(canvas);
} else {
  window.addEventListener("resize", fitCanvas);
}

/* ---------- state ---------- */
let duck, obstacles, coins, score, coinCount, best, state, frame, speed, nextObstacleX, particles;

const states = { READY: "ready", PLAY: "play", OVER: "over" };

/* ---------- web audio ---------- */
let audioCtx = null;
function initAudio() {
  if (audioCtx) return;
  try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audioCtx = null; }
}
function quack() {
  if (!audioCtx) return;
  if (audioCtx.state === "suspended") audioCtx.resume();
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(320, t);
  o.frequency.exponentialRampToValueAtTime(180, t + 0.12);
  g.gain.setValueAtTime(0.18, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  o.connect(g).connect(audioCtx.destination);
  o.start(t);
  o.stop(t + 0.24);
}
function coinBlip() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(1200, t);
  o.frequency.exponentialRampToValueAtTime(1800, t + 0.06);
  g.gain.setValueAtTime(0.14, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  o.connect(g).connect(audioCtx.destination);
  o.start(t);
  o.stop(t + 0.12);
}
function thud() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.3);
  g.gain.setValueAtTime(0.3, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
  o.connect(g).connect(audioCtx.destination);
  o.start(t);
  o.stop(t + 0.34);
}

/* ---------- init ---------- */
best = Number(localStorage.getItem("goldutya-jump-best") || 0);
bestEl.textContent = best;
reset();

function reset() {
  const groundY = H - GROUND_H;
  duck = {
    x: W * 0.18,
    y: groundY,
    w: 88,
    h: 73,
    vy: 0,
    onGround: true,
    rot: 0,
    t: 0,
  };
  obstacles = [];
  coins = [];
  score = 0;
  coinCount = 0;
  frame = 0;
  speed = BASE_SPEED;
  nextObstacleX = W * 0.7;
  particles = [];
  state = states.READY;
}

/* ---------- duck sprite ---------- */
const duckImg = new Image();
duckImg.src = "assets/duck.svg";

function drawDuck(d) {
  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.rotate(d.rot);
  if (duckImg.complete && duckImg.naturalWidth > 0) {
    ctx.drawImage(duckImg, -48, -40, 96, 80);
  } else {
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.ellipse(0, 0, 30, 26, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  if (d.flapTrail) {
    ctx.fillStyle = "rgba(245,197,24,0.5)";
    ctx.beginPath();
    ctx.arc(d.x - 26, d.y + 24, 10, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ---------- obstacles ---------- */
function spawnObstacle() {
  const h = OBSTACLE_MIN_H + Math.random() * (OBSTACLE_MAX_H - OBSTACLE_MIN_H);
  const fromTop = Math.random() > 0.5;
  obstacles.push({
    x: W + OBSTACLE_W,
    y: fromTop ? 0 : H - GROUND_H - h,
    w: OBSTACLE_W,
    h: h,
    fromTop,
    scored: false,
  });
  nextObstacleX = W + OBSTACLE_W + OBSTACLE_GAP_MIN + Math.random() * (OBSTACLE_GAP_MAX - OBSTACLE_GAP_MIN);
}

function drawObstacle(o) {
  const grad = ctx.createLinearGradient(o.x, o.y, o.x + o.w, o.y);
  grad.addColorStop(0, "#0E7C45");
  grad.addColorStop(0.5, "#12A05B");
  grad.addColorStop(1, "#0E7C45");
  ctx.fillStyle = grad;
  ctx.fillRect(o.x, o.y, o.w, o.h);
  ctx.fillStyle = "#0C713F";
  const capH = Math.round(14 * K);
  if (o.fromTop) {
    ctx.fillRect(o.x - 5, o.y, o.w + 10, capH);
    ctx.fillStyle = "rgba(245,197,24,0.6)";
    ctx.fillRect(o.x, o.y + capH, 4, Math.max(0, o.h - capH));
  } else {
    ctx.fillRect(o.x - 5, o.y + o.h - capH, o.w + 10, capH);
    ctx.fillStyle = "rgba(245,197,24,0.6)";
    ctx.fillRect(o.x, o.y, 4, Math.max(0, o.h - capH));
  }
}

/* ---------- coins ---------- */
function spawnCoin(y) {
  coins.push({
    x: W + 60 + Math.random() * 200,
    y: y,
    r: COIN_R,
    collected: false,
  });
}

function drawCoin(c) {
  if (c.collected) return;
  ctx.save();
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = GOLD2;
  ctx.beginPath();
  ctx.arc(c.x - c.r * 0.2, c.y - c.r * 0.2, c.r * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
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
      vy: Math.sin(a) * s - 2,
      life: 40 + Math.random() * 20,
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
    p.vy += 0.12;
    p.life--;
    if (p.life <= 0) particles.splice(i, 1);
  }
}
function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.min(1, p.life / 30);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* ---------- input ---------- */
function doJump() {
  if (state === states.OVER) reset();
  if (state === states.READY || state === states.OVER) {
    state = states.PLAY;
    overlay.classList.add("hidden");
    initAudio();
  }
  if (state !== states.PLAY) return;
  if (!duck.onGround) return;
  duck.vy = JUMP_V;
  duck.onGround = false;
  duck.flapTrail = true;
  quack();
  burst(duck.x - 10, duck.y + 20, GOLD, 5);
}
function handleKey(e) {
  if (e.code === "Space" || e.code === "ArrowUp") {
    e.preventDefault();
    doJump();
  }
}
function tap(e) {
  e.preventDefault();
  doJump();
}
document.addEventListener("keydown", handleKey);
canvas.addEventListener("mousedown", tap);
canvas.addEventListener("touchstart", tap, { passive: false });
startBtn.addEventListener("click", (e) => { e.stopPropagation(); doJump(); });

/* ---------- collision ---------- */
function collidesDuck(o) {
  const rx = duck.x + 14;
  const ry = duck.y + 10;
  const rw = duck.w - 28;
  const rh = duck.h - 20;
  if (rx < o.x + o.w && rx + rw > o.x && ry < o.y + o.h && ry + rh > o.y) return true;
  return false;
}

/* ---------- game over ---------- */
function gameOver() {
  state = states.OVER;
  thud();
  burst(duck.x, duck.y, RED, 22);
  burst(duck.x, duck.y, GOLD, 14);
  const total = score + coinCount * 10;
  if (total > best) {
    best = total;
    localStorage.setItem("goldutya-jump-best", String(best));
    bestEl.textContent = best;
  }
  setTimeout(() => {
    if (state !== states.OVER) return;
    overlay.classList.remove("hidden");
    overlay.querySelector(".overlay-sub").textContent =
      total > 0
        ? "You scored " + total + " points! (" + coinCount + " gold coins)"
        : "Quack. Try again.";
    overlay.querySelector(".btn").textContent = "PLAY AGAIN";
  }, 700);
}

/* ---------- update ---------- */
function update() {
  frame++;
  duck.t++;
  duck.flapTrail = false;

  if (state !== states.PLAY) return;

  // gravity
  duck.vy += GRAVITY;
  duck.y += duck.vy;

  // ground
  const groundY = H - GROUND_H;
  if (duck.y >= groundY) {
    duck.y = groundY;
    duck.vy = 0;
    duck.onGround = true;
  }

  // rotation
  duck.rot = Math.max(-0.4, Math.min(Math.PI / 6, duck.vy * 0.05));

  // speed ramp
  if (frame % 300 === 0) {
    speed = Math.min(speed + BASE_SPEED * 0.15, BASE_SPEED * 2.4);
  }

  // obstacles
  for (const o of obstacles) {
    o.x -= speed;
  }
  obstacles = obstacles.filter((o) => o.x + o.w > -20);

  // spawn
  if (obstacles.length === 0 || obstacles[obstacles.length - 1].x < nextObstacleX - W) {
    spawnObstacle();
    // coin above gap
    if (Math.random() > 0.35) {
      const cy = GROUND_H + Math.random() * (H - GROUND_H * 2 - COIN_R * 2);
      spawnCoin(cy);
    }
  }

  // coins move
  for (const c of coins) c.x -= speed;
  coins = coins.filter((c) => c.x + c.r > -20 && !c.collected);

  // scoring
  for (const o of obstacles) {
    if (!o.scored && o.x + o.w < duck.x - 14) {
      o.scored = true;
      score++;
      burst(duck.x + 20, duck.y - 20, CYAN, 6);
    }
  }

  // coin collection
  for (const c of coins) {
    if (c.collected) continue;
    const dx = duck.x - c.x;
    const dy = duck.y - c.y;
    if (Math.sqrt(dx * dx + dy * dy) < c.r + 30) {
      c.collected = true;
      coinCount++;
      coinBlip();
      burst(c.x, c.y, GOLD, 8);
    }
  }

  updateParticles();

  // collision
  for (const o of obstacles) {
    if (collidesDuck(o)) {
      gameOver();
      return;
    }
  }
}

/* ---------- background ---------- */
function drawSky() {
  const g = ctx.createRadialGradient(W * 0.8, H * 0.18, 10, W * 0.8, H * 0.18, 220 * K);
  g.addColorStop(0, "rgba(245,197,24,0.16)");
  g.addColorStop(1, "rgba(245,197,24,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawGround() {
  const gy = H - GROUND_H;
  ctx.fillStyle = "#0E7C45";
  ctx.fillRect(0, gy, W, GROUND_H);
  ctx.fillStyle = "#0C713F";
  ctx.fillRect(0, gy, W, Math.round(GROUND_H * 0.15));
  ctx.fillStyle = "rgba(245,197,24,0.5)";
  ctx.fillRect(0, gy, W, 2);
  const dash = 60;
  const off = (frame * (speed / BASE_SPEED)) % dash;
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  for (let x = -off; x < W; x += dash * 2) {
    ctx.fillRect(x, gy + Math.round(GROUND_H * 0.54), dash * 0.7, Math.max(2, Math.round(GROUND_H * 0.07)));
  }
}

/* ---------- HUD ---------- */
function drawHUD() {
  if (state !== states.PLAY) return;
  ctx.save();
  const total = score + coinCount * 10;
  const fontS = Math.round(64 * K);
  ctx.font = "700 " + fontS + 'px "Bebas Neue", sans-serif';
  ctx.textAlign = "center";
  ctx.lineWidth = 6 * K;
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.strokeText(String(total), W / 2, fontS + 20);
  ctx.fillStyle = GOLD;
  ctx.fillText(String(total), W / 2, fontS + 20);
  // coin count badge
  if (coinCount > 0) {
    const badgeX = W / 2;
    const badgeY = fontS + 20 + fontS * 0.65;
    ctx.font = "700 " + Math.round(28 * K) + 'px "Bebas Neue", sans-serif';
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillText(coinCount + " coins", badgeX + 1, badgeY + 1);
    ctx.fillStyle = GOLD2;
    ctx.fillText(coinCount + " coins", badgeX, badgeY);
  }
  ctx.restore();
}

/* ---------- render ---------- */
function render() {
  ctx.setTransform(DPR * SCALE, 0, 0, DPR * SCALE, 0, 0);
  ctx.clearRect(0, 0, W, H);
  drawSky();
  drawGround();
  for (const c of coins) drawCoin(c);
  for (const o of obstacles) drawObstacle(o);
  drawParticles();
  drawDuck(duck);
  drawHUD();
}

/* ---------- loop ---------- */
function loop() {
  update();
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

document.addEventListener("pointerdown", initAudio, { once: true });