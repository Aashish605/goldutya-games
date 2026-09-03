/* Goldutya Jump — auto-run, tap jump, dodge crates, collect gold. Viewport-pixel world. */

"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const startBtn = document.getElementById("startBtn");
const bestEl = document.getElementById("best");

const GOLD = "#F5C518";
const GOLD2 = "#FFDF59";
const RED = "#D42B2B";
const CYAN = "#56D9FF";

let W = 390;
let H = 844;
let DPR = 1;
let GROUND_H = 70;
let GRAVITY = 0.55;
let JUMP_V = -13;
let SPEED0 = 4.2;
let OB_W = 54;
let OB_MIN_H = 70;
let OB_MAX_H = 160;
let COIN_R = 16;
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
  GRAVITY = H * 0.00135;
  JUMP_V = -H * 0.028;
  SPEED0 = Math.max(3.4, W * 0.011);
  OB_W = Math.max(44, Math.min(72, W * 0.14));
  OB_MIN_H = Math.max(56, H * 0.1);
  OB_MAX_H = Math.max(OB_MIN_H + 20, H * 0.22);
  COIN_R = Math.max(12, Math.min(22, Math.min(W, H) * 0.03));
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
let duck, obstacles, coins, score, coinCount, best, state, frame, speed, particles, invuln;

best = Number(localStorage.getItem("goldutya-jump-best") || 0);
bestEl.textContent = best;

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
function coinBlip() {
  beep(1200, 0.09, "sine", 0.12);
}
function thud() {
  beep(110, 0.28, "sine", 0.28);
}

function groundY() {
  return H - GROUND_H - DUCK_H * 0.35;
}

function reset() {
  fitCanvas();
  duck = {
    x: W * 0.22,
    y: groundY(),
    w: DUCK_W,
    h: DUCK_H,
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
  speed = SPEED0;
  particles = [];
  invuln = 40;
  state = states.READY;
}

reset();

function drawDuck() {
  ctx.save();
  ctx.translate(duck.x, duck.y);
  ctx.rotate(duck.rot);
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

function spawnObstacle() {
  const h = OB_MIN_H + Math.random() * (OB_MAX_H - OB_MIN_H);
  const fromTop = Math.random() > 0.62;
  obstacles.push({
    x: W + OB_W,
    y: fromTop ? 0 : H - GROUND_H - h,
    w: OB_W,
    h,
    fromTop,
    scored: false,
  });
  if (Math.random() > 0.35) {
    coins.push({
      x: W + OB_W + 70 + Math.random() * 80,
      y: H - GROUND_H - DUCK_H - 40 - Math.random() * (H * 0.25),
      r: COIN_R,
      collected: false,
    });
  }
}

function drawObstacle(o) {
  const grad = ctx.createLinearGradient(o.x, 0, o.x + o.w, 0);
  grad.addColorStop(0, "#0B6B3A");
  grad.addColorStop(0.45, "#14B35A");
  grad.addColorStop(1, "#0B6B3A");
  ctx.fillStyle = grad;
  ctx.fillRect(o.x, o.y, o.w, o.h);
  ctx.fillStyle = "#086033";
  const cap = 16;
  if (o.fromTop) ctx.fillRect(o.x - 5, o.y + o.h - cap, o.w + 10, cap);
  else ctx.fillRect(o.x - 5, o.y, o.w + 10, cap);
  ctx.fillStyle = "rgba(245,197,24,0.55)";
  ctx.fillRect(o.x, o.y, 4, o.h);
}

function drawCoin(c) {
  if (c.collected) return;
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = GOLD2;
  ctx.beginPath();
  ctx.arc(c.x - c.r * 0.22, c.y - c.r * 0.22, c.r * 0.45, 0, Math.PI * 2);
  ctx.fill();
}

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

function doJump() {
  initAudio();
  if (state === states.OVER) reset();
  if (state === states.READY || state === states.OVER) {
    state = states.PLAY;
    overlay.classList.add("hidden");
  }
  if (state !== states.PLAY) return;
  if (!duck.onGround) return;
  duck.vy = JUMP_V;
  duck.onGround = false;
  duck.rot = -0.35;
  quack();
  burst(duck.x - 10, duck.y + 16, GOLD, 5);
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
canvas.addEventListener("pointerdown", tap);
startBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  doJump();
});

function hitbox() {
  const hw = duck.w * 0.28;
  const hh = duck.h * 0.3;
  return { l: duck.x - hw, r: duck.x + hw, t: duck.y - hh, b: duck.y + hh };
}

function collides(o) {
  const hb = hitbox();
  return hb.r > o.x && hb.l < o.x + o.w && hb.b > o.y && hb.t < o.y + o.h;
}

function gameOver() {
  if (state !== states.PLAY) return;
  state = states.OVER;
  thud();
  burst(duck.x, duck.y, RED, 18);
  burst(duck.x, duck.y, GOLD, 10);
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
        ? "You scored " + total + " points! (" + coinCount + " gold)"
        : "Quack. Try again.";
    overlay.querySelector(".btn").textContent = "PLAY AGAIN";
  }, 800);
}

function update() {
  frame++;
  duck.t++;
  if (state === states.READY) {
    duck.y = groundY() + Math.sin(duck.t * 0.12) * 3;
    updateParticles();
    return;
  }
  if (state !== states.PLAY) {
    duck.vy += GRAVITY;
    duck.y += duck.vy;
    if (duck.y > groundY()) {
      duck.y = groundY();
      duck.vy = 0;
    }
    updateParticles();
    return;
  }

  duck.vy += GRAVITY;
  duck.y += duck.vy;
  if (duck.y >= groundY()) {
    duck.y = groundY();
    duck.vy = 0;
    duck.onGround = true;
    duck.rot = 0;
  } else {
    duck.rot = Math.max(-0.45, Math.min(0.5, duck.vy * 0.04));
  }

  if (frame % 280 === 0) speed = Math.min(speed + SPEED0 * 0.12, SPEED0 * 2.2);
  if (invuln > 0) invuln--;

  for (const o of obstacles) o.x -= speed;
  obstacles = obstacles.filter((o) => o.x + o.w > -20);
  for (const c of coins) c.x -= speed;
  coins = coins.filter((c) => c.x + c.r > -20 && !c.collected);

  const last = obstacles[obstacles.length - 1];
  const gap = Math.max(W * 0.55, 210);
  if (!last || last.x < W - gap) spawnObstacle();

  for (const o of obstacles) {
    if (!o.scored && o.x + o.w < duck.x) {
      o.scored = true;
      score++;
      burst(duck.x + 12, duck.y - 16, CYAN, 5);
    }
  }
  for (const c of coins) {
    if (c.collected) continue;
    const dx = duck.x - c.x;
    const dy = duck.y - c.y;
    if (Math.hypot(dx, dy) < c.r + duck.w * 0.32) {
      c.collected = true;
      coinCount++;
      coinBlip();
      burst(c.x, c.y, GOLD, 8);
    }
  }

  updateParticles();
  if (invuln <= 0) {
    for (const o of obstacles) {
      if (collides(o)) {
        gameOver();
        return;
      }
    }
  }
}

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
  const off = (frame * speed * 0.55) % (dash * 2);
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  for (let x = -off; x < W; x += dash * 2) {
    ctx.fillRect(x, gy + GROUND_H * 0.45, dash * 0.65, 4);
  }
}

function drawHUD() {
  if (state === states.READY) return;
  const total = score + coinCount * 10;
  const size = Math.max(42, Math.round(H * 0.07));
  ctx.save();
  ctx.font = "700 " + size + 'px "Bebas Neue", sans-serif';
  ctx.textAlign = "center";
  ctx.lineWidth = Math.max(4, size * 0.1);
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.strokeText(String(total), W / 2, Math.max(72, H * 0.13));
  ctx.fillStyle = GOLD;
  ctx.fillText(String(total), W / 2, Math.max(72, H * 0.13));
  if (coinCount > 0) {
    ctx.font = "700 " + Math.round(size * 0.42) + 'px "Bebas Neue", sans-serif';
    ctx.fillStyle = GOLD2;
    ctx.fillText(coinCount + " coins", W / 2, Math.max(72, H * 0.13) + size * 0.55);
  }
  ctx.restore();
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  drawSky();
  drawGround();
  for (const c of coins) drawCoin(c);
  for (const o of obstacles) drawObstacle(o);
  drawParticles();
  drawDuck();
  drawHUD();
}

function loop() {
  update();
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
document.addEventListener("pointerdown", initAudio, { once: true });
