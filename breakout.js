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
const GREEN = "#22C55E";

let W = 390, H = 844, DPR = 1;
const GROUND_H = 60;
const LOW_END = ((navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4));
const MAX_PARTICLES = LOW_END ? 100 : 160;

let paddle, balls, bricks, powerUps, particles, popups;
let score, lives, level, best, state, frame;
let shakeX = 0, shakeY = 0, shakeDur = 0;
let nightPhase = 0, nightTimer = 0, nightDir = 0;
let muteOn = false;
let clouds = [];
let keysDown = {};
let paused = false;
let overlayTimeout = 0;
const MILESTONES = [100, 500, 1000, 2000];
let lastMilestone = 0;
let slowTimer = 0;
let fireballTimer = 0;
let magnetTimer = 0;
let magnetRelease = false;
let hintShown = false;
try { hintShown = localStorage.getItem("goldutya-breakout-hinted") === "1"; } catch (e) {}
let hintTimer = 0;

/* --- canvas fit --- */
let canvasRect = null;
function fitCanvas() {
  const r = canvas.getBoundingClientRect();
  W = Math.max(1, r.width);
  H = Math.max(1, r.height);
  DPR = Math.min(LOW_END ? 1.5 : 2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  canvasRect = null;
}
if (typeof ResizeObserver !== "undefined") new ResizeObserver(fitCanvas).observe(canvas);
else window.addEventListener("resize", fitCanvas);

/* --- duck skins --- */
const SKINS = [
  { name: "Gold", min: 0, filter: "" },
  { name: "Pirate", min: 10, filter: "" },
  { name: "Crown", min: 25, filter: "" },
  { name: "Rainbow", min: 50, filter: "hue-rotate(180deg) saturate(1.6)" },
  { name: "Ghost", min: 100, filter: "opacity(0.55) brightness(1.4)" },
];
let unlockedSkins = [0];
try {
  const saved = JSON.parse(localStorage.getItem("goldutya-breakout-skins") || "[0]");
  if (Array.isArray(saved) && saved.length) unlockedSkins = saved;
} catch (e) {}
let activeSkin = unlockedSkins[unlockedSkins.length - 1] || 0;

function unlockCheck(total) {
  let changed = false;
  for (const s of SKINS) {
    if (total >= s.min && !unlockedSkins.includes(s.min)) { unlockedSkins.push(s.min); changed = true; }
  }
  if (changed) {
    try { localStorage.setItem("goldutya-breakout-skins", JSON.stringify(unlockedSkins)); } catch (e) {}
    activeSkin = unlockedSkins[unlockedSkins.length - 1];
updateSkinUI();

  }
}

function updateSkinUI() {
  const picker = document.getElementById("skinPicker");
  if (!picker) return;
  picker.innerHTML = "";
  const icons = ["", "🏴\u200D☠\uFE0F", "👑", "🌈", "👻"];
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
      img.style.width = "32px"; img.style.height = "32px"; img.style.objectFit = "contain";
      btn.textContent = ""; btn.appendChild(img);
    } else {
      btn.textContent = unlocked ? icons[i] : "🔒";
    }
    if (unlocked) btn.onclick = (e) => { e.stopPropagation(); activeSkin = s.min; updateSkinUI(); };
    picker.appendChild(btn);
  }
}

const duckImg = new Image(); duckImg.src = "assets/duck-mid.png";

/* --- audio --- */
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
  o.type = type; o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq || freq * 0.55), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + dur + 0.02);
}
function bounceBlip() { beep(400, 0.08, "sine", 0.12); }
function breakBlip() { beep(600, 0.1, "square", 0.1); }
function powerUpBlip() { beep(880, 0.18, "sine", 0.14, 1400); }
function deathBlip() { beep(110, 0.3, "sine", 0.25, 40); }
function levelBlip() {
  beep(523, 0.1, "sine", 0.12);
  setTimeout(() => { if (state === "play") beep(659, 0.1, "sine", 0.12); }, 80);
  setTimeout(() => { if (state === "play") beep(784, 0.1, "sine", 0.12); }, 160);
  setTimeout(() => { if (state === "play") beep(1047, 0.15, "sine", 0.14); }, 240);
}

/* --- share --- */
function shareScore() {
  const text = "I scored " + score + " in Goldutya Breakout! Level " + level + ". Can you beat me? 🦆";
  if (navigator.share) { navigator.share({ title: "Goldutya Breakout", text }).catch(() => {}); }
  else {
    navigator.clipboard.writeText(text).then(() => {
      if (shareBtn) shareBtn.textContent = "COPIED!";
      setTimeout(() => { if (shareBtn) shareBtn.textContent = "SHARE SCORE"; }, 2000);
    }).catch(() => {});
  }
}
function toggleMute() {
  muteOn = !muteOn;
  try { localStorage.setItem("goldutya-breakout-mute", muteOn ? "1" : "0"); } catch (e) {}
  if (muteBtn) muteBtn.innerHTML = muteOn ? '<svg class="icon" viewBox="0 0 24 24"><use href="assets/icons.svg#volume-off"/></svg>' : '<svg class="icon" viewBox="0 0 24 24"><use href="assets/icons.svg#volume-on"/></svg>';
}

/* --- clouds --- */
function initClouds() {
  clouds = [];
  for (let i = 0; i < 8; i++) {
    const layer = i % 3;
    clouds.push({
      x: Math.random() * W * 1.5,
      y: H * (0.03 + Math.random() * 0.35),
      speed: [0.12, 0.25, 0.4][layer],
      alpha: [0.06, 0.1, 0.16][layer],
      size: [0.6, 1, 1.3][layer],
    });
  }
}

/* --- level config --- */
function levelConfig(lv) {
  const diff = typeof Difficulty !== "undefined" ? Difficulty.getDiff("breakout") : "medium";
  const diffMult = diff === "easy" ? 0.82 : diff === "hard" ? 1.25 : 1.0;
  const capped = Math.min(lv, 5);
  const baseSpeed = (3.5 + capped * 0.5) * diffMult;
  const twoHitRows = capped === 1 ? 0 : Math.min(capped - 1, 4);
  return { baseSpeed, twoHitRows, cols: 8, rows: 5 };
}

/* --- build bricks --- */
function buildBricks(lv) {
  const cfg = levelConfig(lv);
  const pad = 30;
  const gap = 4;
  const brickW = (W - pad * 2 - gap * (cfg.cols - 1)) / cfg.cols;
  const brickH = 24;
  const startY = H * 0.12;
  bricks = [];
  for (let r = 0; r < cfg.rows; r++) {
    for (let c = 0; c < cfg.cols; c++) {
      const hits = r < cfg.twoHitRows ? 2 : 1;
      const t = r / (cfg.rows - 1);
      const cr = Math.round(180 + t * 65);
      const cg = Math.round(140 + t * 57);
      const cb = Math.round(10 + t * 15);
      bricks.push({
        x: pad + c * (brickW + gap),
        y: startY + r * (brickH + gap),
        w: brickW,
        h: brickH,
        hits,
        maxHits: hits,
        color: "rgb(" + cr + "," + cg + "," + cb + ")",
        colorDark: "rgb(" + Math.max(0, cr - 40) + "," + Math.max(0, cg - 40) + "," + Math.max(0, cb - 10) + ")",
      });
    }
  }
  buildBrickSprites();
}

/* --- brick sprites (pre-rendered once per level) --- */
let brickSprites = {};
function buildBrickSprites() {
  brickSprites = {};
  for (const br of bricks) {
    const key = br.color + "|" + br.maxHits;
    if (brickSprites[key]) continue;
    const paint = (g2, cracked) => {
      g2.setTransform(DPR, 0, 0, DPR, 0, 0);
      const g = g2.createLinearGradient(0, 0, 0, br.h);
      g.addColorStop(0, br.color);
      g.addColorStop(1, br.colorDark);
      g2.fillStyle = g;
      g2.beginPath();
      g2.roundRect(0, 0, br.w, br.h, 3);
      g2.fill();
      g2.fillStyle = "rgba(0,0,0,0.15)";
      g2.fillRect(2, br.h - 4, br.w - 4, 3);
      g2.fillStyle = "rgba(255,255,255,0.12)";
      g2.fillRect(3, 2, br.w - 6, 3);
      if (cracked) {
        g2.strokeStyle = "rgba(0,0,0,0.35)";
        g2.lineWidth = 1.5;
        g2.beginPath();
        g2.moveTo(br.w * 0.3, 2);
        g2.lineTo(br.w * 0.5, br.h * 0.55);
        g2.lineTo(br.w * 0.4, br.h - 2);
        g2.stroke();
        g2.beginPath();
        g2.moveTo(br.w * 0.65, 3);
        g2.lineTo(br.w * 0.55, br.h * 0.4);
        g2.stroke();
      }
    };
    const full = document.createElement("canvas");
    full.width = Math.max(2, Math.ceil(br.w * DPR));
    full.height = Math.max(2, Math.ceil(br.h * DPR));
    paint(full.getContext("2d"), false);
    brickSprites[key] = { full, cracked: null };
    if (br.maxHits >= 2) {
      const cracked = document.createElement("canvas");
      cracked.width = full.width;
      cracked.height = full.height;
      paint(cracked.getContext("2d"), true);
      brickSprites[key].cracked = cracked;
    }
  }
}

/* --- reset --- */
function resetGame() {
  fitCanvas();
  const diff = typeof Difficulty !== "undefined" ? Difficulty.getDiff("breakout") : "medium";
  score = 0; lives = diff === "easy" ? 4 : diff === "hard" ? 2 : 3; level = 1; frame = 0;
  clearTimeout(overlayTimeout);
  lastMilestone = 0;
  slowTimer = 0;
  fireballTimer = 0;
  magnetTimer = 0;
  magnetRelease = false;
  initClouds();
  initPaddle();
  initBalls(true);
  buildBricks(level);
  powerUps = []; particles = []; popups = [];
  shakeX = 0; shakeY = 0; shakeDur = 0;
  nightPhase = 0; nightTimer = 0; nightDir = 0;
  state = "ready";
  if (bestEl) bestEl.textContent = best;
}

function initPaddle() {
  const pw = Math.max(80, Math.min(160, W * 0.18));
  paddle = {
    x: W / 2,
    y: H - GROUND_H - 10 - 8,
    w: pw,
    baseW: pw,
    h: 16,
    targetX: W / 2,
    wideTimer: 0,
  };
}

function initBalls(centered) {
  const bx = centered ? paddle.x : paddle.x;
  const by = paddle.y - paddle.h / 2 - 8;
  const cfg = levelConfig(level);
  const speed = cfg.baseSpeed;
  const angle = (Math.random() * 120 + 30) * Math.PI / 180;
  const dir = Math.random() < 0.5 ? -1 : 1;
  balls = [{
    x: bx,
    y: by,
    vx: Math.sin(angle) * speed * dir,
    vy: -Math.cos(angle) * speed,
    r: 8,
    speed,
    attached: false,
  }];
}

/* --- particles --- */
function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    if (particles.length >= MAX_PARTICLES) return;
    const a = Math.random() * Math.PI * 2;
    const s = 1.5 + Math.random() * 4;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 22 + Math.random() * 14, color, r: 1.5 + Math.random() * 2.5 });
  }
}
function updateParticles(f) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * f; p.y += p.vy * f; p.vy += 0.12 * f; p.life -= f;
    if (p.life <= 0) particles.splice(i, 1);
  }
}
function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.min(1, p.life / 18);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* --- popups --- */
function addPopup(x, y, text, color) {
  popups.push({ x, y, text, color, life: 30, maxLife: 30, vy: -1.4 });
}
function updatePopups(f) {
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i]; p.y += p.vy * f; p.life -= f;
    if (p.life <= 0) popups.splice(i, 1);
  }
}
function drawPopups() {
  ctx.save();
  for (const p of popups) {
    ctx.globalAlpha = Math.min(1, p.life / 14);
    ctx.font = '700 18px "Bebas Neue", sans-serif';
    ctx.textAlign = "center";
    ctx.lineWidth = 3; ctx.strokeStyle = "#000";
    ctx.strokeText(p.text, p.x, p.y);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.restore();
}

function drawHint() {
  if (hintShown || hintTimer <= 0) return;
  hintTimer--;
  ctx.save();
  ctx.globalAlpha = Math.min(1, hintTimer / 30);
  ctx.font = '700 ' + Math.round(H * 0.04) + 'px "Bebas Neue", sans-serif';
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.fillText("TAP TO LAUNCH", W / 2, H / 2);
  ctx.restore();
  if (hintTimer <= 0 && !hintShown) {
    hintShown = true;
    try { localStorage.setItem("goldutya-breakout-hinted", "1"); } catch (e) {}
  }
}

/* --- input --- */
function onPointerMove(ex) {
  if (!canvasRect) canvasRect = canvas.getBoundingClientRect();
  paddle.targetX = ((ex - canvasRect.left) / canvasRect.width) * W;
}
canvas.addEventListener("pointermove", (e) => { e.preventDefault(); onPointerMove(e.clientX); });
canvas.addEventListener("pointerdown", (e) => {
  if (e.target.closest("button") || e.target.closest("#overlay")) return;
  initAudio();
  if (paused) { paused = false; return; }
  canvasRect = canvas.getBoundingClientRect();
  onPointerMove(e.clientX);
  if (state === "ready") { state = "play"; overlay.classList.add("hidden"); if (!hintShown) hintTimer = 120; return; }
  if (state === "over") { resetGame(); overlay.classList.add("hidden"); state = "play"; return; }
  if (magnetTimer > 0) {
    for (const b of balls) {
      if (b.attached) {
        b.attached = false;
        magnetRelease = true;
        const spd = b.speed || 4;
        const hitPos = (b.x - paddle.x) / (paddle.w / 2);
        const angle = hitPos * 65 * Math.PI / 180;
        b.vx = Math.sin(angle) * spd;
        b.vy = -Math.cos(angle) * spd;
        const minVy = spd * 0.3;
        if (Math.abs(b.vy) < minVy) b.vy = -minVy;
        burst(b.x, b.y, "#FFDF59", 4);
        break;
      }
    }
  }
});
document.addEventListener("keydown", (e) => {
  keysDown[e.code] = true;
  if (paused && (e.code === "Space" || e.code === "Enter" || e.code.startsWith("Arrow"))) { paused = false; return; }
  if (e.code === "Space" || e.code === "Enter" || e.code === "ArrowUp") { e.preventDefault(); initAudio(); if (state === "ready") { state = "play"; overlay.classList.add("hidden"); if (!hintShown) hintTimer = 120; } if (state === "over") { resetGame(); overlay.classList.add("hidden"); state = "play"; } if (magnetTimer > 0) { for (const b of balls) { if (b.attached) { b.attached = false; magnetRelease = true; const spd = b.speed || 4; const hitPos = (b.x - paddle.x) / (paddle.w / 2); const angle = hitPos * 65 * Math.PI / 180; b.vx = Math.sin(angle) * spd; b.vy = -Math.cos(angle) * spd; const minVy = spd * 0.3; if (Math.abs(b.vy) < minVy) b.vy = -minVy; burst(b.x, b.y, "#FFDF59", 4); break; } } } }
});
document.addEventListener("keyup", (e) => { keysDown[e.code] = false; });

/* --- game logic update --- */
function update(f) {
  if (state !== "play") return;
  frame++;

  // Paddle keyboard
  const paddleSpeed = 8;
  if (keysDown["ArrowLeft"] || keysDown["KeyA"]) paddle.targetX -= paddleSpeed * f;
  if (keysDown["ArrowRight"] || keysDown["KeyD"]) paddle.targetX += paddleSpeed * f;

  // Paddle smooth follow
  const diff = paddle.targetX - paddle.x;
  paddle.x += diff * Math.min(1, 0.3 * f);
  paddle.x = Math.max(paddle.w / 2, Math.min(W - paddle.w / 2, paddle.x));

  if (paddle.wideTimer > 0) {
    paddle.wideTimer -= f;
    if (paddle.wideTimer <= 0) paddle.w = paddle.baseW;
  }

  if (slowTimer > 0) {
    slowTimer -= f;
    if (slowTimer <= 0) {
      for (const b of balls) {
        const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        const targetSpd = levelConfig(level).baseSpeed;
        if (spd < targetSpd) {
          const scale = targetSpd / Math.max(spd, 0.5);
          b.vx *= scale; b.vy *= scale;
        }
      }
    }
  }

  if (fireballTimer > 0) fireballTimer -= f;
  if (magnetTimer > 0) {
    magnetTimer -= f;
    if (magnetTimer <= 0) {
      magnetRelease = false;
      for (const b of balls) {
        if (b.attached) {
          b.attached = false;
          const spd = b.speed || levelConfig(level).baseSpeed;
          const hitPos = Math.max(-1, Math.min(1, (b.x - paddle.x) / (paddle.w / 2)));
          const angle = hitPos * 65 * Math.PI / 180;
          b.vx = Math.sin(angle) * spd;
          b.vy = -Math.cos(angle) * spd;
          const minVy = spd * 0.3;
          if (Math.abs(b.vy) < minVy) b.vy = -minVy;
          burst(b.x, b.y, "#FFDF59", 4);
        }
      }
    }
  }

  // Balls
  for (let bi = balls.length - 1; bi >= 0; bi--) {
    const b = balls[bi];
    if (b.attached) {
      b.x = paddle.x + (b.x - paddle.x || 0);
      b.y = paddle.y - paddle.h / 2 - b.r;
      continue;
    }

    if (fireballTimer > 0 && frame % 2 === 0) {
      if (particles.length < MAX_PARTICLES) particles.push({ x: b.x, y: b.y, vx: (Math.random() - 0.5) * 1.5, vy: Math.random() * 1.5, life: 10 + Math.random() * 6, color: Math.random() > 0.5 ? RED : "#FF6B6B", r: 1.5 + Math.random() * 2 });
    }

    // Sub-stepped movement: split travel into <=4px steps so fast frames can't tunnel
    const travel = Math.hypot(b.vx, b.vy) * f;
    const steps = Math.max(1, Math.ceil(travel / 4));
    const sf = f / steps;
    for (let s = 0; s < steps; s++) {
      b.x += b.vx * sf;
      b.y += b.vy * sf;

      // Wall bounce
      if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx); bounceBlip(); }
      if (b.x + b.r > W) { b.x = W - b.r; b.vx = -Math.abs(b.vx); bounceBlip(); }
      if (b.y - b.r < 0) { b.y = b.r; b.vy = Math.abs(b.vy); bounceBlip(); }

      // Paddle bounce
      if (b.vy > 0 && b.y + b.r >= paddle.y - paddle.h / 2 && b.y - b.r <= paddle.y + paddle.h / 2) {
        const pL = paddle.x - paddle.w / 2, pR = paddle.x + paddle.w / 2;
        if (b.x + b.r > pL && b.x - b.r < pR) {
          const overlapL = (b.x + b.r) - pL;
          const overlapR = pR - (b.x - b.r);
          const overlapT = (b.y + b.r) - (paddle.y - paddle.h / 2);
          if (overlapT <= Math.min(overlapL, overlapR)) {
            // Top hit
            if (magnetTimer > 0 && !magnetRelease) {
              b.attached = true;
              b.vx = 0;
              b.vy = 0;
              b.y = paddle.y - paddle.h / 2 - b.r;
            } else {
              const hitPos = Math.max(-1, Math.min(1, (b.x - paddle.x) / (paddle.w / 2)));
              const angle = hitPos * 65 * Math.PI / 180;
              const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
              b.vx = Math.sin(angle) * spd;
              b.vy = -Math.cos(angle) * spd;
              const minVy = spd * 0.3;
              if (Math.abs(b.vy) < minVy) b.vy = -minVy;
              b.y = paddle.y - paddle.h / 2 - b.r;
            }
          } else {
            // Side/corner hit: reflect horizontal, clamp outside paddle (no teleport to top)
            if (overlapL < overlapR) { b.x = pL - b.r; b.vx = -Math.abs(b.vx); }
            else { b.x = pR + b.r; b.vx = Math.abs(b.vx); }
            if (overlapT < b.r) b.vy = -b.vy;
          }
          bounceBlip();
          burst(b.x, b.y, GOLD, 3);
        }
      }

      // Brick collision
      for (let i = bricks.length - 1; i >= 0; i--) {
        const br = bricks[i];
        if (b.x + b.r > br.x && b.x - b.r < br.x + br.w && b.y + b.r > br.y && b.y - b.r < br.y + br.h) {
          if (fireballTimer <= 0) {
            const overlapL = (b.x + b.r) - br.x;
            const overlapR = (br.x + br.w) - (b.x - b.r);
            const overlapT = (b.y + b.r) - br.y;
            const overlapB = (br.y + br.h) - (b.y - b.r);
            const minOverlap = Math.min(overlapL, overlapR, overlapT, overlapB);
            if (minOverlap === overlapT || minOverlap === overlapB) b.vy = -b.vy;
            else b.vx = -b.vx;
          }

          br.hits--;
          if (br.hits <= 0) {
            score += 10;
            breakBlip();
            burst(br.x + br.w / 2, br.y + br.h / 2, br.color, 10);
            addPopup(br.x + br.w / 2, br.y, "+" + 10, GOLD);
            shakeDur = 4;

            for (let mi = 0; mi < MILESTONES.length; mi++) {
              if (score >= MILESTONES[mi] && lastMilestone <= mi) {
                lastMilestone = mi + 1;
                burst(W / 2, H * 0.3, GOLD2, 20);
                addPopup(W / 2, H * 0.28, MILESTONES[mi] + "!", GOLD2);
                shakeDur = 8;
                break;
              }
            }

            // Power-up drop (35% from 2-hit bricks, 15% from 1-hit bricks)
            const dropRate = br.maxHits >= 2 ? 0.35 : 0.15;
            if (Math.random() < dropRate) {
              spawnPowerUp(br.x + br.w / 2, br.y + br.h);
            }

            bricks.splice(i, 1);
          } else {
            breakBlip();
            burst(br.x + br.w / 2, br.y + br.h / 2, GOLD2, 4);
            shakeDur = 2;
          }
          break;
        }
      }
    }

    // Off screen bottom
    if (b.y - b.r > H) {
      balls.splice(bi, 1);
      continue;
    }
  }

  // No balls left
  if (balls.length === 0) {
    lives--;
    deathBlip();
    TG.haptic("medium");
    shakeDur = 16;
    burst(paddle.x, paddle.y, RED, 14);
    addPopup(paddle.x, paddle.y - 20, lives + (lives === 1 ? " LIFE LEFT" : " LIVES LEFT"), RED);
    if (lives <= 0) {
      state = "over";
      TG.haptic("heavy");
      const isNewBest = score > best;
      if (isNewBest) { best = score; try { localStorage.setItem("goldutya-breakout-best", String(best)); } catch (e) {} if (bestEl) bestEl.textContent = best; }
      unlockCheck(score);
      if (score > 0) { Leaderboard.addScore("breakout", score, { level }); }
      if (isNewBest && score > 0) {
        burst(W / 2, H * 0.35, GOLD, 24);
        addPopup(W / 2, H * 0.33, "NEW BEST!", GOLD);
        deathBlip();
      }
      overlayTimeout = setTimeout(showOverlay, 600);
      return;
    }
    initBalls(true);
  }

  // All bricks cleared
  if (bricks.length === 0) {
    score += 50;
    levelBlip();
    burst(W / 2, H * 0.3, GOLD2, 20);
    addPopup(W / 2, H * 0.28, "LEVEL CLEAR! +50", GOLD2);
    shakeDur = 8;
    level++;
    if (level % 2 === 0) { nightDir = 1; nightTimer = 0; nightPhase = 1; }
    else { nightDir = -1; nightTimer = 0; nightPhase = 0; }
    initPaddle();
    initBalls(true);
    buildBricks(level);
  }

  // Power-ups
  for (let i = powerUps.length - 1; i >= 0; i--) {
    const pu = powerUps[i];
    pu.y += 2.2 * f;
    if (pu.y > H + 20) { powerUps.splice(i, 1); continue; }
    // Collect
    if (pu.y + 10 >= paddle.y - paddle.h / 2 && pu.y - 10 <= paddle.y + paddle.h / 2 &&
        pu.x >= paddle.x - paddle.w / 2 - 10 && pu.x <= paddle.x + paddle.w / 2 + 10) {
      applyPowerUp(pu.type);
      powerUps.splice(i, 1);
    }
  }

  updateParticles(f);
  updatePopups(f);

  // Night cycle
  if (nightDir === 1 && nightTimer > 60) { nightDir = -1; }
  if (nightDir === -1 && nightTimer > 120) { nightPhase = 0; nightDir = 0; nightTimer = 0; }
  if (nightDir !== 0) nightTimer += f;
}

function spawnPowerUp(x, y) {
  const roll = Math.random();
  let type;
  if (roll < 0.25) type = "wide";
  else if (roll < 0.50) type = "fireball";
  else if (roll < 0.65) type = "multi";
  else if (roll < 0.80) type = "magnet";
  else if (roll < 0.95) type = "slow";
  else type = "life";
  const colors = { wide: GREEN, multi: CYAN, slow: CYAN, fireball: RED, magnet: "#FFDF59", life: GOLD };
  powerUps.push({ x, y, type, color: colors[type], r: 10 });
}

function applyPowerUp(type) {
  powerUpBlip();
  if (type === "wide") {
    paddle.w = paddle.baseW * 1.5;
    paddle.wideTimer = 600;
    addPopup(paddle.x, paddle.y - 30, "WIDE PADDLE!", GREEN);
    burst(paddle.x, paddle.y, GREEN, 8);
  } else if (type === "multi") {
    if (balls.length >= 8) {
      addPopup(paddle.x, paddle.y - 30, "MAX BALLS!", CYAN);
      return;
    }
    const newBalls = [];
    for (const b of balls) {
      if (b.attached) continue;
      const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      const baseAngle = Math.atan2(b.vx, -b.vy);
      for (const offset of [-30, 30]) {
        const a = baseAngle + offset * Math.PI / 180;
        newBalls.push({ x: b.x, y: b.y, vx: Math.sin(a) * spd, vy: -Math.cos(a) * spd, r: 8, speed: spd, attached: false });
      }
    }
    balls.push(...newBalls);
    addPopup(paddle.x, paddle.y - 30, "MULTI BALL!", CYAN);
    burst(paddle.x, paddle.y, CYAN, 10);
  } else if (type === "slow") {
    for (const b of balls) {
      if (b.attached) continue;
      b.vx *= 0.6; b.vy *= 0.6;
    }
    slowTimer = 300;
    addPopup(paddle.x, paddle.y - 30, "SLOW BALL!", CYAN);
    burst(paddle.x, paddle.y, CYAN, 6);
  } else if (type === "fireball") {
    fireballTimer = 480;
    addPopup(paddle.x, paddle.y - 30, "FIREBALL!", RED);
    burst(paddle.x, paddle.y, RED, 10);
  } else if (type === "life") {
    if (lives < 5) {
      lives++;
      addPopup(paddle.x, paddle.y - 30, "+1 LIFE!", GOLD);
      burst(paddle.x, paddle.y, GOLD, 12);
    } else {
      score += 50;
      addPopup(paddle.x, paddle.y - 30, "+50 BONUS!", GOLD);
    }
  } else if (type === "magnet") {
    magnetTimer = 720;
    magnetRelease = false;
    addPopup(paddle.x, paddle.y - 30, "MAGNET!", "#FFDF59");
    burst(paddle.x, paddle.y, "#FFDF59", 8);
  }
}

function showOverlay() {
  if (state !== "over") return;
  overlay.classList.remove("hidden");
  const sub = overlay.querySelector(".overlay-sub");
  if (sub) sub.textContent = score > 0 ? "Score: " + score + " · Level " + level + " reached" : "Quack. Try again.";
  const btn = overlay.querySelector(".btn");
  if (btn) btn.textContent = "PLAY AGAIN";
  if (shareBtn) { shareBtn.style.display = score > 0 ? "" : "none"; shareBtn.textContent = "SHARE SCORE"; }
  const lbContainer = document.getElementById("leaderboard");
  if (lbContainer) Leaderboard.renderBoard(lbContainer, "breakout", score);
}

/* --- drawing --- */
let skyGrad = null, skyKey = "";
function drawSky() {
  const n = nightPhase;
  const key = n.toFixed(2) + "|" + H;
  if (!skyGrad || key !== skyKey) {
    const dayTop = [26, 58, 102], nightTop = [8, 15, 30];
    const dayBot = [18, 48, 72], nightBot = [4, 8, 18];
    skyGrad = ctx.createLinearGradient(0, 0, 0, H);
    skyGrad.addColorStop(0, lerpColor(dayTop, nightTop, n));
    skyGrad.addColorStop(1, lerpColor(dayBot, nightBot, n));
    skyKey = key;
  }
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, H);
}
function lerpColor(a, b, t) {
  return "rgb(" + Math.round(a[0] + (b[0] - a[0]) * t) + "," + Math.round(a[1] + (b[1] - a[1]) * t) + "," + Math.round(a[2] + (b[2] - a[2]) * t) + ")";
}

function drawClouds() {
  const n = nightPhase;
  for (const c of clouds) {
    ctx.fillStyle = "rgba(255,255,255," + (c.alpha * (1 - n * 0.5)) + ")";
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, 44 * c.size, 16 * c.size, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x + 24 * c.size, c.y + 3, 30 * c.size, 12 * c.size, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x - 20 * c.size, c.y + 5, 26 * c.size, 10 * c.size, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBricks() {
  for (const br of bricks) {
    const sp = brickSprites[br.color + "|" + br.maxHits];
    if (!sp) continue;
    const img = (br.maxHits >= 2 && br.hits === 1 && sp.cracked) ? sp.cracked : sp.full;
    ctx.drawImage(img, br.x, br.y, br.w, br.h);
  }
}

/* --- ball glow sprite (pre-rendered) --- */
let glowSprites = null;
function buildGlowSprites() {
  const mk = (rgb, alpha, mult) => {
    const r = 8 * mult;
    const c = document.createElement("canvas");
    c.width = c.height = Math.ceil(r * 2);
    const g2 = c.getContext("2d");
    const g = g2.createRadialGradient(c.width / 2, c.height / 2, 0, c.width / 2, c.height / 2, r);
    g.addColorStop(0, "rgba(" + rgb + "," + alpha + ")");
    g.addColorStop(1, "rgba(" + rgb + ",0)");
    g2.fillStyle = g;
    g2.fillRect(0, 0, c.width, c.height);
    return c;
  };
  glowSprites = { normal: mk("245,197,24", "0.25", 4), fire: mk("212,43,43", "0.4", 5) };
}

function drawBall(b) {
  const isFire = fireballTimer > 0 && !b.attached;
  const bodyColor = isFire ? RED : GOLD;
  const bodyColor2 = isFire ? "#FF6B6B" : GOLD2;

  // Glow (pre-rendered sprite)
  if (glowSprites) {
    const glow = isFire ? glowSprites.fire : glowSprites.normal;
    const gr = glow.width / 2;
    ctx.drawImage(glow, b.x - gr, b.y - gr, glow.width, glow.height);
  }

  // Ball body
  ctx.fillStyle = bodyColor;
  ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = bodyColor2;
  ctx.beginPath(); ctx.arc(b.x - b.r * 0.25, b.y - b.r * 0.25, b.r * 0.4, 0, Math.PI * 2); ctx.fill();
}

let paddleGrad = null, paddleGradY = -1;
function drawPaddle() {
  const px = paddle.x - paddle.w / 2;
  const py = paddle.y - paddle.h / 2;
  if (!paddleGrad || py !== paddleGradY) {
    paddleGrad = ctx.createLinearGradient(0, py, 0, py + paddle.h);
    paddleGrad.addColorStop(0, GOLD);
    paddleGrad.addColorStop(1, GOLD2);
    paddleGradY = py;
  }
  ctx.fillStyle = paddleGrad;
  ctx.beginPath();
  ctx.roundRect(px, py, paddle.w, paddle.h, 8);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.beginPath();
  ctx.roundRect(px + 4, py + 2, paddle.w - 8, paddle.h * 0.35, 4);
  ctx.fill();

  if (magnetTimer > 0) {
    ctx.strokeStyle = "#FFDF59";
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.5 + Math.sin(frame * 0.15) * 0.3;
    ctx.beginPath();
    ctx.roundRect(px - 2, py - 2, paddle.w + 4, paddle.h + 4, 10);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawPowerUps() {
  for (const pu of powerUps) {
    ctx.fillStyle = pu.color;
    ctx.beginPath(); ctx.arc(pu.x, pu.y, pu.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = '700 10px "Bebas Neue", sans-serif';
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const labels = { wide: "W", multi: "M", slow: "S", fireball: "F", magnet: "\u2194", life: "\u2764" };
    ctx.fillText(labels[pu.type] || "?", pu.x, pu.y + 1);
  }
}

function drawHUD() {
  ctx.save();
  // Lives
  ctx.font = '20px sans-serif';
  ctx.textAlign = "left";
  for (let i = 0; i < lives; i++) {
    ctx.fillText("❤️", 16 + i * 28, H - GROUND_H - 12);
  }

  // Score
  const ss = 1;
  ctx.font = '700 ' + Math.round(36 * ss) + 'px "Bebas Neue", sans-serif';
  ctx.textAlign = "right";
  ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.strokeText(String(score), W - 16, 50);
  ctx.fillStyle = GOLD;
  ctx.fillText(String(score), W - 16, 50);

  // Level
  ctx.font = '700 14px "Bebas Neue", sans-serif';
  ctx.textAlign = "center";
  ctx.fillStyle = CYAN;
  ctx.fillText("LEVEL " + level, W / 2, H - GROUND_H - 12);

  if (paddle.wideTimer > 0) {
    const wideSec = Math.ceil(paddle.wideTimer / 60);
    ctx.font = '700 12px "Bebas Neue", sans-serif';
    ctx.fillStyle = GREEN;
    ctx.textAlign = "center";
    ctx.fillText("WIDE: " + wideSec + "s", W / 2, H - GROUND_H - 28);
  }

  if (slowTimer > 0) {
    const slowSec = Math.ceil(slowTimer / 60);
    ctx.font = '700 12px "Bebas Neue", sans-serif';
    ctx.fillStyle = CYAN;
    ctx.textAlign = "center";
    let slowY = H - GROUND_H - 28;
    if (paddle.wideTimer > 0) slowY -= 14;
    ctx.fillText("SLOW: " + slowSec + "s", W / 2, slowY);
  }

  if (fireballTimer > 0) {
    const fbSec = Math.ceil(fireballTimer / 60);
    ctx.font = '700 12px "Bebas Neue", sans-serif';
    ctx.fillStyle = RED;
    ctx.textAlign = "center";
    let fbY = H - GROUND_H - 28;
    if (paddle.wideTimer > 0) fbY -= 14;
    if (slowTimer > 0) fbY -= 14;
    ctx.fillText("FIREBALL: " + fbSec + "s", W / 2, fbY);
  }

  if (magnetTimer > 0) {
    const mgSec = Math.ceil(magnetTimer / 60);
    ctx.font = '700 12px "Bebas Neue", sans-serif';
    ctx.fillStyle = "#FFDF59";
    ctx.textAlign = "center";
    let mgY = H - GROUND_H - 28;
    if (paddle.wideTimer > 0) mgY -= 14;
    if (slowTimer > 0) mgY -= 14;
    if (fireballTimer > 0) mgY -= 14;
    ctx.fillText("MAGNET: " + mgSec + "s", W / 2, mgY);
  }

  ctx.restore();
}

function drawGround() {
  ctx.fillStyle = "rgba(245,197,24,0.15)";
  ctx.fillRect(0, H - GROUND_H, W, 2);
}

function render() {
  ctx.save();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.translate(shakeX, shakeY);

  drawSky();
  drawClouds();
  drawGround();
  drawBricks();
  drawPowerUps();
  for (const b of balls) drawBall(b);
  drawPaddle();
  drawParticles();
  drawPopups();
  drawHint();
  drawHUD();

  if (paused) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, W, H);
    ctx.font = '700 ' + Math.round(H * 0.04) + 'px "Bebas Neue", sans-serif';
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.fillText("PAUSED — TAP TO RESUME", W / 2, H / 2);
  }

  ctx.restore();
}

let lastT = 0;
function loop(t) {
  if (!lastT) lastT = t;
  const dtMs = Math.min(50, t - lastT);
  lastT = t;
  const f = Math.min(2.5, dtMs / 16.6667);
  if (!paused) {
    if (shakeDur > 0) {
      shakeDur -= f;
      shakeX = (Math.random() - 0.5) * shakeDur * 1.0;
      shakeY = (Math.random() - 0.5) * shakeDur * 1.0;
    } else { shakeX = 0; shakeY = 0; }

    for (const c of clouds) {
      c.x -= c.speed * f;
      if (c.x < -80) { c.x = W + 60 + Math.random() * 100; c.y = H * (0.03 + Math.random() * 0.35); }
    }

    if (nightDir === 1) { nightPhase = Math.min(1, nightPhase + 0.018 * f); }
    if (nightDir === -1) { nightPhase = Math.max(0, nightPhase - 0.018 * f); }

    update(f);
  }
  render();
  requestAnimationFrame(loop);
}

/* --- init --- */
try { best = Number(localStorage.getItem("goldutya-breakout-best")) || 0; } catch (e) { best = 0; }
try { muteOn = localStorage.getItem("goldutya-breakout-mute") === "1"; } catch (e) { muteOn = false; }
if (muteBtn) { muteBtn.innerHTML = muteOn ? '<svg class="icon" viewBox="0 0 24 24"><use href="assets/icons.svg#volume-off"/></svg>' : '<svg class="icon" viewBox="0 0 24 24"><use href="assets/icons.svg#volume-on"/></svg>'; muteBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleMute(); }); }
if (shareBtn) shareBtn.addEventListener("click", (e) => { e.stopPropagation(); shareScore(); });
if (startBtn) startBtn.addEventListener("click", (e) => { e.stopPropagation(); initAudio(); if (state === "ready") { state = "play"; overlay.classList.add("hidden"); if (!hintShown) hintTimer = 120; } if (state === "over") { resetGame(); overlay.classList.add("hidden"); state = "play"; } });
overlay.addEventListener("pointerdown", (e) => {
  if (e.target.closest("button") || e.target.closest("a") || e.target.closest("#diffPicker")) return;
  initAudio();
  if (state === "ready") { state = "play"; overlay.classList.add("hidden"); if (!hintShown) hintTimer = 120; }
  else if (state === "over") { resetGame(); overlay.classList.add("hidden"); state = "play"; }
});

resetGame();
initClouds();
buildGlowSprites();
requestAnimationFrame(loop);
document.addEventListener("pointerdown", initAudio, { once: true });
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state === "play") {
    paused = true;
    shakeX = 0; shakeY = 0;
  }
});
updateSkinUI();
if (typeof Difficulty !== "undefined") {
  Difficulty.renderPicker(document.getElementById("diffPicker"), "breakout", () => resetGame());
}
