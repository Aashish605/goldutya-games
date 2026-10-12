/* Goldutya Clicker — Tap-to-earn falling-coin clicker. Viewport-pixel world. */

"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const startBtn = document.getElementById("startBtn");
const bestEl = document.getElementById("best");
const muteBtn = document.getElementById("muteBtn");
const shareBtn = document.getElementById("shareBtn");

const GOLD = "#F5C518";
const GOLD2 = "#FFDF59";
const RED = "#D42B2B";
const CYAN = "#56D9FF";
const DARK = "#0B0B0D";

let W = 390;
let H = 844;
let DPR = 1;
let COIN_R = 18;
let BOMB_R = 20;
let SHIELD_R = 16;
let DUCK_W = 56;
let DUCK_H = 47;
let BASE_SPEED = 2.5;
let BASE_SPAWN = 55;
let IS_MOBILE = false;
let LOW_END = false;
let MAX_PARTICLES = 160;
const REDUCED = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

function fitCanvas() {
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, rect.width);
  const cssH = Math.max(1, rect.height);
  LOW_END = ((navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4));
  DPR = Math.min(LOW_END ? 1.5 : 2, window.devicePixelRatio || 1);
  canvas.width = Math.round(cssW * DPR);
  canvas.height = Math.round(cssH * DPR);
  W = cssW;
  H = cssH;
  IS_MOBILE = (typeof TG !== "undefined" && TG.platform && ["android","ios"].includes(TG.platform())) || ("ontouchstart" in window) || (navigator.maxTouchPoints || 0) > 0 || W < 600;
  COIN_R = Math.max(14, Math.min(24, Math.min(W, H) * 0.032));
  BOMB_R = Math.max(16, Math.min(26, Math.min(W, H) * 0.035));
  SHIELD_R = Math.max(13, Math.min(22, Math.min(W, H) * 0.028));
  DUCK_W = Math.max(48, Math.min(72, Math.min(W, H) * 0.12));
  DUCK_H = DUCK_W * 0.83;
  const diff = typeof Difficulty !== "undefined" ? Difficulty.getDiff("clicker") : "medium";
  const diffSpeedMult = diff === "easy" ? 0.85 : diff === "hard" ? 1.3 : 1.0;

  if (IS_MOBILE) {
    BASE_SPEED = Math.max(1.5, Math.min(3.6, H * 0.0025 * diffSpeedMult));
  } else {
    BASE_SPEED = Math.max(1.7, Math.min(4.2, H * 0.003 * diffSpeedMult));
  }
  BASE_SPAWN = Math.max(25, Math.min(70, Math.round(W * 0.14 / (diff === "hard" ? 1.2 : diff === "easy" ? 0.85 : 1))));
  MAX_PARTICLES = (LOW_END || REDUCED) ? 100 : 160;
  buildCaches();
}

if (typeof ResizeObserver !== "undefined") {
  new ResizeObserver(fitCanvas).observe(canvas);
} else {
  window.addEventListener("resize", fitCanvas);
}

/* ---------- cached offscreen tiles & sprites (rebuilt on resize) ---------- */
let skyDayCv = null, skyNightCv = null, sunCv = null, vignetteCv = null;
let timerGradGold = null, timerGradRed = null;
let coinSprite = null, bombSprite = null, shieldSprite = null;

function makeSkyTile(top, bot) {
  var c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(W));
  c.height = Math.max(1, Math.round(H));
  var g = c.getContext("2d");
  var grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "rgb(" + top[0] + "," + top[1] + "," + top[2] + ")");
  grad.addColorStop(0.55, "rgb(" + Math.round(top[0] * 0.85) + "," + Math.round(top[1] * 0.85) + "," + Math.round(top[2] * 0.9) + ")");
  grad.addColorStop(1, "rgb(" + bot[0] + "," + bot[1] + "," + bot[2] + ")");
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

function buildSprites() {
  var ss = Math.max(1, DPR);

  coinSprite = document.createElement("canvas");
  coinSprite.w = COIN_R * 2 + 8;
  coinSprite.h = COIN_R * 2 + 8;
  coinSprite.width = Math.ceil(coinSprite.w * ss);
  coinSprite.height = Math.ceil(coinSprite.h * ss);
  var g = coinSprite.getContext("2d");
  g.scale(ss, ss);
  g.translate(coinSprite.w / 2, coinSprite.h / 2);
  g.fillStyle = GOLD;
  g.beginPath();
  g.ellipse(0, 0, COIN_R, COIN_R, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = GOLD2;
  g.beginPath();
  g.ellipse(-COIN_R * 0.22, -COIN_R * 0.22, COIN_R * 0.4, COIN_R * 0.4, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.6)";
  g.beginPath();
  g.moveTo(COIN_R * 0.3, -COIN_R * 0.4);
  g.lineTo(COIN_R * 0.55, -COIN_R * 0.15);
  g.lineTo(COIN_R * 0.2, -COIN_R * 0.1);
  g.closePath();
  g.fill();

  bombSprite = document.createElement("canvas");
  bombSprite.w = (BOMB_R + 14) * 2;
  bombSprite.h = (BOMB_R + 14) * 2;
  bombSprite.width = Math.ceil(bombSprite.w * ss);
  bombSprite.height = Math.ceil(bombSprite.h * ss);
  g = bombSprite.getContext("2d");
  g.scale(ss, ss);
  g.translate(bombSprite.w / 2, bombSprite.h / 2);
  g.fillStyle = RED;
  g.beginPath();
  g.arc(0, 0, BOMB_R, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#8B0000";
  g.beginPath();
  g.arc(0, 0, BOMB_R * 0.55, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.15)";
  g.beginPath();
  g.arc(-BOMB_R * 0.2, -BOMB_R * 0.2, BOMB_R * 0.25, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#8B0000";
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(0, -BOMB_R);
  g.lineTo(3, -BOMB_R - 8);
  g.stroke();
  g.fillStyle = GOLD;
  g.beginPath();
  g.arc(3, -BOMB_R - 10, 3, 0, Math.PI * 2);
  g.fill();

  shieldSprite = document.createElement("canvas");
  shieldSprite.w = SHIELD_R * 1.3 * 2 + 20;
  shieldSprite.h = SHIELD_R * 1.3 * 2 + 20;
  shieldSprite.width = Math.ceil(shieldSprite.w * ss);
  shieldSprite.height = Math.ceil(shieldSprite.h * ss);
  g = shieldSprite.getContext("2d");
  g.scale(ss, ss);
  g.translate(shieldSprite.w / 2, shieldSprite.h / 2);
  g.shadowColor = CYAN;
  g.shadowBlur = 16;
  g.fillStyle = CYAN;
  g.beginPath();
  for (var i = 0; i < 5; i++) {
    var a1 = (i * 2 * Math.PI / 5) - Math.PI / 2;
    var a2 = ((i + 0.5) * 2 * Math.PI / 5) - Math.PI / 2;
    var outerR = SHIELD_R * 1.3;
    var innerR = SHIELD_R * 0.55;
    if (i === 0) g.moveTo(Math.cos(a1) * outerR, Math.sin(a1) * outerR);
    else g.lineTo(Math.cos(a1) * outerR, Math.sin(a1) * outerR);
    g.lineTo(Math.cos(a2) * innerR, Math.sin(a2) * innerR);
  }
  g.closePath();
  g.fill();
}

function buildCaches() {
  skyDayCv = makeSkyTile([26, 58, 102], [18, 48, 72]);
  skyNightCv = makeSkyTile([8, 15, 30], [4, 8, 18]);

  var sunR = Math.max(80, W * 0.35);
  sunCv = document.createElement("canvas");
  sunCv.width = sunR * 2;
  sunCv.height = sunR * 2;
  var sg = sunCv.getContext("2d");
  var sunGrad = sg.createRadialGradient(sunR, sunR, 8, sunR, sunR, sunR);
  sunGrad.addColorStop(0, "rgba(245,197,24,0.22)");
  sunGrad.addColorStop(1, "rgba(245,197,24,0)");
  sg.fillStyle = sunGrad;
  sg.fillRect(0, 0, sunCv.width, sunCv.height);

  vignetteCv = document.createElement("canvas");
  vignetteCv.width = Math.max(1, Math.round(W));
  vignetteCv.height = Math.max(1, Math.round(H));
  var vg = vignetteCv.getContext("2d");
  var vGrad = vg.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
  vGrad.addColorStop(0, "rgba(212,43,43,0)");
  vGrad.addColorStop(1, "rgba(212,43,43,0.24)");
  vg.fillStyle = vGrad;
  vg.fillRect(0, 0, vignetteCv.width, vignetteCv.height);

  var barW = Math.min(W * 0.7, 280);
  var barX = (W - barW) / 2;
  var barY = Math.max(56, H * 0.1);
  timerGradGold = ctx.createLinearGradient(barX, barY, barX + barW, barY);
  timerGradGold.addColorStop(0, GOLD);
  timerGradGold.addColorStop(1, GOLD2);
  timerGradRed = ctx.createLinearGradient(barX, barY, barX + barW, barY);
  timerGradRed.addColorStop(0, RED);
  timerGradRed.addColorStop(1, "#FF6B6B");

  buildSprites();
}

/* ---------- duck skin ---------- */
const SKINS = [
  { name: "Gold", min: 0, filter: "" },
  { name: "Pirate", min: 10, filter: "" },
  { name: "Crown", min: 25, filter: "" },
  { name: "Rainbow", min: 50, filter: "hue-rotate(180deg) saturate(1.6)" },
  { name: "Ghost", min: 100, filter: "opacity(0.55) brightness(1.4)" },
];
let unlockedSkins = [0];
try {
  const storedSkins = JSON.parse(localStorage.getItem("goldutya-clicker-skins") || "[0]");
  if (Array.isArray(storedSkins) && storedSkins.length) unlockedSkins = storedSkins;
} catch (e) { unlockedSkins = [0]; }
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
    try { localStorage.setItem("goldutya-clicker-skins", JSON.stringify(unlockedSkins)); } catch (e) {}
    activeSkin = unlockedSkins[unlockedSkins.length - 1];
    updateSkinUI();
  }
}

function updateSkinUI() {
  const picker = document.getElementById("skinPicker");
  if (!picker) return;
  picker.innerHTML = "";
  const icons = ["", "\u{1F3F4}\u200D\u2620\uFE0F", "\u{1F451}", "\u{1F308}", "\u{1F47B}"];
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
      btn.textContent = unlocked ? icons[i] : "\u{1F512}";
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

const states = { READY: "ready", PLAY: "play", OVER: "over" };
let items, clouds, score, best, state, frame, particles, popups, invuln;
let shakeX = 0, shakeY = 0, shakeDur = 0, deathFlash = 0;
let scoreScale = 1, combo = 0, maxCombo = 0;
let shieldTimer = 0, itemsCollected = 0;
let bombTimer = 0, shieldTimerSpawn = 0;
let timeLeft = 60, timeAcc = 0, spawnAcc = 0, trailAcc = 0;
let speedMult = 1;
let nightPhase = 0, nightDir = 0, nightTimer = 0;
let muteOn = false;
let duckBob = 0, duckVy = 0;
let hintShown = false;
try { hintShown = localStorage.getItem("goldutya-clicker-hinted") === "1"; } catch (e) {}
let hintTimer = 0;
let deathCause = "timeout";
let bombWarns = [];
let paused = false;
const MILESTONES = [100, 250, 500, 1000, 2500, 5000];
let lastMilestone = 0;
const isTouch = ("ontouchstart" in window) || (navigator.maxTouchPoints || 0) > 0;

best = 0;
try { best = Number(localStorage.getItem("goldutya-clicker-best") || 0) || 0; } catch (e) { best = 0; }
if (bestEl) bestEl.textContent = best;
muteOn = false;
try { muteOn = localStorage.getItem("goldutya-clicker-mute") === "1"; } catch (e) {}

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
function coinBlip() { beep(1200, 0.09, "sine", 0.14, 1600); }
function shieldBlip() { beep(880, 0.15, "sine", 0.16, 1100); }
function thud() { beep(110, 0.28, "sine", 0.28, 40); }
function comboBlip(c) { beep(660 + c * 60, 0.1, "sine", 0.12); }
function tickBlip() { beep(800, 0.05, "square", 0.06, 600); }

/* ---------- share & UI ---------- */
function shareScore() {
  const text = "I scored " + score + " in Goldutya Clicker! " + (maxCombo > 1 ? "(" + maxCombo + "x combo!) " : "") + "Can you beat me? \u{1F986}";
  if (navigator.share) {
    navigator.share({ title: "Goldutya Clicker", text }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text).then(() => {
      if (shareBtn) shareBtn.textContent = "COPIED!";
      setTimeout(() => { if (shareBtn) shareBtn.textContent = "SHARE SCORE"; }, 2000);
    }).catch(() => {});
  }
}

function toggleMute() {
  muteOn = !muteOn;
  try { localStorage.setItem("goldutya-clicker-mute", muteOn ? "1" : "0"); } catch (e) {}
  if (muteBtn) muteBtn.innerHTML = muteOn ? '<svg class="icon" viewBox="0 0 24 24"><use href="assets/icons.svg#volume-off"/></svg>' : '<svg class="icon" viewBox="0 0 24 24"><use href="assets/icons.svg#volume-on"/></svg>';
}

/* ---------- popups ---------- */
function addPopup(x, y, text, color, scale) {
  popups.push({ x: x, y: y, text: text, color: color, life: 36, maxLife: 36, vy: -1.8, scale: scale || 1 });
}
function updatePopups(f) {
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i];
    p.y += p.vy * f;
    p.life -= f;
    if (p.life <= 0) popups.splice(i, 1);
  }
}
function drawPopups() {
  ctx.save();
  for (const p of popups) {
    const alpha = Math.min(1, p.life / 16);
    ctx.globalAlpha = alpha;
    ctx.font = "700 " + Math.round(22 * p.scale) + 'px "Bebas Neue", sans-serif';
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#000";
    ctx.strokeText(p.text, p.x, p.y);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.restore();
}

/* ---------- clouds ---------- */
function initClouds() {
  clouds = [];
  for (let i = 0; i < 12; i++) {
    const layer = i % 3;
    clouds.push({
      x: Math.random() * W * 1.5,
      y: H * (0.05 + Math.random() * 0.45),
      speed: [0.15, 0.35, 0.6][layer],
      alpha: [0.08, 0.14, 0.22][layer],
      size: [0.6, 1, 1.4][layer],
    });
  }
}

/* ---------- reset ---------- */
function reset() {
  fitCanvas();
  items = [];
  particles = [];
  popups = [];
  score = 0;
  frame = 0;
  invuln = 40;
  shakeX = 0; shakeY = 0; shakeDur = 0; deathFlash = 0;
  scoreScale = 1;
  combo = 0; maxCombo = 0;
  const diff = typeof Difficulty !== "undefined" ? Difficulty.getDiff("clicker") : "medium";
  shieldTimer = diff === "easy" ? 300 : 0;
  itemsCollected = 0;
  bombTimer = 0;
  bombWarns = [];
  shieldTimerSpawn = diff === "hard" ? 999999 : (10 * 60 + Math.random() * 3 * 60);
  timeLeft = 60;
  timeAcc = 0; spawnAcc = 0; trailAcc = 0;
  speedMult = 1;
  nightPhase = 0; nightDir = 0; nightTimer = 0;
  duckBob = 0;
  duckVy = 0;
  deathCause = "timeout";
  lastMilestone = 0;
  initClouds();
  state = states.READY;
}

reset();

/* ---------- spawning ---------- */
function spawnCoin() {
  const speed = BASE_SPEED * speedMult;
  const drift = (Math.random() - 0.5) * 0.8;
  items.push({
    type: "coin",
    x: COIN_R + Math.random() * (W - COIN_R * 2),
    y: -COIN_R * 2,
    r: COIN_R,
    vy: speed + Math.random() * 0.8,
    vx: drift,
    spin: Math.random() * Math.PI * 2,
    alive: true,
  });
}

function spawnBombAt(x) {
  const speed = BASE_SPEED * speedMult;
  items.push({
    type: "bomb",
    x: x,
    y: -BOMB_R * 2,
    r: BOMB_R,
    vy: speed * 0.9 + Math.random() * 0.6,
    vx: (Math.random() - 0.5) * 0.6,
    alive: true,
  });
}

function scheduleBomb() {
  bombWarns.push({ x: BOMB_R + Math.random() * (W - BOMB_R * 2), t: 30 });
}

function spawnShield() {
  const speed = BASE_SPEED * speedMult * 0.8;
  items.push({
    type: "shield",
    x: SHIELD_R + Math.random() * (W - SHIELD_R * 2),
    y: -SHIELD_R * 2,
    r: SHIELD_R,
    vy: speed,
    vx: 0,
    glow: 0,
    alive: true,
  });
}

/* ---------- particles ---------- */
function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    if (particles.length >= MAX_PARTICLES) break;
    const a = Math.random() * Math.PI * 2;
    const s = 1 + Math.random() * 4.5;
    particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.5, life: 28 + Math.random() * 18, color: color, r: 2 + Math.random() * 3 });
  }
}
function updateParticles(f) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * f; p.y += p.vy * f; p.vy += 0.14 * f; p.life -= f;
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

/* ---------- draw items ---------- */
function drawCoin(c) {
  if (!coinSprite) return;
  const scaleX = Math.abs(Math.cos(c.spin));
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.scale(scaleX, 1);
  ctx.drawImage(coinSprite, -coinSprite.w / 2, -coinSprite.h / 2, coinSprite.w, coinSprite.h);
  ctx.restore();
}

function drawBomb(b) {
  if (!bombSprite) return;
  ctx.drawImage(bombSprite, b.x - bombSprite.w / 2, b.y - bombSprite.h / 2, bombSprite.w, bombSprite.h);
}

function drawBombWarns() {
  for (var wi = 0; wi < bombWarns.length; wi++) {
    var w = bombWarns[wi];
    var prog = (30 - w.t) / 30;
    ctx.save();
    ctx.globalAlpha = 0.5 + Math.sin(frame * 0.4) * 0.3;
    ctx.fillStyle = RED;
    ctx.beginPath();
    ctx.arc(w.x, 14, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(212,43,43," + 0.6 * (1 - prog) + ")";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 7]);
    ctx.beginPath();
    ctx.moveTo(w.x, 22);
    ctx.lineTo(w.x, 22 + prog * H * 0.1);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}

function drawUrgency() {
  if (state !== states.PLAY || timeLeft > 10 || !vignetteCv) return;
  var pulse = 0.14 + Math.sin(frame * 0.3) * 0.1;
  ctx.globalAlpha = pulse / 0.24;
  ctx.drawImage(vignetteCv, 0, 0, W, H);
  ctx.globalAlpha = 1;
}

function drawShieldStar(s) {
  if (!shieldSprite) return;
  const glowAlpha = 0.4 + Math.sin(s.glow) * 0.3;
  ctx.globalAlpha = glowAlpha;
  ctx.drawImage(shieldSprite, s.x - shieldSprite.w / 2, s.y - shieldSprite.h / 2, shieldSprite.w, shieldSprite.h);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#fff";
  ctx.font = '700 14px "Bebas Neue", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("S", s.x, s.y + 1);
}

/* ---------- duck ---------- */
function getDuckFrame() {
  if (duckVy < -1) return DUCK_FRAMES.up;
  if (duckVy > 1) return DUCK_FRAMES.down;
  return DUCK_FRAMES.mid;
}

function drawDuck() {
  const bobY = duckBob;
  ctx.save();
  ctx.translate(W / 2, H - 80 + bobY);

  const frame = getDuckFrame();
  if (frame.img.complete && frame.img.naturalWidth > 0) {
    ctx.save();
    const skinData = SKINS.find(function(s) { return s.min === activeSkin; });
    if (skinData && skinData.filter) ctx.filter = skinData.filter;
    ctx.drawImage(frame.img, frame.sx, frame.sy, frame.sw, frame.sh, -DUCK_W / 2, -DUCK_H / 2, DUCK_W, DUCK_H);
    ctx.restore();
    if (activeSkin === 10) {
      ctx.fillStyle = DARK;
      ctx.fillRect(-DUCK_W * 0.1, -DUCK_H * 0.18, DUCK_W * 0.28, DUCK_H * 0.12);
    }
    if (activeSkin === 25) {
      ctx.fillStyle = GOLD;
      ctx.beginPath();
      ctx.moveTo(-DUCK_W * 0.15, -DUCK_H * 0.42);
      ctx.lineTo(0, -DUCK_H * 0.62);
      ctx.lineTo(DUCK_W * 0.15, -DUCK_H * 0.42);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = RED;
      ctx.beginPath();
      ctx.arc(0, -DUCK_H * 0.58, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (duckFallback.complete && duckFallback.naturalWidth > 0) {
    ctx.drawImage(duckFallback, -DUCK_W / 2, -DUCK_H / 2, DUCK_W, DUCK_H);
  } else {
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.ellipse(0, 0, DUCK_W / 2, DUCK_H / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (shieldTimer > 0) {
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.5 + Math.sin(frame * 0.25) * 0.3;
    ctx.beginPath();
    ctx.arc(0, 0, DUCK_W * 0.58, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  if (combo >= 3) {
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.3 + Math.sin(frame * 0.2) * 0.2;
    ctx.beginPath();
    ctx.arc(0, 0, DUCK_W * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

/* ---------- hint ---------- */
function drawHint() {
  if (hintShown || hintTimer <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, hintTimer / 30);
  ctx.font = '700 ' + Math.round(H * 0.04) + 'px "Bebas Neue", sans-serif';
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.fillText("TAP COINS \u00B7 DODGE BOMBS", W / 2, H / 2);
  ctx.restore();
}

/* ---------- tap handling ---------- */
function handleTap(x, y) {
  if (state === states.OVER) return;
  if (state === states.READY) {
    state = states.PLAY;
    overlay.classList.add("hidden");
    invuln = 20;
    if (!hintShown) hintTimer = 120;
    return;
  }
  if (state !== states.PLAY) return;

  let hitItem = null;
  let hitDist = Infinity;
  for (const item of items) {
    if (!item.alive) continue;
    const dx = x - item.x;
    const dy = y - item.y;
    const dist = Math.hypot(dx, dy);
    const tapR = item.r + (isTouch ? 32 : 24);
    if (dist < tapR && dist < hitDist) {
      hitItem = item;
      hitDist = dist;
    }
  }

  if (!hitItem) return;

  hitItem.alive = false;

  if (hitItem.type === "coin") {
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    const mult = getComboMult();
    const pts = 10 * mult;
    score += pts;
    itemsCollected++;
    scoreScale = 1.4;
    duckVy = -7;
    coinBlip();
    burst(hitItem.x, hitItem.y, GOLD, 12);
    addPopup(hitItem.x, hitItem.y, "+" + pts, GOLD2, 1.1);
    if (combo >= 3) comboBlip(combo);
    checkNight();
    checkSpeedRamp();
    checkMilestone(score);
  } else if (hitItem.type === "bomb") {
    if (shieldTimer > 0) {
      shieldTimer = 0;
      burst(hitItem.x, hitItem.y, CYAN, 14);
      addPopup(hitItem.x, hitItem.y, "SHIELD!", CYAN, 1.2);
      shieldBlip();
      shakeDur = 8;
    } else {
      gameOver("bomb");
      return;
    }
  } else if (hitItem.type === "shield") {
    shieldTimer = 180;
    burst(hitItem.x, hitItem.y, CYAN, 16);
    addPopup(hitItem.x, hitItem.y, "SHIELD!", CYAN, 1.3);
    shieldBlip();
  }
}

function getComboMult() {
  if (combo >= 15) return 4;
  if (combo >= 10) return 3;
  if (combo >= 5) return 2;
  return 1;
}

function checkNight() {
  if (itemsCollected > 0 && itemsCollected % 20 === 0 && nightDir === 0) {
    nightDir = 1;
    nightTimer = 90;
  }
}

function checkSpeedRamp() {
  const elapsed = 60 - timeLeft;
  const rampIndex = Math.floor(elapsed / 10);
  speedMult = 1 + rampIndex * 0.25;
}

function checkMilestone(sc) {
  if (MILESTONES[lastMilestone] !== undefined && sc >= MILESTONES[lastMilestone]) {
    const ms = MILESTONES[lastMilestone];
    lastMilestone++;
    burst(W / 2, H * 0.32, GOLD, 18);
    addPopup(W / 2, H * 0.34, ms + "!", GOLD, 1.3);
    beep(660 + lastMilestone * 40, 0.25, "sine", 0.18, 990 + lastMilestone * 40);
    scoreScale = 1.7;
  }
}

/* ---------- input ---------- */
function handleKey(e) {
  if (e.code === "Space" || e.code === "ArrowUp" || e.code === "Enter") {
    e.preventDefault();
    if (state === states.READY || state === states.OVER) {
      initAudio();
      if (state === states.OVER) reset();
      state = states.PLAY;
      overlay.classList.add("hidden");
      invuln = 20;
    }
  }
}

function canvasTap(e) {
  e.preventDefault();
  initAudio();
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (W / rect.width);
  const y = (e.clientY - rect.top) * (H / rect.height);
  handleTap(x, y);
}

document.addEventListener("keydown", handleKey);
canvas.addEventListener("pointerdown", canvasTap);
if (startBtn) startBtn.addEventListener("click", function(e) {
  e.stopPropagation();
  initAudio();
  if (state === states.OVER) reset();
  state = states.PLAY;
  overlay.classList.add("hidden");
  invuln = 20;
});
overlay.addEventListener("pointerdown", function(e) {
  if (e.target && e.target.closest && e.target.closest("button, a")) return;
  if (state !== states.READY && state !== states.OVER) return;
  initAudio();
  if (state === states.OVER) reset();
  state = states.PLAY;
  overlay.classList.add("hidden");
  invuln = 20;
});

/* ---------- game over ---------- */
function gameOver(cause) {
  if (state !== states.PLAY) return;
  state = states.OVER;
  deathCause = cause || "timeout";
  thud();
  TG.haptic("heavy");
  shakeDur = 24;
  deathFlash = 12;
  burst(W / 2, H - 80, RED, 20);
  burst(W / 2, H - 80, GOLD, 12);
  unlockCheck(score);
  if (score > best) {
    best = score;
    try { localStorage.setItem("goldutya-clicker-best", String(best)); } catch (e) {}
    if (bestEl) bestEl.textContent = best;
    burst(W / 2, H * 0.3, GOLD, 20);
    addPopup(W / 2, H * 0.32, "NEW BEST!", GOLD, 1.4);
    beep(440, 0.3, "sine", 0.2, 880);
    scoreScale = 1.8;
  }
  if (score > 0) { Leaderboard.addScore("clicker", score, { combo: maxCombo, cause: deathCause }); }
  setTimeout(function() {
    if (state !== states.OVER) return;
    overlay.classList.remove("hidden");
    const duckImgEl = overlay.querySelector(".overlay-duck-img");
    if (duckImgEl) duckImgEl.src = "assets/duck-mid.png?" + Date.now();
    const sub = overlay.querySelector(".overlay-sub");
    let msg = score > 0
      ? (deathCause === "bomb" ? "BOOM! Score: " + score : "Time's up! Score: " + score)
      : "Time's up! Try again.";
    if (maxCombo > 1) msg += " | Max combo: " + maxCombo + "x";
    if (sub) sub.textContent = msg;
    const btn = overlay.querySelector(".btn");
    if (btn) btn.textContent = "PLAY AGAIN";
    if (shareBtn) { shareBtn.style.display = score > 0 ? "" : "none"; shareBtn.textContent = "SHARE SCORE"; }
    const lbContainer = document.getElementById("leaderboard");
    if (lbContainer) Leaderboard.renderBoard(lbContainer, "clicker", score);
  }, 700);
}

/* ---------- sky / ground ---------- */
function drawSky() {
  var n = nightPhase;
  var skyCv = n >= 0.5 ? skyNightCv : skyDayCv;
  if (skyCv) ctx.drawImage(skyCv, 0, 0, W, H);

  if (n < 0.5 && sunCv) {
    ctx.globalAlpha = 1 - n * 2;
    ctx.drawImage(sunCv, W * 0.82 - sunCv.width / 2, H * 0.14 - sunCv.height / 2);
    ctx.globalAlpha = 1;
  }

  if (n > 0.4) {
    ctx.fillStyle = "rgba(255,255,255," + ((n - 0.4) * 0.6) + ")";
    for (var i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc((W * 0.15 + i * W * 0.17) % W, H * (0.06 + i * 0.04), 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalAlpha = 1;
  for (var ci = 0; ci < clouds.length; ci++) {
    var c = clouds[ci];
    ctx.fillStyle = "rgba(255,255,255," + (c.alpha * (1 - n * 0.5)) + ")";
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, 48 * c.size, 18 * c.size, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x + 28 * c.size, c.y + 4, 32 * c.size, 14 * c.size, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x - 24 * c.size, c.y + 6, 28 * c.size, 12 * c.size, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTimer() {
  if (state !== states.PLAY) return;
  var barW = Math.min(W * 0.7, 280);
  var barH = 10;
  var barX = (W - barW) / 2;
  var barY = Math.max(56, H * 0.1);
  var frac = timeLeft / 60;

  ctx.fillStyle = "rgba(11,11,13,0.5)";
  ctx.fillRect(barX, barY, barW, barH);

  var timerGrad = timeLeft <= 10 ? timerGradRed : timerGradGold;
  if (timerGrad) {
    ctx.fillStyle = timerGrad;
    ctx.fillRect(barX, barY, barW * frac, barH);
  }

  ctx.strokeStyle = "rgba(245,197,24,0.3)";
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, barW, barH);

  ctx.font = '700 24px "Bebas Neue", sans-serif';
  ctx.textAlign = "center";
  ctx.fillStyle = timeLeft <= 10 ? RED : "#fff";
  ctx.fillText(timeLeft + "s", W / 2, barY + barH + 24);
}

/* ---------- update ---------- */
function update(f, dtMs) {
  frame += f;

  if (shakeDur > 0) {
    shakeDur -= f;
    shakeX = (Math.random() - 0.5) * shakeDur * 1.2;
    shakeY = (Math.random() - 0.5) * shakeDur * 1.2;
  } else {
    shakeX = 0;
    shakeY = 0;
  }

  if (deathFlash > 0) deathFlash -= f;
  if (scoreScale > 1.01) scoreScale += (1 - scoreScale) * Math.min(1, 0.12 * f);
  if (hintTimer > 0) {
    hintTimer -= f;
    if (hintTimer <= 0 && !hintShown) {
      hintShown = true;
      try { localStorage.setItem("goldutya-clicker-hinted", "1"); } catch (e) {}
    }
  }

  duckBob = Math.sin(frame * 0.08) * 3 + duckVy * 1.4;

  for (var ci = 0; ci < clouds.length; ci++) {
    var c = clouds[ci];
    var spd = (state === states.PLAY ? 1 : 0.25) * c.speed;
    c.x -= spd * f;
    if (c.x < -100) { c.x = W + 60 + Math.random() * 120; c.y = H * (0.05 + Math.random() * 0.45); }
  }

  if (nightDir !== 0) {
    nightTimer -= f;
    if (nightTimer <= 0) {
      if (nightDir === 1) { nightPhase = 1; nightDir = -1; nightTimer = 60; }
      else { nightPhase = 0; nightDir = 0; }
    }
  }

  if (state === states.READY) {
    updateParticles(f);
    updatePopups(f);
    return;
  }

  if (state === states.OVER) {
    updateParticles(f);
    updatePopups(f);
    return;
  }

  /* timer — real seconds regardless of fps */
  timeAcc += dtMs;
  if (timeAcc >= 1000) {
    timeAcc -= 1000;
    timeLeft--;
    if (timeLeft <= 10 && timeLeft > 0) tickBlip();
    if (timeLeft <= 0) { timeLeft = 0; gameOver(); return; }
  }

  if (invuln > 0) invuln -= f;
  if (shieldTimer > 0) shieldTimer -= f;
  if (duckVy !== 0) duckVy *= Math.pow(0.9, f);

  /* spawn coins */
  var spawnInterval = Math.max(15, Math.round(BASE_SPAWN / speedMult));
  if (timeLeft <= 10) spawnInterval = Math.max(10, spawnInterval - 4);
  spawnAcc += f;
  if (spawnAcc >= spawnInterval) {
    spawnAcc -= spawnInterval;
    spawnCoin();
  }

  /* spawn bombs */
  bombTimer -= f;
  if (bombTimer <= 0) {
    scheduleBomb();
    bombTimer = Math.round((180 + Math.random() * 120) / speedMult);
  }

  for (var wi = bombWarns.length - 1; wi >= 0; wi--) {
    bombWarns[wi].t -= f;
    if (bombWarns[wi].t <= 0) {
      spawnBombAt(bombWarns[wi].x);
      bombWarns.splice(wi, 1);
    }
  }

  /* spawn shields */
  shieldTimerSpawn -= f;
  if (shieldTimerSpawn <= 0) {
    spawnShield();
    shieldTimerSpawn = Math.round(700 + Math.random() * 200);
  }

  /* update items */
  for (var i = items.length - 1; i >= 0; i--) {
    var item = items[i];
    if (!item.alive) { items.splice(i, 1); continue; }
    item.y += item.vy * f;
    item.x += (item.vx || 0) * f;
    if (item.type === "coin") item.spin += 0.08 * f;
    if (item.type === "shield") item.glow += 0.12 * f;
    if (item.x < item.r) { item.x = item.r; item.vx = Math.abs(item.vx) * 0.5; }
    if (item.x > W - item.r) { item.x = W - item.r; item.vx = -Math.abs(item.vx) * 0.5; }

    /* miss = coin fell off bottom */
    if (item.type === "coin" && item.y > H + item.r * 2) {
      item.alive = false;
      combo = 0;
      addPopup(item.x, H - 20, "MISS", RED, 0.8);
    }

    /* bomb/shield/shield off screen */
    if (item.y > H + item.r * 2) {
      item.alive = false;
    }
  }

  /* compact off-screen items in place */
  var w = 0;
  for (var k = 0; k < items.length; k++) {
    var it = items[k];
    if (it.y < H + it.r * 3) items[w++] = it;
  }
  items.length = w;

  /* duck trail particles */
  trailAcc += f;
  if (trailAcc >= 4) {
    trailAcc -= 4;
    if (particles.length < MAX_PARTICLES) {
      particles.push({
        x: W / 2 - DUCK_W * 0.3 + Math.random() * 6,
        y: H - 80 + DUCK_H * 0.3 + Math.random() * 4,
        vx: -0.8 - Math.random() * 1.2,
        vy: 0.3 + Math.random() * 0.6,
        life: 16 + Math.random() * 10,
        color: GOLD,
        r: 2 + Math.random() * 2,
      });
    }
  }

  updateParticles(f);
  updatePopups(f);
}

/* ---------- HUD ---------- */
function drawHUD() {
  if (state !== states.PLAY) return;
  var size = Math.max(42, Math.round(H * 0.07)) * scoreScale;
  ctx.save();
  ctx.font = "700 " + Math.round(size) + 'px "Bebas Neue", sans-serif';
  ctx.textAlign = "center";
  ctx.lineWidth = Math.max(4, size * 0.1);
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.strokeText(String(score), W / 2, Math.max(90, H * 0.16));
  ctx.fillStyle = GOLD;
  ctx.fillText(String(score), W / 2, Math.max(90, H * 0.16));

  if (combo >= 3) {
    var cs = Math.round(size * 0.48);
    ctx.font = "700 " + cs + 'px "Bebas Neue", sans-serif';
    ctx.fillStyle = GOLD2;
    ctx.fillText("COMBO x" + getComboMult(), W / 2, Math.max(90, H * 0.16) + size * 0.6);
  }

  if (speedMult > 1) {
    var us = Math.round(size * 0.34);
    ctx.font = "700 " + us + 'px "Bebas Neue", sans-serif';
    ctx.fillStyle = CYAN;
    ctx.fillText("SPEED x" + Math.round(speedMult * 100) / 100, W / 2, Math.max(90, H * 0.16) + size * 0.74);
  }

  if (shieldTimer > 0) {
    var ss = Math.round(size * 0.35);
    ctx.font = "700 " + ss + 'px "Bebas Neue", sans-serif';
    ctx.fillStyle = CYAN;
    var remaining = Math.ceil(shieldTimer / 60);
    ctx.fillText("SHIELD " + remaining + "s", W / 2, Math.max(90, H * 0.16) + size * 0.95);
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
  drawBombWarns();

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (!item.alive) continue;
    if (item.type === "coin") drawCoin(item);
    else if (item.type === "bomb") drawBomb(item);
    else if (item.type === "shield") drawShieldStar(item);
  }

  drawParticles();
  drawDuck();
  drawPopups();
  drawUrgency();
  drawTimer();
  drawHint();
  drawHUD();

  if (deathFlash > 0) {
    ctx.fillStyle = "rgba(255,255,255," + (deathFlash / 12) + ")";
    ctx.fillRect(-20, -20, W + 40, H + 40);
  }

  ctx.restore();
}

document.addEventListener("visibilitychange", function () {
  paused = document.hidden;
});

let lastT = 0;
function loop(t) {
  if (!lastT) lastT = t;
  const dtMs = Math.min(50, t - lastT);
  lastT = t;
  const f = Math.min(2.5, dtMs / 16.6667);
  if (!paused) update(f, dtMs);
  render();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
document.addEventListener("pointerdown", initAudio, { once: true });
updateSkinUI();
if (typeof Difficulty !== "undefined") {
  Difficulty.renderPicker(document.getElementById("diffPicker"), "clicker", () => reset());
}
if (muteBtn) {
  muteBtn.innerHTML = muteOn ? '<svg class="icon" viewBox="0 0 24 24"><use href="assets/icons.svg#volume-off"/></svg>' : '<svg class="icon" viewBox="0 0 24 24"><use href="assets/icons.svg#volume-on"/></svg>';
  muteBtn.addEventListener("click", function(e) { e.stopPropagation(); toggleMute(); });
}
if (shareBtn) shareBtn.addEventListener("click", function(e) { e.stopPropagation(); shareScore(); });

