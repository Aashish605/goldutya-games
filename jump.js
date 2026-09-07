/* Goldutya Jump — Enhanced Arcade Build. Viewport-pixel world. */

"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const startBtn = document.getElementById("startBtn");
const bestEl = document.getElementById("best");
const pauseBtn = document.getElementById("pauseBtn");
const muteBtn = document.getElementById("muteBtn");
const shareBtn = document.getElementById("shareBtn");

const GOLD = "#F5C518";
const GOLD2 = "#FFDF59";
const RED = "#D42B2B";
const CYAN = "#56D9FF";
const PURPLE = "#A855F7";
const GREEN = "#22C55E";

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
  const icons = ["", "🏴☠️", "👑", "🌈", "👻"];
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
    if (unlocked) btn.onclick = (e) => { e.stopPropagation(); activeSkin = s.min; updateSkinUI(); };
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

const states = { READY: "ready", PLAY: "play", PAUSED: "paused", OVER: "over" };
let duck, obstacles, collectibles, score, coinCount, best, state, frame, speed, particles, popups, invuln;
let shakeX = 0, shakeY = 0, shakeDur = 0, deathFlash = 0;
let scoreScale = 1, combo = 0, maxCombo = 0;
let shieldTimer = 0, magnetTimer = 0, boostTimer = 0;
let nightPhase = 0, nightDir = 0, nightTimer = 0;
let muteOn = false;
let jumpBuffer = 0;

best = Number(localStorage.getItem("goldutya-jump-best") || 0);
if (bestEl) bestEl.textContent = best;
muteOn = localStorage.getItem("goldutya-jump-mute") === "1";

/* ---------- audio ---------- */
let audioCtx = null;
function initAudio() {
  if (audioCtx) return;
  try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audioCtx = null; }
}
function beep(freq, dur, type, vol, endFreq) {
  if (!audioCtx || muteOn) return;
  if (audioCtx.state === "suspended") audioCtx.resume();
  const t = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq || freq * 0.55), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(audioCtx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}
function quack() { beep(340, 0.14, "sawtooth", 0.16); }
function doubleQuack() { beep(520, 0.12, "sine", 0.18, 780); }
function coinBlip() { beep(1200, 0.09, "sine", 0.12, 1600); }
function shieldBlip() { beep(880, 0.15, "sine", 0.14, 1100); }
function magnetBlip() { beep(700, 0.16, "triangle", 0.15, 1200); }
function boostBlip() { beep(400, 0.22, "sawtooth", 0.18, 950); }
function comboBlip(c) { beep(660 + c * 60, 0.1, "sine", 0.12); }
function thud() { beep(110, 0.28, "sine", 0.28, 40); }

/* ---------- share & UI ---------- */
function shareScore() {
  const total = score + coinCount * 10;
  const text = "I scored " + total + " in Goldutya Jump! " + (maxCombo > 1 ? "(" + maxCombo + "x combo!) " : "") + "Can you beat me? 🦆";
  if (navigator.share) {
    navigator.share({ title: "Goldutya Jump", text }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text).then(() => {
      if (shareBtn) shareBtn.textContent = "COPIED!";
      setTimeout(() => { if (shareBtn) shareBtn.textContent = "SHARE SCORE"; }, 2000);
    }).catch(() => {});
  }
}

function toggleMute() {
  muteOn = !muteOn;
  localStorage.setItem("goldutya-jump-mute", muteOn ? "1" : "0");
  if (muteBtn) muteBtn.textContent = muteOn ? "🔇" : "🔊";
}

function togglePause() {
  if (state === states.PLAY) {
    state = states.PAUSED;
    if (pauseBtn) pauseBtn.textContent = "▶";
  } else if (state === states.PAUSED) {
    state = states.PLAY;
    if (pauseBtn) pauseBtn.textContent = "⏸";
  }
}

function groundY() { return H - GROUND_H - DUCK_H * 0.35; }

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
    targetRot: 0,
    t: 0,
    scaleX: 1,
    scaleY: 1,
    coyote: 0,
    jumpsLeft: 2,
    isDying: false,
    deathVy: 0,
    deathRot: 0
  };
  obstacles = [];
  collectibles = [];
  particles = [];
  popups = [];
  score = 0;
  coinCount = 0;
  frame = 0;
  speed = SPEED0;
  invuln = 40;
  shakeX = 0; shakeY = 0; shakeDur = 0; deathFlash = 0;
  scoreScale = 1;
  combo = 0; maxCombo = 0;
  shieldTimer = 0; magnetTimer = 0; boostTimer = 0;
  nightPhase = 0; nightDir = 0; nightTimer = 0;
  jumpBuffer = 0;
  state = states.READY;
  if (pauseBtn) pauseBtn.textContent = "⏸";
}

reset();

/* ---------- popups ---------- */
function addPopup(x, y, text, color, scale = 1) {
  popups.push({ x, y, text, color, life: 36, maxLife: 36, vy: -1.6, scale });
}
function updatePopups() {
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i];
    p.y += p.vy;
    p.life--;
    if (p.life <= 0) popups.splice(i, 1);
  }
}
function drawPopups() {
  ctx.save();
  for (const p of popups) {
    const alpha = Math.min(1, p.life / 16);
    ctx.globalAlpha = alpha;
    ctx.font = "700 " + Math.round(20 * p.scale) + 'px "Bebas Neue", sans-serif';
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#000";
    ctx.strokeText(p.text, p.x, p.y);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.restore();
}

/* ---------- duck ---------- */
function drawDuck() {
  ctx.save();
  ctx.translate(duck.x, duck.y);
  ctx.rotate(duck.rot);
  ctx.scale(duck.scaleX, duck.scaleY);

  const frame = getDuckFrame();
  if (frame.img.complete && frame.img.naturalWidth > 0) {
    ctx.save();
    const skinData = SKINS.find(s => s.min === activeSkin);
    if (skinData && skinData.filter) ctx.filter = skinData.filter;
    ctx.drawImage(frame.img, frame.sx, frame.sy, frame.sw, frame.sh, -duck.w / 2, -duck.h / 2, duck.w, duck.h);
    ctx.restore();
    if (activeSkin === 10) { ctx.fillStyle = "#0B0B0D"; ctx.fillRect(-duck.w * 0.1, -duck.h * 0.18, duck.w * 0.28, duck.h * 0.12); }
    if (activeSkin === 25) { ctx.fillStyle = GOLD; ctx.beginPath(); ctx.moveTo(-duck.w * 0.15, -duck.h * 0.42); ctx.lineTo(0, -duck.h * 0.62); ctx.lineTo(duck.w * 0.15, -duck.h * 0.42); ctx.closePath(); ctx.fill(); ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(0, -duck.h * 0.58, 3, 0, Math.PI * 2); ctx.fill(); }
  } else if (duckFallback.complete && duckFallback.naturalWidth > 0) {
    ctx.drawImage(duckFallback, -duck.w / 2, -duck.h / 2, duck.w, duck.h);
  } else {
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.ellipse(0, 0, duck.w / 2, duck.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Aura effects
  if (shieldTimer > 0) {
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.4 + Math.sin(duck.t * 0.25) * 0.3;
    ctx.beginPath();
    ctx.arc(0, 0, duck.w * 0.58, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (magnetTimer > 0) {
    ctx.strokeStyle = PURPLE;
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.5 + Math.sin(duck.t * 0.3) * 0.3;
    ctx.beginPath();
    ctx.arc(0, 0, duck.w * 0.68, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (boostTimer > 0) {
    ctx.strokeStyle = GOLD2;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.6 + Math.sin(duck.t * 0.4) * 0.3;
    ctx.beginPath();
    ctx.arc(0, 0, duck.w * 0.62, 0, Math.PI * 2);
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

/* ---------- obstacles & collectibles ---------- */
function spawnObstacle() {
  const currentSpeedMult = boostTimer > 0 ? 1.4 : 1;
  const isHard = score > 30;
  const isMid = score > 12;

  let type = "normal";
  const r = Math.random();

  if (isHard && r > 0.72) type = "moving";
  else if (isMid && r > 0.55) type = "tall";
  else if (r > 0.8) type = "floating";

  let h = OB_MIN_H + Math.random() * (OB_MAX_H - OB_MIN_H);
  if (type === "tall") h = OB_MAX_H * 1.15;
  if (type === "floating") h = OB_MIN_H * 0.85;

  let yPos = H - GROUND_H - h;
  let fromTop = false;

  if (type === "floating") {
    yPos = H - GROUND_H - DUCK_H * 2.2 - Math.random() * (H * 0.15);
  } else if (Math.random() > 0.7 && type === "normal") {
    fromTop = true;
    yPos = 0;
  }

  const o = {
    x: W + OB_W,
    y: yPos,
    baseY: yPos,
    w: OB_W,
    h,
    fromTop,
    type,
    scored: false,
    spawnFrame: frame,
    phase: Math.random() * Math.PI * 2
  };
  obstacles.push(o);

  // Spawn Collectibles
  const itemR = Math.random();
  if (itemR > 0.25) {
    let itemType = "coin";
    if (itemR > 0.9) itemType = "boost";
    else if (itemR > 0.78) itemType = "magnet";

    collectibles.push({
      x: W + OB_W + 65 + Math.random() * 90,
      y: H - GROUND_H - DUCK_H - 30 - Math.random() * (H * 0.24),
      r: COIN_R,
      type: itemType,
      collected: false,
      spin: Math.random() * Math.PI
    });
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
  if (o.type === "moving") {
    grad.addColorStop(0, "#b91c1c");
    grad.addColorStop(0.5, "#ef4444");
    grad.addColorStop(1, "#991b1b");
  } else if (o.type === "tall") {
    grad.addColorStop(0, "#7c2d12");
    grad.addColorStop(0.5, "#d97706");
    grad.addColorStop(1, "#7c2d12");
  } else {
    grad.addColorStop(0, "rgb(" + (r - 5) + "," + (g - 20) + "," + (b - 10) + ")");
    grad.addColorStop(0.45, "rgb(" + r + "," + g + "," + b + ")");
    grad.addColorStop(1, "rgb(" + (r - 5) + "," + (g - 20) + "," + (b - 10) + ")");
  }

  ctx.fillStyle = grad;
  ctx.fillRect(o.x, o.y, o.w, o.h);

  // Cap / Trim
  ctx.fillStyle = o.type === "moving" ? "#7f1d1d" : "rgb(" + (r - 10) + "," + (g - 30) + "," + (b - 15) + ")";
  const cap = 16;
  if (o.fromTop) ctx.fillRect(o.x - 5, o.y + o.h - cap, o.w + 10, cap);
  else ctx.fillRect(o.x - 5, o.y, o.w + 10, cap);

  // Stripe line
  ctx.fillStyle = o.type === "moving" ? GOLD : (n > 0.3 ? "rgba(245,197,24,0.7)" : "rgba(245,197,24,0.55)");
  ctx.fillRect(o.x, o.y, 4, o.h);
}

function drawCollectible(c) {
  if (c.collected) return;
  ctx.save();
  ctx.translate(c.x, c.y);
  c.spin += 0.08;
  const scaleX = Math.abs(Math.cos(c.spin));

  if (c.type === "coin") {
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.ellipse(0, 0, c.r * scaleX, c.r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = GOLD2;
    ctx.beginPath();
    ctx.ellipse(-c.r * 0.22 * scaleX, -c.r * 0.22, c.r * 0.4 * scaleX, c.r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (c.type === "magnet") {
    ctx.fillStyle = PURPLE;
    ctx.beginPath();
    ctx.arc(0, 0, c.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "700 " + Math.round(c.r * 1.2) + 'px "Space Mono", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🧲", 0, 1);
  } else if (c.type === "boost") {
    ctx.fillStyle = CYAN;
    ctx.beginPath();
    ctx.arc(0, 0, c.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "700 " + Math.round(c.r * 1.2) + 'px "Space Mono", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("⚡", 0, 1);
  }
  ctx.restore();
}

/* ---------- particles ---------- */
function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 1 + Math.random() * 4.5;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.5, life: 28 + Math.random() * 18, color, r: 2 + Math.random() * 3 });
  }
}
function spawnDust(x, y) {
  for (let i = 0; i < 6; i++) {
    particles.push({
      x: x + (Math.random() - 0.5) * 20,
      y: y,
      vx: (Math.random() - 0.5) * 3,
      vy: -Math.random() * 1.5,
      life: 14 + Math.random() * 10,
      color: "rgba(255,255,255,0.45)",
      r: 2 + Math.random() * 3
    });
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

/* ---------- input & jump mechanics ---------- */
function doJump() {
  initAudio();
  if (state === states.OVER) { reset(); return; }
  if (state === states.READY) {
    state = states.PLAY;
    overlay.classList.add("hidden");
    invuln = 36;
  }
  if (state === states.PAUSED) { togglePause(); return; }
  if (state !== states.PLAY) return;

  const canGroundJump = duck.onGround || duck.coyote > 0;
  if (canGroundJump) {
    duck.vy = JUMP_V;
    duck.onGround = false;
    duck.coyote = 0;
    duck.jumpsLeft = 1;
    duck.scaleX = 0.72;
    duck.scaleY = 1.35;
    duck.targetRot = -0.35;
    combo = 0;
    quack();
    burst(duck.x - 10, duck.y + 16, GOLD, 5);
  } else if (duck.jumpsLeft > 0) {
    // Double Jump
    duck.vy = JUMP_V * 0.9;
    duck.jumpsLeft--;
    duck.scaleX = 0.8;
    duck.scaleY = 1.25;
    duck.targetRot = -0.6;
    doubleQuack();
    burst(duck.x, duck.y, CYAN, 8);
    addPopup(duck.x, duck.y - 20, "2X JUMP!", CYAN, 0.9);
  } else {
    jumpBuffer = 6;
  }
}

function handleKey(e) {
  if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); doJump(); }
  if (e.code === "KeyP" || e.code === "Escape") { e.preventDefault(); if (state === states.PLAY || state === states.PAUSED) togglePause(); }
}
function tap(e) {
  if (e.target.closest("button") || e.target.closest("#overlay")) return;
  e.preventDefault();
  doJump();
}

document.addEventListener("keydown", handleKey);
canvas.addEventListener("pointerdown", tap);
if (startBtn) startBtn.addEventListener("click", (e) => { e.stopPropagation(); doJump(); });
if (pauseBtn) pauseBtn.addEventListener("click", (e) => { e.stopPropagation(); togglePause(); });

/* ---------- collision ---------- */
function hitbox() { const hw = duck.w * 0.28, hh = duck.h * 0.3; return { l: duck.x - hw, r: duck.x + hw, t: duck.y - hh, b: duck.y + hh }; }
function collides(o) { const hb = hitbox(); return hb.r > o.x && hb.l < o.x + o.w && hb.b > o.y && hb.t < o.y + o.h; }

/* ---------- game over ---------- */
function gameOver() {
  if (state !== states.PLAY) return;
  if (shieldTimer > 0) {
    shieldTimer = 0;
    invuln = 30;
    burst(duck.x, duck.y, CYAN, 14);
    addPopup(duck.x, duck.y - 20, "SHIELD BROKEN!", RED, 1);
    shakeDur = 10;
    return;
  }

  state = states.OVER;
  thud();
  shakeDur = 24;
  deathFlash = 12;
  duck.isDying = true;
  duck.deathVy = -9;
  duck.deathRot = 0.25;

  burst(duck.x, duck.y, RED, 18);
  burst(duck.x, duck.y, GOLD, 10);

  const total = score + coinCount * 10;
  unlockCheck(total);
  if (total > best) {
    best = total;
    localStorage.setItem("goldutya-jump-best", String(best));
    if (bestEl) bestEl.textContent = best;
  }

  setTimeout(() => {
    if (state !== states.OVER) return;
    overlay.classList.remove("hidden");
    const duckImgEl = overlay.querySelector(".overlay-duck-img");
    if (duckImgEl) duckImgEl.src = "assets/duck-mid.png?" + Date.now();
    const sub = overlay.querySelector(".overlay-sub");
    let msg = total > 0 ? "Score: " + total + " (" + coinCount + " gold)" : "Quack. Try again.";
    if (maxCombo > 1) msg += " | Max combo: " + maxCombo + "x";
    if (sub) sub.textContent = msg;
    const btn = overlay.querySelector(".btn");
    if (btn) btn.textContent = "PLAY AGAIN";
    if (shareBtn) { shareBtn.style.display = total > 0 ? "" : "none"; shareBtn.textContent = "SHARE SCORE"; }
  }, 700);
}

/* ---------- background & environment ---------- */
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

function drawMountains() {
  const n = nightPhase;
  const gy = H - GROUND_H;

  // Far mountains
  ctx.fillStyle = n > 0.4 ? "rgba(10,25,50,0.45)" : "rgba(20,50,85,0.35)";
  ctx.beginPath();
  const offFar = (frame * speed * 0.15) % (W * 0.8);
  ctx.moveTo(-offFar, gy);
  ctx.lineTo(-offFar + W * 0.2, gy - H * 0.14);
  ctx.lineTo(-offFar + W * 0.5, gy);
  ctx.lineTo(-offFar + W * 0.8, gy - H * 0.18);
  ctx.lineTo(-offFar + W * 1.2, gy);
  ctx.lineTo(-offFar + W * 1.5, gy - H * 0.13);
  ctx.lineTo(-offFar + W * 1.9, gy);
  ctx.fill();

  // Mid mountains
  ctx.fillStyle = n > 0.4 ? "rgba(8,35,65,0.6)" : "rgba(15,70,110,0.5)";
  ctx.beginPath();
  const offMid = (frame * speed * 0.3) % (W * 0.6);
  ctx.moveTo(-offMid, gy);
  ctx.lineTo(-offMid + W * 0.15, gy - H * 0.08);
  ctx.lineTo(-offMid + W * 0.35, gy);
  ctx.lineTo(-offMid + W * 0.6, gy - H * 0.1);
  ctx.lineTo(-offMid + W * 0.85, gy);
  ctx.lineTo(-offMid + W * 1.1, gy - H * 0.07);
  ctx.lineTo(-offMid + W * 1.3, gy);
  ctx.fill();
}

/* ---------- update ---------- */
function update() {
  frame++;
  duck.t++;

  if (shakeDur > 0) {
    shakeDur--;
    shakeX = (Math.random() - 0.5) * shakeDur * 1.2;
    shakeY = (Math.random() - 0.5) * shakeDur * 1.2;
  } else { shakeX = 0; shakeY = 0; }

  if (deathFlash > 0) deathFlash--;
  if (scoreScale > 1.01) scoreScale += (1 - scoreScale) * 0.12;

  // Lerp duck scale back to 1
  duck.scaleX += (1 - duck.scaleX) * 0.14;
  duck.scaleY += (1 - duck.scaleY) * 0.14;

  if (jumpBuffer > 0) jumpBuffer--;

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
    updatePopups();
    return;
  }

  if (state === states.PAUSED) return;

  if (state === states.OVER) {
    if (duck.isDying) {
      duck.deathVy += GRAVITY;
      duck.y += duck.deathVy;
      duck.rot += duck.deathRot;
    }
    updateParticles();
    updatePopups();
    return;
  }

  // Active PLAY update
  const effectiveSpeed = boostTimer > 0 ? speed * 1.4 : speed;

  // Coyote timer
  if (duck.onGround) {
    duck.coyote = 6;
    duck.jumpsLeft = 2;
  } else if (duck.coyote > 0) {
    duck.coyote--;
  }

  // Check jump buffer
  if (jumpBuffer > 0 && (duck.onGround || duck.coyote > 0)) {
    doJump();
    jumpBuffer = 0;
  }

  // Physics
  duck.vy += GRAVITY;
  duck.y += duck.vy;
  duck.targetRot = Math.max(-0.45, Math.min(0.5, duck.vy * 0.04));
  duck.rot += (duck.targetRot - duck.rot) * 0.1;

  // Ground contact
  if (duck.y >= groundY()) {
    if (!duck.onGround) {
      // Just landed
      duck.scaleX = 1.3;
      duck.scaleY = 0.75;
      spawnDust(duck.x, duck.y + duck.h * 0.4);
    }
    duck.y = groundY();
    duck.vy = 0;
    duck.onGround = true;
    duck.rot = 0;
  } else {
    duck.onGround = false;
  }

  // Timers
  if (shieldTimer > 0) shieldTimer--;
  if (magnetTimer > 0) magnetTimer--;
  if (boostTimer > 0) boostTimer--;

  // Speed ramp (smooth lerp)
  if (frame % 220 === 0) {
    const targetSpeed = Math.min(SPEED0 * 2.4, SPEED0 + (score * 0.08));
    speed += (targetSpeed - speed) * 0.3;
  }
  if (invuln > 0) invuln--;

  // Running particles
  if (duck.onGround && frame % 4 === 0) {
    particles.push({
      x: duck.x - duck.w * 0.3,
      y: duck.y + duck.h * 0.35,
      vx: -1.5 - Math.random(),
      vy: -0.5 - Math.random(),
      life: 14 + Math.random() * 8,
      color: boostTimer > 0 ? GOLD2 : "rgba(255,255,255,0.35)",
      r: 2 + Math.random() * 2
    });
  }

  // Boost trail
  if (boostTimer > 0 && frame % 2 === 0) {
    particles.push({
      x: duck.x - duck.w * 0.4,
      y: duck.y + (Math.random() - 0.5) * duck.h * 0.5,
      vx: -effectiveSpeed * 0.8,
      vy: (Math.random() - 0.5) * 1.5,
      life: 20,
      color: CYAN,
      r: 3 + Math.random() * 3
    });
  }

  // Update obstacles
  for (const o of obstacles) {
    o.x -= effectiveSpeed;
    if (o.type === "moving") {
      o.y = o.baseY + Math.sin(frame * 0.06 + o.phase) * (H * 0.08);
    }
  }
  obstacles = obstacles.filter(o => o.x + o.w > -30);

  // Update collectibles
  for (const c of collectibles) {
    c.x -= effectiveSpeed;

    // Magnet effect
    if (magnetTimer > 0 && !c.collected) {
      const dx = duck.x - c.x;
      const dy = duck.y - c.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 260) {
        c.x += (dx / dist) * 8;
        c.y += (dy / dist) * 8;
      }
    }
  }
  collectibles = collectibles.filter(c => c.x + c.r > -30 && !c.collected);

  // Spawn new obstacles
  const last = obstacles[obstacles.length - 1];
  const minGap = Math.max(W * 0.48, 190);
  if (!last || last.x < W - minGap) spawnObstacle();

  // Scoring
  for (const o of obstacles) {
    if (!o.scored && o.x + o.w < duck.x) {
      o.scored = true;
      score++;
      combo++;
      if (combo > maxCombo) maxCombo = combo;

      const multiplier = boostTimer > 0 ? 2 : 1;
      const comboBonus = 1 + Math.floor(combo / 3);
      const pointsAdded = comboBonus * multiplier;
      score += pointsAdded - 1;

      scoreScale = 1.35;
      if (combo >= 3) comboBlip(combo);

      burst(duck.x + 12, duck.y - 16, boostTimer > 0 ? CYAN : GOLD, 5);
      addPopup(duck.x, duck.y - 30, "+" + pointsAdded, boostTimer > 0 ? CYAN : GOLD, 1);

      if (score % 20 === 0 && nightDir === 0) { nightDir = 1; nightTimer = 90; }
    }
  }

  // Collectible collection
  for (const c of collectibles) {
    if (c.collected) continue;
    const dx = duck.x - c.x, dy = duck.y - c.y;
    if (Math.hypot(dx, dy) < c.r + duck.w * 0.36) {
      c.collected = true;

      if (c.type === "coin") {
        coinCount++;
        score += 10;
        coinBlip();
        burst(c.x, c.y, GOLD, 10);
        addPopup(c.x, c.y, "+10 GOLD", GOLD2, 1.1);
      } else if (c.type === "magnet") {
        magnetTimer = 320;
        magnetBlip();
        burst(c.x, c.y, PURPLE, 14);
        addPopup(c.x, c.y, "MAGNET ACTIVE!", PURPLE, 1.2);
      } else if (c.type === "boost") {
        boostTimer = 260;
        boostBlip();
        burst(c.x, c.y, CYAN, 16);
        addPopup(c.x, c.y, "SPEED BOOST 2X!", CYAN, 1.3);
      }
    }
  }

  updateParticles();
  updatePopups();

  // Collision check
  if (invuln <= 0) {
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

  drawMountains();

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
  ctx.fillStyle = boostTimer > 0 ? CYAN : GOLD;
  ctx.fillRect(0, gy, W, 3);
  const dash = 46;
  const off = (frame * (boostTimer > 0 ? speed * 1.4 : speed) * 0.55) % (dash * 2);
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

  // Active Power-up Badges
  let hudY = Math.max(72, H * 0.13) + (coinCount > 0 ? size * 1.25 : size * 0.85);
  if (shieldTimer > 0) {
    ctx.font = "700 " + Math.round(size * 0.35) + 'px "Bebas Neue", sans-serif';
    ctx.fillStyle = CYAN;
    const remaining = Math.ceil(shieldTimer / 60);
    ctx.fillText("🛡️ SHIELD " + remaining + "s", W / 2, hudY);
    hudY += size * 0.35;
  }
  if (magnetTimer > 0) {
    ctx.font = "700 " + Math.round(size * 0.35) + 'px "Bebas Neue", sans-serif';
    ctx.fillStyle = PURPLE;
    const remaining = Math.ceil(magnetTimer / 60);
    ctx.fillText("🧲 MAGNET " + remaining + "s", W / 2, hudY);
    hudY += size * 0.35;
  }
  if (boostTimer > 0) {
    ctx.font = "700 " + Math.round(size * 0.35) + 'px "Bebas Neue", sans-serif';
    ctx.fillStyle = GOLD2;
    const remaining = Math.ceil(boostTimer / 60);
    ctx.fillText("⚡ BOOST 2X " + remaining + "s", W / 2, hudY);
  }

  ctx.restore();
}

/* ---------- render ---------- */
function render() {
  ctx.save();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  if (deathFlash > 0) {
    ctx.fillStyle = "rgba(255,255,255," + (deathFlash / 12) + ")";
    ctx.fillRect(0, 0, W, H);
  }

  ctx.translate(shakeX, shakeY);
  ctx.clearRect(-10, -10, W + 20, H + 20);

  drawSky();
  drawGround();
  for (const c of collectibles) drawCollectible(c);
  for (const o of obstacles) drawObstacle(o);
  drawParticles();
  drawDuck();
  drawPopups();
  drawHUD();

  if (state === states.PAUSED) {
    ctx.fillStyle = "rgba(6, 8, 12, 0.65)";
    ctx.fillRect(0, 0, W, H);
    ctx.font = '700 3.2rem "Bebas Neue", sans-serif';
    ctx.textAlign = "center";
    ctx.fillStyle = GOLD;
    ctx.shadowColor = "rgba(245,197,24,0.5)";
    ctx.shadowBlur = 20;
    ctx.fillText("PAUSED", W / 2, H * 0.45);
    ctx.font = '0.9rem "Space Mono", monospace';
    ctx.fillStyle = "#fff";
    ctx.shadowBlur = 0;
    ctx.fillText("Tap ⏸ to resume", W / 2, H * 0.52);
  }

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

if (muteBtn) {
  muteBtn.textContent = muteOn ? "🔇" : "🔊";
  muteBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleMute(); });
}
if (shareBtn) shareBtn.addEventListener("click", (e) => { e.stopPropagation(); shareScore(); });
