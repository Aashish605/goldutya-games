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

function fitCanvas() {
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, rect.width);
  const cssH = Math.max(1, rect.height);
  DPR = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssW * DPR);
  canvas.height = Math.round(cssH * DPR);
  W = cssW;
  H = cssH;
  COIN_R = Math.max(14, Math.min(24, Math.min(W, H) * 0.032));
  BOMB_R = Math.max(16, Math.min(26, Math.min(W, H) * 0.035));
  SHIELD_R = Math.max(13, Math.min(22, Math.min(W, H) * 0.028));
  DUCK_W = Math.max(48, Math.min(72, Math.min(W, H) * 0.12));
  DUCK_H = DUCK_W * 0.83;
  BASE_SPEED = Math.max(2.0, Math.min(3.5, H * 0.003));
  BASE_SPAWN = Math.max(35, Math.min(65, Math.round(W * 0.14)));
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
let unlockedSkins = JSON.parse(localStorage.getItem("goldutya-clicker-skins") || "[0]");
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
    localStorage.setItem("goldutya-clicker-skins", JSON.stringify(unlockedSkins));
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
let timeLeft = 60, lastTimeTick = 0;
let speedMult = 1;
let nightPhase = 0, nightDir = 0, nightTimer = 0;
let muteOn = false;
let duckBob = 0;

best = Number(localStorage.getItem("goldutya-clicker-best") || 0);
if (bestEl) bestEl.textContent = best;
muteOn = localStorage.getItem("goldutya-clicker-mute") === "1";

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
  localStorage.setItem("goldutya-clicker-mute", muteOn ? "1" : "0");
  if (muteBtn) muteBtn.textContent = muteOn ? "\u{1F507}" : "\u{1F50A}";
}

/* ---------- popups ---------- */
function addPopup(x, y, text, color, scale) {
  popups.push({ x: x, y: y, text: text, color: color, life: 36, maxLife: 36, vy: -1.8, scale: scale || 1 });
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
  shieldTimer = 0;
  itemsCollected = 0;
  bombTimer = 0;
  shieldTimerSpawn = 15 * 60 + Math.random() * 5 * 60;
  timeLeft = 60;
  lastTimeTick = 0;
  speedMult = 1;
  nightPhase = 0; nightDir = 0; nightTimer = 0;
  duckBob = 0;
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

function spawnBomb() {
  const speed = BASE_SPEED * speedMult;
  const drift = (Math.random() - 0.5) * 0.6;
  items.push({
    type: "bomb",
    x: BOMB_R + Math.random() * (W - BOMB_R * 2),
    y: -BOMB_R * 2,
    r: BOMB_R,
    vy: speed * 0.9 + Math.random() * 0.6,
    vx: drift,
    alive: true,
  });
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
    const a = Math.random() * Math.PI * 2;
    const s = 1 + Math.random() * 4.5;
    particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.5, life: 28 + Math.random() * 18, color: color, r: 2 + Math.random() * 3 });
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

/* ---------- draw items ---------- */
function drawCoin(c) {
  ctx.save();
  ctx.translate(c.x, c.y);
  c.spin += 0.08;
  const scaleX = Math.abs(Math.cos(c.spin));
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.ellipse(0, 0, c.r * scaleX, c.r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = GOLD2;
  ctx.beginPath();
  ctx.ellipse(-c.r * 0.22 * scaleX, -c.r * 0.22, c.r * 0.4 * scaleX, c.r * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.beginPath();
  ctx.moveTo(c.r * 0.3 * scaleX, -c.r * 0.4);
  ctx.lineTo(c.r * 0.55 * scaleX, -c.r * 0.15);
  ctx.lineTo(c.r * 0.2 * scaleX, -c.r * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawBomb(b) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.arc(0, 0, b.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8B0000";
  ctx.beginPath();
  ctx.arc(0, 0, b.r * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.beginPath();
  ctx.arc(-b.r * 0.2, -b.r * 0.2, b.r * 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#8B0000";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(0, -b.r);
  ctx.lineTo(3, -b.r - 8);
  ctx.stroke();
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.arc(3, -b.r - 10, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawShieldStar(s) {
  ctx.save();
  ctx.translate(s.x, s.y);
  s.glow += 0.12;
  const glowAlpha = 0.4 + Math.sin(s.glow) * 0.3;
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = 16;
  ctx.fillStyle = CYAN;
  ctx.globalAlpha = glowAlpha;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a1 = (i * 2 * Math.PI / 5) - Math.PI / 2;
    const a2 = ((i + 0.5) * 2 * Math.PI / 5) - Math.PI / 2;
    const outerR = s.r * 1.3;
    const innerR = s.r * 0.55;
    if (i === 0) ctx.moveTo(Math.cos(a1) * outerR, Math.sin(a1) * outerR);
    else ctx.lineTo(Math.cos(a1) * outerR, Math.sin(a1) * outerR);
    ctx.lineTo(Math.cos(a2) * innerR, Math.sin(a2) * innerR);
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#fff";
  ctx.font = '700 14px "Bebas Neue", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("S", 0, 1);
  ctx.restore();
}

/* ---------- duck ---------- */
function getDuckFrame() {
  if (shieldTimer > 0) return DUCK_FRAMES.mid;
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

/* ---------- tap handling ---------- */
function handleTap(x, y) {
  if (state === states.OVER) return;
  if (state === states.READY) {
    state = states.PLAY;
    overlay.classList.add("hidden");
    invuln = 20;
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
    const tapR = item.r + 24;
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
    coinBlip();
    burst(hitItem.x, hitItem.y, GOLD, 12);
    addPopup(hitItem.x, hitItem.y, "+" + pts, GOLD2, 1.1);
    if (combo >= 3) comboBlip(combo);
    checkNight();
    checkSpeedRamp();
  } else if (hitItem.type === "bomb") {
    if (shieldTimer > 0) {
      shieldTimer = 0;
      burst(hitItem.x, hitItem.y, CYAN, 14);
      addPopup(hitItem.x, hitItem.y, "SHIELD!", CYAN, 1.2);
      shieldBlip();
      shakeDur = 8;
    } else {
      gameOver();
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

function canvasTouch(e) {
  e.preventDefault();
  initAudio();
  const rect = canvas.getBoundingClientRect();
  for (let i = 0; i < e.changedTouches.length; i++) {
    const touch = e.changedTouches[i];
    const x = (touch.clientX - rect.left) * (W / rect.width);
    const y = (touch.clientY - rect.top) * (H / rect.height);
    handleTap(x, y);
  }
}

document.addEventListener("keydown", handleKey);
canvas.addEventListener("pointerdown", canvasTap);
canvas.addEventListener("touchstart", canvasTouch, { passive: false });
if (startBtn) startBtn.addEventListener("click", function(e) {
  e.stopPropagation();
  initAudio();
  if (state === states.OVER) reset();
  state = states.PLAY;
  overlay.classList.add("hidden");
  invuln = 20;
});

/* ---------- game over ---------- */
function gameOver() {
  if (state !== states.PLAY) return;
  state = states.OVER;
  thud();
  shakeDur = 24;
  deathFlash = 12;
  burst(W / 2, H - 80, RED, 20);
  burst(W / 2, H - 80, GOLD, 12);
  unlockCheck(score);
  if (score > best) {
    best = score;
    localStorage.setItem("goldutya-clicker-best", String(best));
    if (bestEl) bestEl.textContent = best;
  }
  setTimeout(function() {
    if (state !== states.OVER) return;
    overlay.classList.remove("hidden");
    const duckImgEl = overlay.querySelector(".overlay-duck-img");
    if (duckImgEl) duckImgEl.src = "assets/duck-mid.png?" + Date.now();
    const sub = overlay.querySelector(".overlay-sub");
    let msg = score > 0 ? "Score: " + score + " (" + (60 - timeLeft) + "s)" : "Time's up! Try again.";
    if (maxCombo > 1) msg += " | Max combo: " + maxCombo + "x";
    if (sub) sub.textContent = msg;
    const btn = overlay.querySelector(".btn");
    if (btn) btn.textContent = "PLAY AGAIN";
    if (shareBtn) { shareBtn.style.display = score > 0 ? "" : "none"; shareBtn.textContent = "SHARE SCORE"; }
  }, 700);
}

/* ---------- sky / ground ---------- */
function drawSky() {
  var dayTop = [26, 58, 102], nightTop = [8, 15, 30];
  var dayBot = [18, 48, 72], nightBot = [4, 8, 18];
  var n = nightPhase;
  var g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "rgb(" + Math.round(dayTop[0] * (1 - n) + nightTop[0] * n) + "," + Math.round(dayTop[1] * (1 - n) + nightTop[1] * n) + "," + Math.round(dayTop[2] * (1 - n) + nightTop[2] * n) + ")");
  g.addColorStop(0.55, "rgb(" + Math.round(dayTop[0] * 0.85 * (1 - n) + nightTop[0] * 0.85 * n) + "," + Math.round(dayTop[1] * 0.85 * (1 - n) + nightTop[1] * 0.85 * n) + "," + Math.round(dayTop[2] * 0.9 * (1 - n) + nightTop[2] * 0.9 * n) + ")");
  g.addColorStop(1, "rgb(" + Math.round(dayBot[0] * (1 - n) + nightBot[0] * n) + "," + Math.round(dayBot[1] * (1 - n) + nightBot[1] * n) + "," + Math.round(dayBot[2] * (1 - n) + nightBot[2] * n) + ")");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  if (n < 0.5) {
    var sun = ctx.createRadialGradient(W * 0.82, H * 0.14, 8, W * 0.82, H * 0.14, Math.max(80, W * 0.35));
    sun.addColorStop(0, "rgba(245,197,24," + (0.22 * (1 - n * 2)) + ")");
    sun.addColorStop(1, "rgba(245,197,24,0)");
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, W, H);
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

  var timerGrad = ctx.createLinearGradient(barX, barY, barX + barW * frac, barY);
  if (timeLeft <= 10) {
    timerGrad.addColorStop(0, RED);
    timerGrad.addColorStop(1, "#FF6B6B");
  } else {
    timerGrad.addColorStop(0, GOLD);
    timerGrad.addColorStop(1, GOLD2);
  }
  ctx.fillStyle = timerGrad;
  ctx.fillRect(barX, barY, barW * frac, barH);

  ctx.strokeStyle = "rgba(245,197,24,0.3)";
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, barW, barH);

  ctx.font = '700 16px "Bebas Neue", sans-serif';
  ctx.textAlign = "center";
  ctx.fillStyle = timeLeft <= 10 ? RED : "#fff";
  ctx.fillText(timeLeft + "s", W / 2, barY + barH + 18);
}

/* ---------- update ---------- */
function update() {
  frame++;

  if (shakeDur > 0) {
    shakeDur--;
    shakeX = (Math.random() - 0.5) * shakeDur * 1.2;
    shakeY = (Math.random() - 0.5) * shakeDur * 1.2;
  } else {
    shakeX = 0;
    shakeY = 0;
  }

  if (deathFlash > 0) deathFlash--;
  if (scoreScale > 1.01) scoreScale += (1 - scoreScale) * 0.12;

  duckBob = Math.sin(frame * 0.08) * 3;

  for (var ci = 0; ci < clouds.length; ci++) {
    var c = clouds[ci];
    var spd = (state === states.PLAY ? 1 : 0.25) * c.speed;
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
    updateParticles();
    updatePopups();
    return;
  }

  if (state === states.OVER) {
    updateParticles();
    updatePopups();
    return;
  }

  /* timer */
  if (frame - lastTimeTick >= 60) {
    lastTimeTick = frame;
    timeLeft--;
    if (timeLeft <= 10 && timeLeft > 0) tickBlip();
    if (timeLeft <= 0) { timeLeft = 0; gameOver(); return; }
  }

  if (invuln > 0) invuln--;
  if (shieldTimer > 0) shieldTimer--;

  /* spawn coins */
  var spawnInterval = Math.max(15, Math.round(BASE_SPAWN / speedMult));
  if (frame % spawnInterval === 0) spawnCoin();

  /* spawn bombs */
  bombTimer--;
  if (bombTimer <= 0) {
    spawnBomb();
    bombTimer = Math.round((180 + Math.random() * 120) / speedMult);
  }

  /* spawn shields */
  shieldTimerSpawn--;
  if (shieldTimerSpawn <= 0) {
    spawnShield();
    shieldTimerSpawn = Math.round(900 + Math.random() * 300);
  }

  /* update items */
  for (var i = items.length - 1; i >= 0; i--) {
    var item = items[i];
    if (!item.alive) { items.splice(i, 1); continue; }
    item.y += item.vy;
    item.x += item.vx || 0;
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
  items = items.filter(function(item) { return item.y < H + item.r * 3; });

  /* duck trail particles */
  if (frame % 4 === 0) {
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

  updateParticles();
  updatePopups();
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

  if (deathFlash > 0) {
    ctx.fillStyle = "rgba(255,255,255," + (deathFlash / 12) + ")";
    ctx.fillRect(0, 0, W, H);
  }

  ctx.translate(shakeX, shakeY);
  ctx.clearRect(-10, -10, W + 20, H + 20);

  drawSky();

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
  drawTimer();
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
if (muteBtn) {
  muteBtn.textContent = muteOn ? "\u{1F507}" : "\u{1F50A}";
  muteBtn.addEventListener("click", function(e) { e.stopPropagation(); toggleMute(); });
}
if (shareBtn) shareBtn.addEventListener("click", function(e) { e.stopPropagation(); shareScore(); });
