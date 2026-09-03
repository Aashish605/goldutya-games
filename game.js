/* Goldutya Fly — production flappy. 14-feature enhanced build. */

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

/* ---------- duck skin ---------- */
const SKINS = [
  { name: "Gold", min: 0, filter: "" },
  { name: "Pirate", min: 10, filter: "" },
  { name: "Crown", min: 25, filter: "" },
  { name: "Rainbow", min: 50, filter: "hue-rotate(180deg) saturate(1.6)" },
  { name: "Ghost", min: 100, filter: "opacity(0.55) brightness(1.4)" },
];
let unlockedSkins = JSON.parse(localStorage.getItem("goldutya-fly-skins") || "[0]");
let activeSkin = unlockedSkins[unlockedSkins.length - 1] || 0;

function unlockCheck(score) {
  let changed = false;
  for (const s of SKINS) {
    if (score >= s.min && !unlockedSkins.includes(s.min)) {
      unlockedSkins.push(s.min);
      changed = true;
    }
  }
  if (changed) {
    localStorage.setItem("goldutya-fly-skins", JSON.stringify(unlockedSkins));
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
    if (unlocked) {
      btn.onclick = () => { activeSkin = s.min; updateSkinUI(); };
    }
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
let duck, pipes, clouds, score, best, state, frame, particles, invuln;
let shakeX = 0, shakeY = 0, shakeDur = 0;
let scoreScale = 1, combo = 0, maxCombo = 0, pipeCount = 0;
let nightPhase = 0, nightDir = 0, nightTimer = 0;
let muteOn = false;
let shareShown = false;

best = Number(localStorage.getItem("goldutya-fly-best") || 0);
bestEl.textContent = best;
muteOn = localStorage.getItem("goldutya-fly-mute") === "1";

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
function scoreBlip() { beep(980, 0.09, "square", 0.1); }
function comboBlip(c) { beep(660 + c * 60, 0.1, "sine", 0.12); }
function thud() { beep(110, 0.28, "sine", 0.28); }

/* ---------- share ---------- */
function shareScore() {
  const text = "I scored " + score + " in Goldutya Fly! " + (maxCombo > 1 ? "(" + maxCombo + "x combo!) " : "") + "Can you beat me? 🦆";
  if (navigator.share) {
    navigator.share({ title: "Goldutya Fly", text }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById("shareBtn");
      if (btn) btn.textContent = "COPIED!";
      setTimeout(() => { if (btn) btn.textContent = "SHARE SCORE"; }, 2000);
    }).catch(() => {});
  }
}

/* ---------- mute ---------- */
function toggleMute() {
  muteOn = !muteOn;
  localStorage.setItem("goldutya-fly-mute", muteOn ? "1" : "0");
  const btn = document.getElementById("muteBtn");
  if (btn) btn.textContent = muteOn ? "🔇" : "🔊";
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
    targetRot: 0,
    t: 0,
  };
  pipes = [];
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
  score = 0;
  frame = 0;
  particles = [];
  invuln = 40;
  shakeX = 0;
  shakeY = 0;
  shakeDur = 0;
  scoreScale = 1;
  combo = 0;
  maxCombo = 0;
  pipeCount = 0;
  nightPhase = 0;
  nightDir = 0;
  nightTimer = 0;
  shareShown = false;
  state = states.READY;
}

reset();

/* ---------- duck ---------- */
function drawDuck() {
  const bob = state === states.READY ? Math.sin(duck.t * 0.12) * 6 : 0;
  ctx.save();
  ctx.translate(duck.x, duck.y + bob);
  ctx.rotate(duck.rot);
  const frame = getDuckFrame();
  if (frame.img.complete && frame.img.naturalWidth > 0) {
    ctx.save();
    const skinData = SKINS.find(s => s.min === activeSkin);
    if (skinData && skinData.filter) ctx.filter = skinData.filter;
    ctx.drawImage(frame.img, frame.sx, frame.sy, frame.sw, frame.sh, -duck.w / 2, -duck.h / 2, duck.w, duck.h);
    ctx.restore();
    if (activeSkin === 1) {
      ctx.fillStyle = DARK;
      ctx.fillRect(-duck.w * 0.1, -duck.h * 0.18, duck.w * 0.28, duck.h * 0.12);
    }
    if (activeSkin === 2) {
      ctx.fillStyle = GOLD;
      ctx.beginPath();
      ctx.moveTo(-duck.w * 0.15, -duck.h * 0.42);
      ctx.lineTo(0, -duck.h * 0.62);
      ctx.lineTo(duck.w * 0.15, -duck.h * 0.42);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = RED;
      ctx.beginPath();
      ctx.arc(0, -duck.h * 0.58, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (duckFallback.complete && duckFallback.naturalWidth > 0) {
    ctx.drawImage(duckFallback, -duck.w / 2, -duck.h / 2, duck.w, duck.h);
  } else {
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.ellipse(0, 0, duck.w / 2, duck.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (state === states.PLAY && combo >= 3) {
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

/* ---------- pipes ---------- */
function spawnPipe() {
  const playable = H - GROUND_H;
  const minCenter = PIPE_GAP / 2 + 24;
  const maxCenter = playable - PIPE_GAP / 2 - 24;
  const center = minCenter + Math.random() * Math.max(1, maxCenter - minCenter);
  pipes.push({ x: W + PIPE_W, gapY: center, scored: false, spawnFrame: frame });
}

function drawPipes() {
  for (const p of pipes) {
    const topH = p.gapY - PIPE_GAP / 2;
    const botY = p.gapY + PIPE_GAP / 2;
    const botH = H - GROUND_H - botY;
    const cap = Math.max(18, Math.round(H * 0.028));
    const age = frame - p.spawnFrame;
    if (age < 30) {
      ctx.fillStyle = "rgba(245,197,24," + (0.25 * (1 - age / 30)) + ")";
      ctx.fillRect(p.x - 10, 0, PIPE_W + 20, H);
    }
    const night = nightPhase;
    const r = Math.round(11 + night * 18);
    const g = Math.round(107 + night * 60);
    const b = Math.round(58 + night * 30);
    const grad = ctx.createLinearGradient(p.x, 0, p.x + PIPE_W, 0);
    grad.addColorStop(0, "rgb(" + (r - 5) + "," + (g - 20) + "," + (b - 10) + ")");
    grad.addColorStop(0.45, "rgb(" + r + "," + g + "," + b + ")");
    grad.addColorStop(1, "rgb(" + (r - 5) + "," + (g - 20) + "," + (b - 10) + ")");
    ctx.fillStyle = grad;
    if (topH > 0) ctx.fillRect(p.x, 0, PIPE_W, topH);
    if (botH > 0) ctx.fillRect(p.x, botY, PIPE_W, botH);
    ctx.fillStyle = "rgb(" + (r - 10) + "," + (g - 30) + "," + (b - 15) + ")";
    ctx.fillRect(p.x - 6, topH - cap, PIPE_W + 12, cap);
    ctx.fillRect(p.x - 6, botY, PIPE_W + 12, cap);
    ctx.fillStyle = night > 0.3 ? "rgba(245,197,24,0.7)" : "rgba(245,197,24,0.55)";
    ctx.fillRect(p.x, topH - cap, 5, cap);
    ctx.fillRect(p.x, botY, 5, cap);
  }
}

/* ---------- clouds / ground / sky ---------- */
function drawSky() {
  const dayTop = [26, 58, 102];
  const nightTop = [8, 15, 30];
  const dayBot = [18, 48, 72];
  const nightBot = [4, 8, 18];
  const n = nightPhase;
  const topR = Math.round(dayTop[0] * (1 - n) + nightTop[0] * n);
  const topG = Math.round(dayTop[1] * (1 - n) + nightTop[1] * n);
  const topB = Math.round(dayTop[2] * (1 - n) + nightTop[2] * n);
  const botR = Math.round(dayBot[0] * (1 - n) + nightBot[0] * n);
  const botG = Math.round(dayBot[1] * (1 - n) + nightBot[1] * n);
  const botB = Math.round(dayBot[2] * (1 - n) + nightBot[2] * n);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "rgb(" + topR + "," + topG + "," + topB + ")");
  g.addColorStop(0.55, "rgb(" + Math.round(topR * 0.85) + "," + Math.round(topG * 0.85) + "," + Math.round(topB * 0.9) + ")");
  g.addColorStop(1, "rgb(" + botR + "," + botG + "," + botB + ")");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  if (n < 0.5) {
    const sun = ctx.createRadialGradient(W * 0.82, H * 0.14, 8, W * 0.82, H * 0.14, Math.max(80, W * 0.35));
    sun.addColorStop(0, "rgba(245,197,24," + (0.22 * (1 - n * 2)) + ")");
    sun.addColorStop(1, "rgba(245,197,24,0)");
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, W, H);
  }
  if (n > 0.4) {
    ctx.fillStyle = "rgba(255,255,255," + ((n - 0.4) * 0.6) + ")";
    for (let i = 0; i < 5; i++) {
      const sx = (W * 0.15 + i * W * 0.17) % W;
      const sy = H * (0.06 + i * 0.04);
      ctx.beginPath();
      ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  for (const c of clouds) {
    const layerNight = n * 0.5;
    ctx.fillStyle = "rgba(255,255,255," + (c.alpha * (1 - layerNight)) + ")";
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
  const r = Math.round(14 - n * 8);
  const gv = Math.round(124 - n * 50);
  const b = Math.round(69 - n * 25);
  ctx.fillStyle = "rgb(" + r + "," + gv + "," + b + ")";
  ctx.fillRect(0, gy, W, GROUND_H);
  ctx.fillStyle = "rgb(" + (r - 4) + "," + (gv - 20) + "," + (b - 12) + ")";
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
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.5, life: 28 + Math.random() * 18, color, r: 2 + Math.random() * 3 });
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
  if (state === states.OVER) reset();
  if (state === states.READY || state === states.OVER) {
    state = states.PLAY;
    overlay.classList.add("hidden");
    invuln = 36;
  }
  if (state !== states.PLAY) return;
  duck.vy = FLAP_V;
  duck.targetRot = -0.55;
  combo = 0;
  quack();
  burst(duck.x - duck.w * 0.3, duck.y + duck.h * 0.2, GOLD, 4);
}

function handleKey(e) {
  if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); flap(); }
}
function tap(e) { e.preventDefault(); flap(); }
document.addEventListener("keydown", handleKey);
canvas.addEventListener("pointerdown", tap);
startBtn.addEventListener("click", (e) => { e.stopPropagation(); flap(); });

/* ---------- collision ---------- */
function hitbox() {
  const hw = duck.w * 0.28;
  const hh = duck.h * 0.28;
  return { l: duck.x - hw, r: duck.x + hw, t: duck.y - hh, b: duck.y + hh };
}

function collides() {
  const hb = hitbox();
  if (hb.t < 0) return true;
  if (hb.b > H - GROUND_H) return true;
  for (const p of pipes) {
    const topH = p.gapY - PIPE_GAP / 2;
    const botY = p.gapY + PIPE_GAP / 2;
    const inX = hb.r > p.x && hb.l < p.x + PIPE_W;
    if (inX && (hb.t < topH || hb.b > botY)) return true;
  }
  return false;
}

/* ---------- game over ---------- */
function gameOver() {
  if (state !== states.PLAY) return;
  state = states.OVER;
  thud();
  shakeDur = 24;
  burst(duck.x, duck.y, RED, 18);
  burst(duck.x, duck.y, GOLD, 12);
  unlockCheck(score);
  if (score > best) {
    best = score;
    localStorage.setItem("goldutya-fly-best", String(best));
    bestEl.textContent = best;
  }
  setTimeout(() => {
    if (state !== states.OVER) return;
    overlay.classList.remove("hidden");
    const duckImgEl = overlay.querySelector(".overlay-duck-img");
    if (duckImgEl) duckImgEl.src = "assets/duck-mid.png?" + Date.now();
    const sub = overlay.querySelector(".overlay-sub");
    let msg = score > 0 ? "Score: " + score : "Quack. Try again.";
    if (maxCombo > 1) msg += " | Max combo: " + maxCombo + "x";
    sub.textContent = msg;
    overlay.querySelector(".btn").textContent = "PLAY AGAIN";
    const shareBtn = document.getElementById("shareBtn");
    if (shareBtn) {
      shareBtn.style.display = score > 0 ? "" : "none";
      shareBtn.textContent = "SHARE SCORE";
    }
  }, 850);
}

/* ---------- update ---------- */
function update() {
  frame++;
  duck.t++;

  if (shakeDur > 0) {
    shakeDur--;
    shakeX = (Math.random() - 0.5) * shakeDur * 1.2;
    shakeY = (Math.random() - 0.5) * shakeDur * 1.2;
  } else {
    shakeX = 0;
    shakeY = 0;
  }

  if (scoreScale > 1.01) scoreScale += (1 - scoreScale) * 0.12;

  for (const c of clouds) {
    const spd = (state === states.PLAY ? PIPE_SPEED : PIPE_SPEED * 0.25) * c.speed;
    c.x -= spd;
    if (c.x < -100) { c.x = W + 60 + Math.random() * 120; c.y = H * (0.05 + Math.random() * 0.45); }
  }

  if (state === states.READY) {
    duck.rot = Math.sin(duck.t * 0.12) * 0.08;
    updateParticles();
    return;
  }

  duck.vy += GRAVITY;
  duck.y += duck.vy;
  duck.targetRot = Math.max(-0.55, Math.min(1.15, duck.vy * 0.055));
  duck.rot += (duck.targetRot - duck.rot) * 0.1;

  if (state === states.OVER) {
    if (duck.y > H - GROUND_H - duck.h * 0.25) {
      duck.y = H - GROUND_H - duck.h * 0.25;
      duck.vy = 0;
    }
    updateParticles();
    return;
  }

  if (state === states.PLAY && duck.t % 3 === 0 && duck.vy < 0) {
    particles.push({
      x: duck.x - duck.w * 0.3 + Math.random() * 4,
      y: duck.y + duck.h * 0.2 + Math.random() * 4,
      vx: -1.2 - Math.random() * 1.5,
      vy: 0.5 + Math.random(),
      life: 18 + Math.random() * 10,
      color: GOLD,
      r: 2 + Math.random() * 2,
    });
  }

  if (nightDir !== 0) {
    nightTimer--;
    if (nightTimer <= 0) {
      if (nightDir === 1) { nightPhase = 1; nightDir = -1; nightTimer = 60; }
      else { nightPhase = 0; nightDir = 0; }
    }
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
      pipeCount++;
      combo++;
      if (combo > maxCombo) maxCombo = combo;
      const pts = 1 + Math.floor(combo / 3);
      score += pts - 1;
      scoreScale = 1.4;
      if (combo >= 3) comboBlip(combo);
      else scoreBlip();
      burst(duck.x + 16, duck.y - 18, GOLD2, 7);
      if (pipeCount % 20 === 0 && nightDir === 0) { nightDir = 1; nightTimer = 90; }
      if (pipeCount > 0 && pipeCount % 5 === 0) {
        PIPE_GAP = Math.max(H * 0.16, PIPE_GAP - 4);
        PIPE_SPEED = Math.min(PIPE_SPEED * 1.0 + 0.15, (W * 0.008) * 2.2);
        PIPE_SPACING = Math.max(W * 0.4, PIPE_SPACING - 8);
      }
    }
  }

  updateParticles();

  if (invuln <= 0 && collides()) gameOver();
}

/* ---------- HUD ---------- */
function drawScore() {
  if (state === states.READY) return;
  const size = Math.max(42, Math.round(H * 0.07)) * scoreScale;
  ctx.save();
  ctx.font = "700 " + Math.round(size) + 'px "Bebas Neue", sans-serif';
  ctx.textAlign = "center";
  ctx.lineWidth = Math.max(4, size * 0.1);
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.strokeText(String(score), W / 2, Math.max(72, H * 0.13));
  ctx.fillStyle = GOLD;
  ctx.fillText(String(score), W / 2, Math.max(72, H * 0.13));
  if (combo >= 3) {
    const cs = Math.round(size * 0.48);
    ctx.font = "700 " + cs + 'px "Bebas Neue", sans-serif';
    ctx.fillStyle = GOLD2;
    ctx.fillText("COMBO x" + combo, W / 2, Math.max(72, H * 0.13) + size * 0.65);
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
  drawPipes();
  drawGround();
  drawParticles();
  drawDuck();
  drawScore();
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