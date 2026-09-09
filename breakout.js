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

let paddle, balls, bricks, powerUps, particles, popups;
let score, lives, level, best, state, frame;
let shakeX = 0, shakeY = 0, shakeDur = 0;
let nightPhase = 0, nightTimer = 0, nightDir = 0;
let muteOn = false;
let clouds = [];
let keysDown = {};
let levelClearBonus = 0;

/* --- canvas fit --- */
function fitCanvas() {
  const r = canvas.getBoundingClientRect();
  W = Math.max(1, r.width);
  H = Math.max(1, r.height);
  DPR = window.devicePixelRatio || 1;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
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
let unlockedSkins = JSON.parse(localStorage.getItem("goldutya-breakout-skins") || "[0]");
let activeSkin = unlockedSkins[unlockedSkins.length - 1] || 0;

function unlockCheck(total) {
  let changed = false;
  for (const s of SKINS) {
    if (total >= s.min && !unlockedSkins.includes(s.min)) { unlockedSkins.push(s.min); changed = true; }
  }
  if (changed) {
    localStorage.setItem("goldutya-breakout-skins", JSON.stringify(unlockedSkins));
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
  setTimeout(() => beep(659, 0.1, "sine", 0.12), 80);
  setTimeout(() => beep(784, 0.1, "sine", 0.12), 160);
  setTimeout(() => beep(1047, 0.15, "sine", 0.14), 240);
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
  localStorage.setItem("goldutya-breakout-mute", muteOn ? "1" : "0");
  if (muteBtn) muteBtn.textContent = muteOn ? "🔇" : "🔊";
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
  const capped = Math.min(lv, 5);
  const baseSpeed = 3.5 + capped * 0.5;
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
}

/* --- reset --- */
function resetGame() {
  fitCanvas();
  score = 0; lives = 3; level = 1; frame = 0;
  levelClearBonus = 0;
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
  balls = [{
    x: bx,
    y: by,
    vx: Math.sin(angle) * speed,
    vy: -Math.cos(angle) * speed,
    r: 8,
    speed,
  }];
}

/* --- particles --- */
function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 1.5 + Math.random() * 4;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 22 + Math.random() * 14, color, r: 1.5 + Math.random() * 2.5 });
  }
}
function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life--;
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
function updatePopups() {
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i]; p.y += p.vy; p.life--;
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

/* --- input --- */
function onPointerMove(ex) {
  const rect = canvas.getBoundingClientRect();
  paddle.targetX = ((ex - rect.left) / rect.width) * W;
}
canvas.addEventListener("pointermove", (e) => { e.preventDefault(); onPointerMove(e.clientX); });
canvas.addEventListener("touchmove", (e) => { e.preventDefault(); if (e.touches.length) onPointerMove(e.touches[0].clientX); }, { passive: false });
canvas.addEventListener("pointerdown", (e) => {
  if (e.target.closest("button") || e.target.closest("#overlay")) return;
  initAudio();
  onPointerMove(e.clientX);
  if (state === "ready") { state = "play"; overlay.classList.add("hidden"); return; }
  if (state === "over") { resetGame(); overlay.classList.add("hidden"); state = "play"; return; }
});
document.addEventListener("keydown", (e) => { keysDown[e.code] = true; if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); initAudio(); if (state === "ready") { state = "play"; overlay.classList.add("hidden"); } if (state === "over") { resetGame(); overlay.classList.add("hidden"); state = "play"; } } });
document.addEventListener("keyup", (e) => { keysDown[e.code] = false; });

/* --- game logic update --- */
function update() {
  if (state !== "play") return;
  frame++;

  // Paddle keyboard
  const paddleSpeed = 8;
  if (keysDown["ArrowLeft"] || keysDown["KeyA"]) paddle.targetX -= paddleSpeed;
  if (keysDown["ArrowRight"] || keysDown["KeyD"]) paddle.targetX += paddleSpeed;

  // Paddle smooth follow
  const diff = paddle.targetX - paddle.x;
  paddle.x += diff * 0.3;
  paddle.x = Math.max(paddle.w / 2, Math.min(W - paddle.w / 2, paddle.x));

  if (paddle.wideTimer > 0) {
    paddle.wideTimer--;
    if (paddle.wideTimer <= 0) paddle.w = paddle.baseW;
  }

  // Balls
  for (let bi = balls.length - 1; bi >= 0; bi--) {
    const b = balls[bi];
    b.x += b.vx; b.y += b.vy;

    // Wall bounce
    if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx); bounceBlip(); }
    if (b.x + b.r > W) { b.x = W - b.r; b.vx = -Math.abs(b.vx); bounceBlip(); }
    if (b.y - b.r < 0) { b.y = b.r; b.vy = Math.abs(b.vy); bounceBlip(); }

    // Paddle bounce
    if (b.vy > 0 && b.y + b.r >= paddle.y - paddle.h / 2 && b.y - b.r <= paddle.y + paddle.h / 2) {
      if (b.x >= paddle.x - paddle.w / 2 - b.r && b.x <= paddle.x + paddle.w / 2 + b.r) {
        const hitPos = (b.x - paddle.x) / (paddle.w / 2);
        const angle = hitPos * 65 * Math.PI / 180;
        const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        b.vx = Math.sin(angle) * spd;
        b.vy = -Math.cos(angle) * spd;
        b.y = paddle.y - paddle.h / 2 - b.r;
        bounceBlip();
        burst(b.x, b.y, GOLD, 3);
      }
    }

    // Off screen bottom
    if (b.y - b.r > H) {
      balls.splice(bi, 1);
      continue;
    }

    // Brick collision
    for (let i = bricks.length - 1; i >= 0; i--) {
      const br = bricks[i];
      if (b.x + b.r > br.x && b.x - b.r < br.x + br.w && b.y + b.r > br.y && b.y - b.r < br.y + br.h) {
        // Determine bounce direction
        const overlapL = (b.x + b.r) - br.x;
        const overlapR = (br.x + br.w) - (b.x - b.r);
        const overlapT = (b.y + b.r) - br.y;
        const overlapB = (br.y + br.h) - (b.y - b.r);
        const minOverlap = Math.min(overlapL, overlapR, overlapT, overlapB);
        if (minOverlap === overlapT || minOverlap === overlapB) b.vy = -b.vy;
        else b.vx = -b.vx;

        br.hits--;
        if (br.hits <= 0) {
          score += 10;
          breakBlip();
          burst(br.x + br.w / 2, br.y + br.h / 2, br.color, 10);
          addPopup(br.x + br.w / 2, br.y, "+" + 10, GOLD);
          shakeDur = 4;

          // Power-up drop from 2-hit bricks
          if (br.maxHits >= 2 && Math.random() < 0.30) {
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

  // No balls left
  if (balls.length === 0) {
    lives--;
    deathBlip();
    shakeDur = 16;
    burst(paddle.x, paddle.y, RED, 14);
    addPopup(paddle.x, paddle.y - 20, lives + " LIVES LEFT", RED);
    if (lives <= 0) {
      state = "over";
      if (score > best) { best = score; localStorage.setItem("goldutya-breakout-best", String(best)); if (bestEl) bestEl.textContent = best; }
      unlockCheck(score);
      setTimeout(showOverlay, 600);
      return;
    }
    initBalls(true);
  }

  // All bricks cleared
  if (bricks.length === 0) {
    levelClearBonus += 50;
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
    pu.y += 2.2;
    if (pu.y > H + 20) { powerUps.splice(i, 1); continue; }
    // Collect
    if (pu.y + 10 >= paddle.y - paddle.h / 2 && pu.y - 10 <= paddle.y + paddle.h / 2 &&
        pu.x >= paddle.x - paddle.w / 2 - 10 && pu.x <= paddle.x + paddle.w / 2 + 10) {
      applyPowerUp(pu.type);
      powerUps.splice(i, 1);
    }
  }

  updateParticles();
  updatePopups();

  // Night cycle
  if (nightDir === 1 && nightTimer > 60) { nightDir = -1; }
  if (nightDir === -1 && nightTimer > 120) { nightPhase = 0; nightDir = 0; nightTimer = 0; }
  if (nightDir !== 0) nightTimer++;
}

function spawnPowerUp(x, y) {
  const types = ["wide", "multi", "slow"];
  const type = types[Math.floor(Math.random() * types.length)];
  const colors = { wide: GREEN, multi: CYAN, slow: CYAN };
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
    const newBalls = [];
    for (const b of balls) {
      const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      const baseAngle = Math.atan2(b.vx, -b.vy);
      for (const offset of [-30, 30]) {
        const a = baseAngle + offset * Math.PI / 180;
        newBalls.push({ x: b.x, y: b.y, vx: Math.sin(a) * spd, vy: -Math.cos(a) * spd, r: 8, speed: spd });
      }
    }
    balls.push(...newBalls);
    addPopup(paddle.x, paddle.y - 30, "MULTI BALL!", CYAN);
    burst(paddle.x, paddle.y, CYAN, 10);
  } else if (type === "slow") {
    for (const b of balls) {
      b.vx *= 0.6; b.vy *= 0.6;
    }
    addPopup(paddle.x, paddle.y - 30, "SLOW BALL!", CYAN);
    burst(paddle.x, paddle.y, CYAN, 6);
    setTimeout(() => {
      for (const b of balls) {
        const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        const targetSpd = levelConfig(level).baseSpeed;
        if (spd < targetSpd) {
          const scale = targetSpd / Math.max(spd, 0.5);
          b.vx *= scale; b.vy *= scale;
        }
      }
    }, 5000);
  }
}

function showOverlay() {
  overlay.classList.remove("hidden");
  const sub = overlay.querySelector(".overlay-sub");
  if (sub) sub.textContent = score > 0 ? "Score: " + score + " · Level " + level + " reached" : "Quack. Try again.";
  const btn = overlay.querySelector(".btn");
  if (btn) btn.textContent = "PLAY AGAIN";
  if (shareBtn) { shareBtn.style.display = score > 0 ? "" : "none"; shareBtn.textContent = "SHARE SCORE"; }
}

/* --- drawing --- */
function drawSky() {
  const n = nightPhase;
  const dayTop = [26, 58, 102], nightTop = [8, 15, 30];
  const dayBot = [18, 48, 72], nightBot = [4, 8, 18];
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, lerpColor(dayTop, nightTop, n));
  g.addColorStop(1, lerpColor(dayBot, nightBot, n));
  ctx.fillStyle = g;
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
    const g = ctx.createLinearGradient(br.x, br.y, br.x, br.y + br.h);
    g.addColorStop(0, br.color);
    g.addColorStop(1, br.colorDark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(br.x, br.y, br.w, br.h, 3);
    ctx.fill();

    // Inner shadow
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.fillRect(br.x + 2, br.y + br.h - 4, br.w - 4, 3);

    // Crack lines for 2-hit bricks
    if (br.maxHits >= 2 && br.hits === 1) {
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(br.x + br.w * 0.3, br.y + 2);
      ctx.lineTo(br.x + br.w * 0.5, br.y + br.h * 0.55);
      ctx.lineTo(br.x + br.w * 0.4, br.y + br.h - 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(br.x + br.w * 0.65, br.y + 3);
      ctx.lineTo(br.x + br.w * 0.55, br.y + br.h * 0.4);
      ctx.stroke();
    }

    // Top highlight
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(br.x + 3, br.y + 2, br.w - 6, 3);
  }
}

function drawBall(b) {
  // Glow
  const glow = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 4);
  glow.addColorStop(0, "rgba(245,197,24,0.25)");
  glow.addColorStop(1, "rgba(245,197,24,0)");
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 4, 0, Math.PI * 2); ctx.fill();

  // Ball body
  ctx.fillStyle = GOLD;
  ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = GOLD2;
  ctx.beginPath(); ctx.arc(b.x - b.r * 0.25, b.y - b.r * 0.25, b.r * 0.4, 0, Math.PI * 2); ctx.fill();
}

function drawPaddle() {
  const px = paddle.x - paddle.w / 2;
  const py = paddle.y - paddle.h / 2;
  const g = ctx.createLinearGradient(px, py, px, py + paddle.h);
  g.addColorStop(0, GOLD);
  g.addColorStop(1, GOLD2);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(px, py, paddle.w, paddle.h, 8);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.beginPath();
  ctx.roundRect(px + 4, py + 2, paddle.w - 8, paddle.h * 0.35, 4);
  ctx.fill();
}

function drawPowerUps() {
  for (const pu of powerUps) {
    ctx.fillStyle = pu.color;
    ctx.beginPath(); ctx.arc(pu.x, pu.y, pu.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = '700 10px "Bebas Neue", sans-serif';
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const label = pu.type === "wide" ? "W" : pu.type === "multi" ? "M" : "S";
    ctx.fillText(label, pu.x, pu.y + 1);
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
  drawHUD();

  ctx.restore();
}

function loop() {
  // Shake
  if (shakeDur > 0) {
    shakeDur--;
    shakeX = (Math.random() - 0.5) * shakeDur * 1.0;
    shakeY = (Math.random() - 0.5) * shakeDur * 1.0;
  } else { shakeX = 0; shakeY = 0; }

  // Cloud drift
  for (const c of clouds) {
    c.x -= c.speed;
    if (c.x < -80) { c.x = W + 60 + Math.random() * 100; c.y = H * (0.03 + Math.random() * 0.35); }
  }

  // Night
  if (nightDir === 1) { nightPhase = Math.min(1, nightPhase + 0.008); }
  if (nightDir === -1) { nightPhase = Math.max(0, nightPhase - 0.008); }

  update();
  render();
  requestAnimationFrame(loop);
}

/* --- init --- */
best = Number(localStorage.getItem("goldutya-breakout-best") || 0);
muteOn = localStorage.getItem("goldutya-breakout-mute") === "1";
if (muteBtn) { muteBtn.textContent = muteOn ? "🔇" : "🔊"; muteBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleMute(); }); }
if (shareBtn) shareBtn.addEventListener("click", (e) => { e.stopPropagation(); shareScore(); });
if (startBtn) startBtn.addEventListener("click", (e) => { e.stopPropagation(); initAudio(); if (state === "ready") { state = "play"; overlay.classList.add("hidden"); } if (state === "over") { resetGame(); overlay.classList.add("hidden"); state = "play"; } });

resetGame();
initClouds();
requestAnimationFrame(loop);
document.addEventListener("pointerdown", initAudio, { once: true });
updateSkinUI();
