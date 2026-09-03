/* Goldutya Jump — 14-feature enhanced build. Viewport-pixel world. */

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

/* ---------- duck skin ---------- */
const SKINS = [
  { name: "Gold", min: 0, filter: "" },
  { name: "Pirate", min: 10, filter: "" },
  { name: "Crown", min: 25, filter: "" },
  { name: "Rainbow", min: 50, filter: "hue-rotate(180deg) saturate(1.6)" },
  { name: "Ghost", min: 100, filter: "opacity(0.55) brightness(1.4)" },
];
let unlockedSkins = JSON.parse(localStorage.getItem("goldutya-jump-skins") || "[0]");
let activeSkin = unlockedSkins[unlockedSkins.length - 1] || 0;

function unlockCheck(total) {
  let changed = false;
  for (const s of SKINS) {
    if (total >= s.min && !unlockedSkins.includes(s.min)) {
      unlockedSkins.push(s.min);
      changed = true;
    }
  }
  if (changed) {
    localStorage.setItem("goldutya-jump-skins", JSON.stringify(unlockedSkins));
    activeSkin = unlockedSkins[unlockedSkins.length - 1];
    updateSkinUI();
  }
}

function updateSkinUI() {
  const picker = document.getElementById("skinPicker");
  if (!picker) return;
  picker.innerHTML = "";
  const icons = ["", "🏴‍☠️", "👑", "🌈", "👻"];
  for (let i = 0; i < SKINS.length; i++) {
    const s = SKINS[i];
    const unlocked = unlockedSkins.includes(s.min);
    const btn = document.createElement("button");
    btn.className = "skin-swatch" + (activeSkin === s.min ? " active" : "");
    btn.disabled = !unlocked;
    btn.title = unlocked ? s.name : "Score " + s.min + " to unlock";
    if (i === 0 && unlocked) {
      const img = document.createElement("img");
      img.src = "assets/duck-mid.png";
      img.style.width = "32px";
      img.style.height = "32px";
      img.style.objectFit = "contain";
      btn.textContent = "";
      btn.appendChild(img);
    } else {
      btn.textContent = unlocked ? icons[i] : "🔒";
    }
    if (unlocked) btn.onclick = () => { activeSkin = s.min; updateSkinUI(); };
    picker.appendChild(btn);
  }
}

const duckUp = new Image(); duckUp.src = "assets/duck-up.png";
const duckMid = new Image(); duckMid.src = "assets/duck-mid.png";
const duckDown = new Image(); duckDown.src = "assets/duck-down.png";
const duckFallback = new Image(); duckFallback.src = "assets/duck.svg";

const DUCK_FRAMES = {
  up:   { img: duckUp,   sx: 120, sy: 114, sw: 471, sh: 443 },
  mid:  { img: duckMid,  sx: 75,  sy: 117, sw: 561, sh: 438 },
  down: { img: duckDown, sx: 20,  sy: 20,  sw: 671, sh: 632 },
};

function getDuckFrame() {
  if (duck.vy < -1) return DUCK_FRAMES.up;
  if (duck.vy > 1) return DUCK_FRAMES.down;
  return DUCK_FRAMES.mid;
}

const states = { READY: "ready", PLAY: "play", OVER: "over" };
let duck, obstacles, coins, score, coinCount, best, state, frame, speed, particles, invuln;
let shakeX = 0, shakeY = 0, shakeDur = 0;
let scoreScale = 1, combo = 0, maxCombo = 0;
let shieldTimer = 0;
let nightPhase = 0, nightDir = 0, nightTimer = 0;
let muteOn = false;

best = Number(localStorage.getItem("goldutya-jump-best") || 0);
bestEl.textContent = best;
muteOn = localStorage.getItem("goldutya-jump-mute") === "1";

/* ---------- audio ---------- */
let audioCtx = null;
function initAudio() {
  if (audioCtx) return;
  try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audioCtx = null; }
}
function beep(freq, dur, type, vol) {
  if (!audioCtx || muteOn) return;
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
function quack() { beep(340, 0.14, "sawtooth", 0.16); }
function coinBlip() { beep(1200, 0.09, "sine", 0.12); }
function shieldBlip() { beep(880, 0.15, "sine", 0.14); }
function comboBlip(c) { beep(660 + c * 60, 0.1, "sine", 0.12); }
function thud() { beep(110, 0.28, "sine", 0.28); }

/* ---------- share ---------- */
function shareScore() {
  const total = score + coinCount * 10;
  const text = "I scored " + total + " in Goldutya Jump! " + (maxCombo > 1 ? "(" + maxCombo + "x combo!) " : "") + "Can you beat me? 🦆";
  if (navigator.share) {
    navigator.share({ title: "Goldutya Jump", text }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById("shareBtn");
      if (btn) btn.textContent = "COPIED!";
      setTimeout(() => { if (btn) btn.textContent = "SHARE SCORE"; }, 2000);
    }).catch(() => {});
  }
}

function toggleMute() {
  muteOn = !muteOn;
  localStorage.setItem("goldutya-jump-mute", muteOn ? "1" : "0");
  const btn = document.getElementById("muteBtn");
  if (btn) btn.textContent = muteOn ? "🔇" : "🔊";
}

function groundY() { return H - GROUND_H - DUCK_H * 0.35; }

function reset() {
  fitCanvas();
  duck = { x: W * 0.22, y: groundY(), w: DUCK_W, h: DUCK_H, vy: 0, onGround: true, rot: 0, targetRot: 0, t: 0 };
  obstacles = [];
  coins = [];
  score = 0;
  coinCount = 0;
  frame = 0;
  speed = SPEED0;
  particles = [];
  invuln = 40;
  shakeX = 0; shakeY = 0; shakeDur = 0;
  scoreScale = 1;
  combo = 0; maxCombo = 0;
  shieldTimer = 0;
  nightPhase = 0; nightDir = 0; nightTimer = 0;
  state = states.READY;
}

reset();

/* ---------- duck ---------- */
function drawDuck() {
  ctx.save();
  ctx.translate(duck.x, duck.y);
  ctx.rotate(duck.rot);
  const frame = getDuckFrame();
  if (frame.img.complete && frame.img.naturalWidth > 0) {
    ctx.save();
    const skinData = SKINS.find(s => s.min === activeSkin);
    if (skinData && skinData.filter) ctx.filter = skinData.filter;
    ctx.drawImage(frame.img, frame.sx, frame.sy, frame.sw, frame.sh, -duck.w / 2, -duck.h / 2, duck.w, duck.h);
    ctx.restore();
    if (activeSkin === 1) { ctx.fillStyle = "#0B0B0D"; ctx.fillRect(-duck.w * 0.1, -duck.h * 0.18, duck.w * 0.28, duck.h * 0.12); }
    if (activeSkin === 2) { ctx.fillStyle = GOLD; ctx.beginPath(); ctx.moveTo(-duck.w * 0.15, -duck.h * 0.42); ctx.lineTo(0, -duck.h * 0.62); ctx.lineTo(duck.w * 0.15, -duck.h * 0.42); ctx.closePath(); ctx.fill(); ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(0, -duck.h * 0.58, 3, 0, Math.PI * 2); ctx.fill(); }
  } else if (duckFallback.complete && duckFallback.naturalWidth > 0) {
    ctx.drawImage(duckFallback, -duck.w / 2, -duck.h / 2, duck.w, duck.h);
  } else {
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.ellipse(0, 0, duck.w / 2, duck.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (shieldTimer > 0) {
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.4 + Math.sin(duck.t * 0.25) * 0.3;
    ctx.beginPath();
    ctx.arc(0, 0, duck.w * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else if (combo >= 3) {
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.3 + Math.sin(duck.t * 0.2) * 0.2;
    ctx.beginPath();
    ctx.arc(0, 0, duck.w * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/* ---------- obstacles ---------- */
function spawnObstacle() {
  const h = OB_MIN_H + Math.random() * (OB_MAX_H - OB_MIN_H);
  const fromTop = Math.random() > 0.62;
  obstacles.push({ x: W + OB_W, y: fromTop ? 0 : H - GROUND_H - h, w: OB_W, h, fromTop, scored: false, spawnFrame: frame });
  if (Math.random() > 0.35) {
    coins.push({ x: W + OB_W + 70 + Math.random() * 80, y: H - GROUND_H - DUCK_H - 40 - Math.random() * (H * 0.25), r: COIN_R, collected: false });
  }
}

function drawObstacle(o) {
  const age = frame - o.spawnFrame;
  if (age < 30) {
    ctx.fillStyle = "rgba(245,197,24," + (0.25 * (1 - age / 30)) + ")";
    ctx.fillRect(o.x - 10, 0, o.w + 20, H);
  }
  const n = nightPhase;
  const r = Math.round(11 + n * 18);
  const g = Math.round(107 + n * 60);
  const b = Math.round(58 + n * 30);
  const grad = ctx.createLinearGradient(o.x, 0, o.x + o.w, 0);
  grad.addColorStop(0, "rgb(" + (r - 5) + "," + (g - 20) + "," + (b - 10) + ")");
  grad.addColorStop(0.45, "rgb(" + r + "," + g + "," + b + ")");
  grad.addColorStop(1, "rgb(" + (r - 5) + "," + (g - 20) + "," + (b - 10) + ")");
  ctx.fillStyle = grad;
  ctx.fillRect(o.x, o.y, o.w, o.h);
  ctx.fillStyle = "rgb(" + (r - 10) + "," + (g - 30) + "," + (b - 15) + ")";
  const cap = 16;
  if (o.fromTop) ctx.fillRect(o.x - 5, o.y + o.h - cap, o.w + 10, cap);
  else ctx.fillRect(o.x - 5, o.y, o.w + 10, cap);
  ctx.fillStyle = n > 0.3 ? "rgba(245,197,24,0.7)" : "rgba(245,197,24,0.55)";
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

/* ---------- particles ---------- */
function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 1 + Math.random() * 4;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.5, life: 28 + Math.random() * 18, color, r: 2 + Math.random() * 3 });
  }
}
function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.14; p.life--;
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
function doJump() {
  initAudio();
  if (state === states.OVER) reset();
  if (state === states.READY || state === states.OVER) {
    state = states.PLAY;
    overlay.classList.add("hidden");
    invuln = 36;
  }
  if (state !== states.PLAY) return;
  if (!duck.onGround) return;
  duck.vy = JUMP_V;
  duck.onGround = false;
  duck.targetRot = -0.35;
  combo = 0;
  quack();
  burst(duck.x - 10, duck.y + 16, GOLD, 5);
}

function handleKey(e) { if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); doJump(); } }
function tap(e) { e.preventDefault(); doJump(); }
document.addEventListener("keydown", handleKey);
canvas.addEventListener("pointerdown", tap);
startBtn.addEventListener("click", (e) => { e.stopPropagation(); doJump(); });

/* ---------- collision ---------- */
function hitbox() { const hw = duck.w * 0.28, hh = duck.h * 0.3; return { l: duck.x - hw, r: duck.x + hw, t: duck.y - hh, b: duck.y + hh }; }
function collides(o) { const hb = hitbox(); return hb.r > o.x && hb.l < o.x + o.w && hb.b > o.y && hb.t < o.y + o.h; }

/* ---------- game over ---------- */
function gameOver() {
  if (state !== states.PLAY) return;
  if (shieldTimer > 0) { shieldTimer = 0; return; }
  state = states.OVER;
  thud();
  shakeDur = 24;
  burst(duck.x, duck.y, RED, 18);
  burst(duck.x, duck.y, GOLD, 10);
  const total = score + coinCount * 10;
  unlockCheck(total);
  if (total > best) {
    best = total;
    localStorage.setItem("goldutya-jump-best", String(best));
    bestEl.textContent = best;
  }
  setTimeout(() => {
    if (state !== states.OVER) return;
    overlay.classList.remove("hidden");
    const duckImgEl = overlay.querySelector(".overlay-duck-img");
    if (duckImgEl) duckImgEl.src = "assets/duck-mid.png?" + Date.now();
    const sub = overlay.querySelector(".overlay-sub");
    let msg = total > 0 ? "Score: " + total + " (" + coinCount + " gold)" : "Quack. Try again.";
    if (maxCombo > 1) msg += " | Max combo: " + maxCombo + "x";
    sub.textContent = msg;
    overlay.querySelector(".btn").textContent = "PLAY AGAIN";
    const shareBtn = document.getElementById("shareBtn");
    if (shareBtn) { shareBtn.style.display = total > 0 ? "" : "none"; shareBtn.textContent = "SHARE SCORE"; }
  }, 800);
}

/* ---------- clouds ---------- */
let cloudList = [];
function initClouds() {
  cloudList = [];
  for (let i = 0; i < 12; i++) {
    const layer = i % 3;
    cloudList.push({
      x: Math.random() * W * 1.5,
      y: H * (0.05 + Math.random() * 0.45),
      speed: [0.15, 0.35, 0.6][layer],
      alpha: [0.08, 0.14, 0.22][layer],
      size: [0.6, 1, 1.4][layer],
    });
  }
}
initClouds();

/* ---------- update ---------- */
function update() {
  frame++;
  duck.t++;

  if (shakeDur > 0) {
    shakeDur--;
    shakeX = (Math.random() - 0.5) * shakeDur * 1.2;
    shakeY = (Math.random() - 0.5) * shakeDur * 1.2;
  } else { shakeX = 0; shakeY = 0; }
  if (scoreScale > 1.01) scoreScale += (1 - scoreScale) * 0.12;

  for (const c of cloudList) {
    const spd = (state === states.PLAY ? speed : speed * 0.25) * c.speed;
    c.x -= spd;
    if (c.x < -100) { c.x = W + 60 + Math.random() * 120; c.y = H * (0.05 + Math.random() * 0.45); }
  }

  if (nightDir !== 0) {
    nightTimer--;
    if (nightTimer <= 0) {
      if (nightDir === 1) { nightPhase = 1; nightDir = -1; nightTimer = 60; }
      else { nightPhase = 0; nightDir = 0; }
    }
  }

  if (state === states.READY) {
    duck.y = groundY() + Math.sin(duck.t * 0.12) * 3;
    duck.rot = Math.sin(duck.t * 0.12) * 0.05;
    updateParticles();
    return;
  }

  if (state !== states.PLAY) {
    duck.vy += GRAVITY;
    duck.y += duck.vy;
    if (duck.y > groundY()) { duck.y = groundY(); duck.vy = 0; }
    updateParticles();
    return;
  }

  duck.vy += GRAVITY;
  duck.y += duck.vy;
  duck.targetRot = Math.max(-0.45, Math.min(0.5, duck.vy * 0.04));
  duck.rot += (duck.targetRot - duck.rot) * 0.1;

  if (duck.y >= groundY()) { duck.y = groundY(); duck.vy = 0; duck.onGround = true; duck.rot = 0; }

  if (shieldTimer > 0) shieldTimer--;

  if (frame % 280 === 0) speed = Math.min(speed + SPEED0 * 0.12, SPEED0 * 2.2);
  if (invuln > 0) invuln--;

  if (state === states.PLAY && frame % 3 === 0 && duck.vy < 0) {
    particles.push({ x: duck.x - duck.w * 0.3 + Math.random() * 4, y: duck.y + duck.h * 0.2, vx: -1.2 - Math.random(), vy: 0.5 + Math.random(), life: 18 + Math.random() * 10, color: GOLD, r: 2 + Math.random() * 2 });
  }

  for (const o of obstacles) o.x -= speed;
  obstacles = obstacles.filter(o => o.x + o.w > -20);
  for (const c of coins) c.x -= speed;
  coins = coins.filter(c => c.x + c.r > -20 && !c.collected);

  const last = obstacles[obstacles.length - 1];
  const gap = Math.max(W * 0.55, 210);
  if (!last || last.x < W - gap) spawnObstacle();

  for (const o of obstacles) {
    if (!o.scored && o.x + o.w < duck.x) {
      o.scored = true;
      score++;
      combo++;
      if (combo > maxCombo) maxCombo = combo;
      const pts = 1 + Math.floor(combo / 3);
      score += pts - 1;
      scoreScale = 1.4;
      if (combo >= 3) comboBlip(combo);
      burst(duck.x + 12, duck.y - 16, CYAN, 5);
      if (score % 20 === 0 && nightDir === 0) { nightDir = 1; nightTimer = 90; }
    }
  }

  for (const c of coins) {
    if (c.collected) continue;
    const dx = duck.x - c.x, dy = duck.y - c.y;
    if (Math.hypot(dx, dy) < c.r + duck.w * 0.32) {
      c.collected = true;
      coinCount++;
      shieldTimer = 300;
      shieldBlip();
      burst(c.x, c.y, CYAN, 10);
    }
  }

  updateParticles();
  if (invuln <= 0 && shieldTimer <= 0) {
    for (const o of obstacles) {
      if (collides(o)) { gameOver(); return; }
    }
  }
}

/* ---------- sky / ground ---------- */
function drawSky() {
  const dayTop = [26, 58, 102], nightTop = [8, 15, 30];
  const dayBot = [18, 48, 72], nightBot = [4, 8, 18];
  const n = nightPhase;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "rgb(" + Math.round(dayTop[0] * (1 - n) + nightTop[0] * n) + "," + Math.round(dayTop[1] * (1 - n) + nightTop[1] * n) + "," + Math.round(dayTop[2] * (1 - n) + nightTop[2] * n) + ")");
  g.addColorStop(0.55, "rgb(" + Math.round(dayTop[0] * 0.85 * (1 - n) + nightTop[0] * 0.85 * n) + "," + Math.round(dayTop[1] * 0.85 * (1 - n) + nightTop[1] * 0.85 * n) + "," + Math.round(dayTop[2] * 0.9 * (1 - n) + nightTop[2] * 0.9 * n) + ")");
  g.addColorStop(1, "rgb(" + Math.round(dayBot[0] * (1 - n) + nightBot[0] * n) + "," + Math.round(dayBot[1] * (1 - n) + nightBot[1] * n) + "," + Math.round(dayBot[2] * (1 - n) + nightBot[2] * n) + ")");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  if (n > 0.4) {
    ctx.fillStyle = "rgba(255,255,255," + ((n - 0.4) * 0.6) + ")";
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc((W * 0.15 + i * W * 0.17) % W, H * (0.06 + i * 0.04), 1.5, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  for (const c of cloudList) {
    ctx.fillStyle = "rgba(255,255,255," + (c.alpha * (1 - n * 0.5)) + ")";
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, 48 * c.size, 18 * c.size, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x + 28 * c.size, c.y + 4, 32 * c.size, 14 * c.size, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x - 24 * c.size, c.y + 6, 28 * c.size, 12 * c.size, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGround() {
  const gy = H - GROUND_H;
  const n = nightPhase;
  const r = Math.round(14 - n * 8), gv = Math.round(124 - n * 50), b = Math.round(69 - n * 25);
  ctx.fillStyle = "rgb(" + r + "," + gv + "," + b + ")";
  ctx.fillRect(0, gy, W, GROUND_H);
  ctx.fillStyle = "rgb(" + (r - 4) + "," + (gv - 20) + "," + (b - 12) + ")";
  ctx.fillRect(0, gy, W, 10);
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, gy, W, 3);
  const dash = 46;
  const off = (frame * speed * 0.55) % (dash * 2);
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  for (let x = -off; x < W; x += dash * 2) ctx.fillRect(x, gy + GROUND_H * 0.45, dash * 0.65, 4);
}

function drawHUD() {
  if (state === states.READY) return;
  const total = score + coinCount * 10;
  const size = Math.max(42, Math.round(H * 0.07)) * scoreScale;
  ctx.save();
  ctx.font = "700 " + Math.round(size) + 'px "Bebas Neue", sans-serif';
  ctx.textAlign = "center";
  ctx.lineWidth = Math.max(4, size * 0.1);
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.strokeText(String(total), W / 2, Math.max(72, H * 0.13));
  ctx.fillStyle = GOLD;
  ctx.fillText(String(total), W / 2, Math.max(72, H * 0.13));
  if (coinCount > 0) {
    const cs = Math.round(size * 0.42);
    ctx.font = "700 " + cs + 'px "Bebas Neue", sans-serif';
    ctx.fillStyle = GOLD2;
    ctx.fillText(coinCount + " coins", W / 2, Math.max(72, H * 0.13) + size * 0.55);
  }
  if (combo >= 3) {
    const cs = Math.round(size * 0.48);
    ctx.font = "700 " + cs + 'px "Bebas Neue", sans-serif';
    ctx.fillStyle = CYAN;
    ctx.fillText("COMBO x" + combo, W / 2, Math.max(72, H * 0.13) + (coinCount > 0 ? size * 0.95 : size * 0.6));
  }
  if (shieldTimer > 0) {
    ctx.font = "700 " + Math.round(size * 0.35) + 'px "Bebas Neue", sans-serif';
    ctx.fillStyle = CYAN;
    const remaining = Math.ceil(shieldTimer / 60);
    ctx.fillText("SHIELD " + remaining + "s", W / 2, Math.max(72, H * 0.13) + size * 1.25);
  }
  ctx.restore();
}

/* ---------- render ---------- */
function render() {
  ctx.save();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.translate(shakeX, shakeY);
  ctx.clearRect(-10, -10, W + 20, H + 20);
  drawSky();
  drawGround();
  for (const c of coins) drawCoin(c);
  for (const o of obstacles) drawObstacle(o);
  drawParticles();
  drawDuck();
  drawHUD();
  ctx.restore();
}

function loop() {
  update();
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
document.addEventListener("pointerdown", initAudio, { once: true });
updateSkinUI();
const muteBtn = document.getElementById("muteBtn");
if (muteBtn) muteBtn.textContent = muteOn ? "🔇" : "🔊";
if (muteBtn) muteBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleMute(); });
const shareBtn = document.getElementById("shareBtn");
if (shareBtn) shareBtn.addEventListener("click", (e) => { e.stopPropagation(); shareScore(); });