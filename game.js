/* Goldutya Fly — duck-flapped survival game. Vanilla canvas, zero deps. */

"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const overlay = document.getElementById("overlay");
const startBtn = document.getElementById("startBtn");
const bestEl = document.getElementById("best");

const W = canvas.width; // 960
const H = canvas.height; // 640

const GOLD = "#F5C518";
const RED = "#D42B2B";
const CYAN = "#56D9FF";
const DARK = "#0B0B0D";

/* ---------- constants ---------- */
const GRAVITY = 0.45;
const FLAP_V = -9.4;
const PIPE_W = 74;
const PIPE_GAP = 190;
const PIPE_SPEED = 3.4;
const PIPE_SPAWN = 1500; // ms

/* ---------- state ---------- */
let duck, pipes, score, best, state, spawnTimer, frame, particles;

const states = {
  READY: "ready",
  PLAY: "play",
  OVER: "over",
};

/* ---------- web audio (synthesized quack) ---------- */
let audioCtx = null;
function initAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    audioCtx = null;
  }
}
function quack() {
  if (!audioCtx) return;
  if (audioCtx.state === "suspended") audioCtx.resume();
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(320, t);
  osc.frequency.exponentialRampToValueAtTime(180, t + 0.12);
  gain.gain.setValueAtTime(0.18, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + 0.24);
}
function scoreBlip() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(880, t);
  osc.frequency.exponentialRampToValueAtTime(1320, t + 0.08);
  gain.gain.setValueAtTime(0.12, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + 0.14);
}
function thud() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(120, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.3);
  gain.gain.setValueAtTime(0.3, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + 0.34);
}

/* ---------- init ---------- */
best = Number(localStorage.getItem("goldutya-fly-best") || 0);
bestEl.textContent = best;
reset();

function reset() {
  duck = { x: W * 0.28, y: H / 2, w: 64, h: 52, vy: 0, rot: 0, t: 0 };
  pipes = [];
  score = 0;
  spawnTimer = 0;
  frame = 0;
  particles = [];
  state = states.READY;
}

/* ---------- duck drawing (canvas-drawn, original art) ---------- */
function drawDuck(d) {
  const cx = d.x;
  const cy = d.y;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(d.rot);

  const bob = Math.sin(d.t * 0.2) * 3;

  // tail
  ctx.fillStyle = "#A67B1E";
  ctx.beginPath();
  ctx.moveTo(-30, -4 + bob);
  ctx.quadraticCurveTo(-44, -22 + bob, -40, 2 + bob);
  ctx.quadraticCurveTo(-44, 20 + bob, -28, 10 + bob);
  ctx.closePath();
  ctx.fill();

  // body
  const bodyGrad = ctx.createLinearGradient(0, -24 + bob, 0, 24 + bob);
  bodyGrad.addColorStop(0, "#FFD95E");
  bodyGrad.addColorStop(0.5, "#F5C518");
  bodyGrad.addColorStop(1, "#E0A91A");
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.ellipse(0, 2 + bob, 28, 24, 0, 0, Math.PI * 2);
  ctx.fill();

  // wing
  ctx.fillStyle = "#C89B16";
  ctx.save();
  ctx.translate(2, 8 + bob);
  ctx.rotate(Math.sin(d.t * 0.5) * 0.35);
  ctx.beginPath();
  ctx.ellipse(0, 0, 16, 12, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // head
  ctx.fillStyle = "#FFD95E";
  ctx.beginPath();
  ctx.arc(26, -16 + bob, 15, 0, Math.PI * 2);
  ctx.fill();

  // eye
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(31, -20 + bob, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = DARK;
  ctx.beginPath();
  ctx.arc(32.5, -20 + bob, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(33.5, -21.5 + bob, 1.3, 0, Math.PI * 2);
  ctx.fill();

  // beak
  ctx.fillStyle = "#E0821B";
  ctx.beginPath();
  ctx.moveTo(38, -12 + bob);
  ctx.lineTo(52, -8 + bob);
  ctx.lineTo(38, -3 + bob);
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  // gold glow trail on flap
  if (d.flapTrail) {
    ctx.fillStyle = "rgba(245,197,24,0.5)";
    ctx.beginPath();
    ctx.arc(cx - 26, cy + 24, 10, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ---------- pipes ---------- */
function spawnPipe() {
  const margin = 80;
  const topH = margin + Math.random() * (H - PIPE_GAP - margin * 2);
  pipes.push({
    x: W + PIPE_W,
    top: topH,
    gap: PIPE_GAP,
    scored: false,
  });
}

function drawPipe(p) {
  const grad = ctx.createLinearGradient(p.x, 0, p.x + PIPE_W, 0);
  grad.addColorStop(0, "#0E7C45");
  grad.addColorStop(0.5, "#12A05B");
  grad.addColorStop(1, "#0E7C45");
  ctx.fillStyle = grad;

  // top pipe
  ctx.fillRect(p.x, 0, PIPE_W, p.top);
  // bottom pipe
  const bottomTop = p.top + p.gap;
  ctx.fillRect(p.x, bottomTop, PIPE_W, H - bottomTop);

  // caps
  ctx.fillStyle = "#0C713F";
  ctx.fillRect(p.x - 6, p.top - 26, PIPE_W + 12, 26);
  ctx.fillRect(p.x - 6, bottomTop, PIPE_W + 12, 26);

  // gold rim highlight
  ctx.fillStyle = "rgba(245,197,24,0.6)";
  ctx.fillRect(p.x, p.top - 26, 4, 26);
  ctx.fillRect(p.x, bottomTop, 4, 26);
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
function flap() {
  if (state === states.READY) {
    state = states.PLAY;
    overlay.classList.add("hidden");
    initAudio();
  }
  if (state !== states.PLAY) return;
  duck.vy = FLAP_V;
  duck.flapTrail = true;
  quack();
  burst(duck.x - 10, duck.y + 20, GOLD, 5);
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
canvas.addEventListener("mousedown", tap);
canvas.addEventListener("touchstart", tap, { passive: false });
startBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  flap();
});

/* ---------- collision ---------- */
function collides(x, y, w, h) {
  // ceiling / floor
  if (y < 0 || y + h > H) return true;
  const rx = duck.x + 8;
  const ry = duck.y + 6;
  const rw = duck.w - 16;
  const rh = duck.h - 12;
  for (const p of pipes) {
    const bottomTop = p.top + p.gap;
    if (
      rx < p.x + PIPE_W &&
      rx + rw > p.x &&
      (ry < p.top + 4 || ry + rh > bottomTop - 4)
    ) {
      return true;
    }
  }
  return false;
}

/* ---------- game over ---------- */
function gameOver() {
  state = states.OVER;
  thud();
  burst(duck.x, duck.y, RED, 22);
  burst(duck.x, duck.y, GOLD, 14);
  if (score > best) {
    best = score;
    localStorage.setItem("goldutya-fly-best", String(best));
    bestEl.textContent = best;
  }
  setTimeout(() => {
    overlay.classList.remove("hidden");
    overlay.querySelector(".overlay-sub").textContent =
      score > 0
        ? "You scored " + score + (score > 1 ? " points!" : " point!")
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

  // physics
  duck.vy += GRAVITY;
  duck.y += duck.vy;
  duck.rot = Math.max(-0.5, Math.min(Math.PI / 2, duck.vy * 0.06));

  // pipes
  spawnTimer += 16; // approx per 60fps tick
  const spacing = Math.max(
    PIPE_SPAWN * (1 - Math.min(score, 30) * 0.01),
    950
  );
  if (spawnTimer > spacing) {
    spawnTimer = 0;
    spawnPipe();
  }
  for (const p of pipes) p.x -= PIPE_SPEED;
  pipes = pipes.filter((p) => p.x + PIPE_W > -10);

  // scoring
  for (const p of pipes) {
    if (!p.scored && p.x + PIPE_W < duck.x - 8) {
      p.scored = true;
      score++;
      scoreBlip();
      burst(duck.x + 20, duck.y - 20, CYAN, 8);
    }
  }
  updateParticles();

  // collision
  if (collides(duck.x, duck.y, duck.w, duck.h)) {
    gameOver();
  }
}

/* ---------- background ---------- */
function drawSky() {
  // sun glow
  const g = ctx.createRadialGradient(
    W * 0.8,
    H * 0.18,
    10,
    W * 0.8,
    H * 0.18,
    220
  );
  g.addColorStop(0, "rgba(245,197,24,0.16)");
  g.addColorStop(1, "rgba(245,197,24,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawGround() {
  const gy = H - 56;
  ctx.fillStyle = "#0E7C45";
  ctx.fillRect(0, gy, W, 56);
  ctx.fillStyle = "#0C713F";
  ctx.fillRect(0, gy, W, 8);
  // gold trim
  ctx.fillStyle = "rgba(245,197,24,0.5)";
  ctx.fillRect(0, gy, W, 2);

  // moving dash line
  const dash = 60;
  const off = (frame % dash);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  for (let x = -off; x < W; x += dash * 2) {
    ctx.fillRect(x, gy + 30, dash * 0.7, 4);
  }
}

/* ---------- HUD ---------- */
function drawScore() {
  if (state === states.PLAY) {
    ctx.save();
    ctx.font = '700 64px "Bebas Neue", sans-serif';
    ctx.textAlign = "center";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.strokeText(String(score), W / 2, 92);
    ctx.fillStyle = GOLD;
    ctx.fillText(String(score), W / 2, 92);
    ctx.restore();
  }
}

/* ---------- render ---------- */
function render() {
  ctx.clearRect(0, 0, W, H);
  drawSky();
  drawGround();

  for (const p of pipes) drawPipe(p);
  drawParticles();
  drawDuck(duck);
  drawScore();
}

/* ---------- loop ---------- */
function loop() {
  update();
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* resume audio on first interaction anywhere */
document.addEventListener("pointerdown", initAudio, { once: true });
