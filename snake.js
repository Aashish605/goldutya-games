(() => {
"use strict";

const GOLD = "#F5C518", GOLD2 = "#FFDF59", RED = "#D42B2B", CYAN = "#56D9FF", DARK = "#0B0B0D";
const STORAGE_KEY = "goldutya-snake-best";
const DUCK_SRC = { up: { img: "assets/duck-up.png", sx: 120, sy: 114, sw: 471, sh: 443 }, mid: { img: "assets/duck-mid.png", sx: 75, sy: 117, sw: 561, sh: 438 }, down: { img: "assets/duck-down.png", sx: 20, sy: 20, sw: 671, sh: 632 } };
const SKIN_TINTS = { default: null, neon: CYAN, retro: RED };

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlaySub = document.getElementById("overlaySub");
const overlayDuck = document.getElementById("overlayDuck");
const startBtn = document.getElementById("startBtn");
const shareBtn = document.getElementById("shareBtn");
const bestScoreEl = document.getElementById("bestScore");
const muteBtn = document.getElementById("muteBtn");
const skinPicker = document.getElementById("skinPicker");
const hint = document.getElementById("hint");

let W, H, dpr;
let cellSize, cols, rows, offsetX, offsetY;
let snake, dir, nextDir, food, powerFood, score, bestScore, frameCount;
let interval, speedBoost, speedBoostFrames, foodEaten, state;
let muted = localStorage.getItem("goldutya-snake-mute") === "1", skin = "default";
let shakeX = 0, shakeY = 0, shakeFrames = 0;
let nightMode = false, nightCounter = 0;
let clouds = [];
let audioCtx = null;
let paused = false;
let deathParticles = [];
const MILESTONES = [100, 250, 500, 1000];
let lastMilestone = 0;

const duckImgs = {};
let duckImgsLoaded = 0;

function initDuckImages() {
  for (const key in DUCK_SRC) {
    const s = DUCK_SRC[key];
    const img = new Image();
    img.onload = () => { duckImgsLoaded++; };
    img.src = s.img;
    duckImgs[key] = img;
  }
}

function resize() {
  dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  W = Math.round(rect.width * dpr);
  H = Math.round(rect.height * dpr);
  canvas.width = W;
  canvas.height = H;
  cellSize = Math.max(16, Math.floor(Math.min(W, H) / 22));
  cols = Math.floor(W / cellSize);
  rows = Math.floor(H / cellSize);
  offsetX = Math.floor((W - cols * cellSize) / 2);
  offsetY = Math.floor((H - rows * cellSize) / 2);
}

function initClouds() {
  clouds = [];
  for (let i = 0; i < 6; i++) {
    clouds.push({
      x: Math.random() * W,
      y: Math.random() * H * 0.5,
      r: 30 + Math.random() * 50,
      speed: 0.15 + Math.random() * 0.3,
      alpha: 0.02 + Math.random() * 0.04
    });
  }
}

function updateClouds() {
  for (const c of clouds) {
    c.x += c.speed;
    if (c.x - c.r > W) c.x = -c.r;
  }
}

function drawClouds() {
  for (const c of clouds) {
    ctx.fillStyle = `rgba(255,255,255,${c.alpha})`;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function initAudio() {
  if (audioCtx) return;
  try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
  catch (e) { /* silent */ }
}

function playTone(freq, dur, type, vol, ramp) {
  if (muted || !audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || "square";
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    if (ramp) osc.frequency.linearRampToValueAtTime(ramp, audioCtx.currentTime + dur);
    gain.gain.setValueAtTime(vol || 0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + dur);
  } catch (e) { /* silent */ }
}

function sfxEat() { playTone(880, 0.08, "square", 0.12); }
function sfxPower() { playTone(600, 0.3, "sine", 0.18, 1200); }
function sfxDeath() { playTone(120, 0.4, "sawtooth", 0.2); }

function loadBest() {
  try { bestScore = parseInt(localStorage.getItem(STORAGE_KEY)) || 0; }
  catch (e) { bestScore = 0; }
  bestScoreEl.textContent = "BEST: " + bestScore;
}

function saveBest() {
  if (score > bestScore) {
    bestScore = score;
    try { localStorage.setItem(STORAGE_KEY, bestScore); } catch (e) { /* */ }
    bestScoreEl.textContent = "BEST: " + bestScore;
  }
}

function randomGridPos() {
  let x, y, onSnake;
  do {
    x = Math.floor(Math.random() * cols);
    y = Math.floor(Math.random() * rows);
    onSnake = snake.some(s => s.x === x && s.y === y);
  } while (onSnake);
  return { x, y };
}

function placeFood() {
  food = randomGridPos();
  powerFood = null;
  if (Math.random() < 0.2) {
    let pf;
    do {
      pf = randomGridPos();
    } while (pf.x === food.x && pf.y === food.y);
    powerFood = pf;
  }
}

function initGame() {
  resize();
  const cx = Math.floor(cols / 2);
  const cy = Math.floor(rows / 2);
  snake = [
    { x: cx, y: cy },
    { x: cx - 1, y: cy },
    { x: cx - 2, y: cy }
  ];
  dir = { x: 1, y: 0 };
  nextDir = { x: 1, y: 0 };
  score = 0;
  frameCount = 0;
  interval = 8;
  speedBoost = false;
  speedBoostFrames = 0;
  foodEaten = 0;
  nightMode = false;
  nightCounter = 0;
  shakeFrames = 0;
  state = "READY";
  placeFood();
}

function resetAfterDeath() {
  const cx = Math.floor(cols / 2);
  const cy = Math.floor(rows / 2);
  snake = [
    { x: cx, y: cy },
    { x: cx - 1, y: cy },
    { x: cx - 2, y: cy }
  ];
  dir = { x: 1, y: 0 };
  nextDir = { x: 1, y: 0 };
  score = 0;
  frameCount = 0;
  interval = 8;
  speedBoost = false;
  speedBoostFrames = 0;
  foodEaten = 0;
  nightMode = false;
  nightCounter = 0;
  shakeFrames = 0;
  deathParticles = [];
  lastMilestone = 0;
  placeFood();
}

function setDir(nx, ny) {
  if (dir.x === -nx && dir.y === -ny) return;
  if (nx !== 0 || ny !== 0) nextDir = { x: nx, y: ny };
}

function update() {
  if (state !== "PLAY") return;
  frameCount++;

  if (speedBoost) {
    speedBoostFrames--;
    if (speedBoostFrames <= 0) speedBoost = false;
  }

  const currentInterval = speedBoost ? 2 : interval;
  if (frameCount % currentInterval !== 0) return;

  dir = { ...nextDir };
  const head = snake[0];
  const nx = head.x + dir.x;
  const ny = head.y + dir.y;

  if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) {
    gameOver();
    return;
  }
  for (let i = 0; i < snake.length; i++) {
    if (snake[i].x === nx && snake[i].y === ny) {
      gameOver();
      return;
    }
  }

  snake.unshift({ x: nx, y: ny });

  let ate = false;
  if (food && nx === food.x && ny === food.y) {
    score += 10;
    foodEaten++;
    ate = true;
    sfxEat();
    nightCounter++;
    if (nightCounter >= 15) {
      nightMode = !nightMode;
      nightCounter = 0;
    }
    if (foodEaten % 5 === 0 && interval > 3) {
      interval--;
    }
    for (let mi = 0; mi < MILESTONES.length; mi++) {
      if (score >= MILESTONES[mi] && lastMilestone <= mi) {
        lastMilestone = mi + 1;
        shakeFrames = 6;
        break;
      }
    }
    placeFood();
  } else if (powerFood && nx === powerFood.x && ny === powerFood.y) {
    score += 50;
    ate = true;
    sfxPower();
    speedBoost = true;
    speedBoostFrames = 180;
    snake.push({ ...snake[snake.length - 1] });
    snake.push({ ...snake[snake.length - 1] });
    placeFood();
  }

  if (!ate) snake.pop();

  updateClouds();

  for (let i = deathParticles.length - 1; i >= 0; i--) {
    const p = deathParticles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.life--;
    if (p.life <= 0) deathParticles.splice(i, 1);
  }
}

function gameOver() {
  state = "OVER";
  const isNewBest = score > bestScore && score > 0;
  saveBest();
  sfxDeath();
  shakeFrames = 18;
  deathParticles = [];
  const hx = offsetX + snake[0].x * cellSize + cellSize / 2;
  const hy = offsetY + snake[0].y * cellSize + cellSize / 2;
  for (let i = 0; i < 20; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 1.5 + Math.random() * 5;
    deathParticles.push({ x: hx, y: hy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 30 + Math.random() * 20, color: i % 2 === 0 ? GOLD : RED, r: 2 + Math.random() * 3 });
  }
  overlayTitle.textContent = isNewBest ? "NEW BEST!" : "GAME OVER";
  overlaySub.textContent = "Score: " + score + " — " + (isNewBest ? "Amazing!" : "Best: " + bestScore);
  shareBtn.style.display = "inline-block";
  startBtn.textContent = "RETRY";
  hint.textContent = "Tap to try again!";
  overlay.classList.remove("hidden");
  if (isNewBest) {
    sfxPower();
  }
}

function drawRoundedRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawStar(cx, cy, outerR, innerR, pts) {
  ctx.beginPath();
  for (let i = 0; i < pts * 2; i++) {
    const a = (i * Math.PI) / pts - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function draw() {
  ctx.save();

  if (shakeFrames > 0) {
    const intensity = shakeFrames * 0.8;
    shakeX = (Math.random() - 0.5) * intensity;
    shakeY = (Math.random() - 0.5) * intensity;
    ctx.translate(shakeX, shakeY);
    shakeFrames--;
  }

  ctx.fillStyle = nightMode ? "#05050a" : DARK;
  ctx.fillRect(0, 0, W, H);

  drawClouds();

  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  for (let c = 0; c <= cols; c++) {
    ctx.beginPath();
    ctx.moveTo(offsetX + c * cellSize, offsetY);
    ctx.lineTo(offsetX + c * cellSize, offsetY + rows * cellSize);
    ctx.stroke();
  }
  for (let r = 0; r <= rows; r++) {
    ctx.beginPath();
    ctx.moveTo(offsetX, offsetY + r * cellSize);
    ctx.lineTo(offsetX + cols * cellSize, offsetY + r * cellSize);
    ctx.stroke();
  }

  const nightMod = nightMode ? 0.55 : 1;
  const pad = Math.max(1, cellSize * 0.08);
  const radius = Math.max(2, cellSize * 0.22);

  for (let i = snake.length - 1; i >= 1; i--) {
    const s = snake[i];
    const px = offsetX + s.x * cellSize + pad;
    const py = offsetY + s.y * cellSize + pad;
    const pw = cellSize - pad * 2;
    const ph = cellSize - pad * 2;
    const t = i / snake.length;
    const g = ctx.createLinearGradient(px, py, px + pw, py + ph);
    g.addColorStop(0, GOLD);
    g.addColorStop(1, GOLD2);
    ctx.globalAlpha = (1 - t * 0.5) * nightMod;
    ctx.fillStyle = g;
    drawRoundedRect(px, py, pw, ph, radius);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  if (snake.length > 0) {
    const h = snake[0];
    const hp = offsetX + h.x * cellSize;
    const hpp = offsetY + h.y * cellSize;
    const duckKey = dir.y < 0 ? "up" : dir.y > 0 ? "down" : "mid";
    const src = DUCK_SRC[duckKey];
    const img = duckImgs[duckKey];
    const tint = SKIN_TINTS[skin];

    ctx.globalAlpha = nightMod;
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, src.sx, src.sy, src.sw, src.sh, hp, hpp, cellSize, cellSize);
      if (tint) {
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = tint;
        ctx.globalAlpha = 0.25 * nightMod;
        ctx.fillRect(hp, hpp, cellSize, cellSize);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = nightMod;
      }
    } else {
      ctx.fillStyle = GOLD;
      drawRoundedRect(hp + pad, hpp + pad, cellSize - pad * 2, cellSize - pad * 2, radius);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  if (food) {
    const fx = offsetX + food.x * cellSize + cellSize / 2;
    const fy = offsetY + food.y * cellSize + cellSize / 2;
    const fr = cellSize * 0.35;
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.arc(fx, fy, fr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = `bold ${Math.max(8, cellSize * 0.3)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("\u2726", fx, fy - 1);
  }

  if (powerFood) {
    const px = offsetX + powerFood.x * cellSize + cellSize / 2;
    const py = offsetY + powerFood.y * cellSize + cellSize / 2;
    const pr = cellSize * 0.4;
    const pulse = 1 + Math.sin(frameCount * 0.1) * 0.15;
    ctx.fillStyle = CYAN;
    drawStar(px, py, pr * pulse, pr * 0.45, 5);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    drawStar(px, py, pr * pulse * 0.5, pr * 0.2, 5);
    ctx.fill();
  }

  if (state === "PLAY") {
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.max(14, cellSize * 0.8)}px var(--font-body, monospace)`;
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.globalAlpha = 0.85;
    ctx.fillText(String(score), W - 16, 60);
    ctx.globalAlpha = 1;
  }

  if (speedBoost && state === "PLAY") {
    ctx.fillStyle = CYAN;
    ctx.globalAlpha = 0.12 + Math.sin(frameCount * 0.15) * 0.08;
    ctx.fillRect(offsetX, offsetY, cols * cellSize, rows * cellSize);
    ctx.globalAlpha = 1;
    const boostSec = Math.ceil(speedBoostFrames / 60);
    ctx.font = `bold ${Math.max(12, cellSize * 0.6)}px var(--font-body, monospace)`;
    ctx.textAlign = "center";
    ctx.fillStyle = CYAN;
    ctx.globalAlpha = 0.8;
    ctx.fillText("SPEED: " + boostSec + "s", offsetX + cols * cellSize / 2, offsetY + 20);
    ctx.globalAlpha = 1;
  }

  for (const p of deathParticles) {
    ctx.globalAlpha = Math.min(1, p.life / 20);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  if (lastMilestone > 0 && state === "PLAY") {
    const ms = MILESTONES[lastMilestone - 1];
    const flash = 0.3 + Math.sin(frameCount * 0.2) * 0.2;
    ctx.font = `bold ${Math.max(10, cellSize * 0.5)}px var(--font-body, monospace)`;
    ctx.textAlign = "left";
    ctx.fillStyle = GOLD;
    ctx.globalAlpha = flash;
    ctx.fillText("★ " + ms, offsetX + 8, offsetY + 20);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function loop() {
  if (!paused) {
    update();
    draw();
  }
  requestAnimationFrame(loop);
}

function startGame() {
  initAudio();
  resetAfterDeath();
  overlay.classList.add("hidden");
  state = "PLAY";
}

function shareGame() {
  const text = `Goldutya Snake: ${score} pts! Can you beat me?`;
  if (navigator.share) {
    navigator.share({ title: "Goldutya Snake", text }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      shareBtn.textContent = "COPIED!";
      setTimeout(() => { shareBtn.textContent = "SHARE"; }, 1500);
    });
  }
}

function handleSwipe(sx, sy, ex, ey) {
  const dx = ex - sx;
  const dy = ey - sy;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if (Math.max(absDx, absDy) < 20) return;
  if (absDx > absDy) setDir(dx > 0 ? 1 : -1, 0);
  else setDir(0, dy > 0 ? 1 : -1);
}

function handleTapQuadrant(cx, cy) {
  const rx = cx / W;
  const ry = cy / H;
  if (rx < 0.33) setDir(-1, 0);
  else if (rx > 0.67) setDir(1, 0);
  else if (ry < 0.5) setDir(0, -1);
  else setDir(0, 1);
}

let touchStartX, touchStartY;

canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  if (state === "READY") { startGame(); return; }
  const t = e.touches[0];
  touchStartX = t.clientX;
  touchStartY = t.clientY;
}, { passive: false });

canvas.addEventListener("touchend", (e) => {
  e.preventDefault();
  if (state !== "PLAY") return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStartX;
  const dy = t.clientY - touchStartY;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 15) {
    handleTapQuadrant(t.clientX * dpr, t.clientY * dpr);
  } else {
    handleSwipe(touchStartX * dpr, touchStartY * dpr, t.clientX * dpr, t.clientY * dpr);
  }
}, { passive: false });

document.addEventListener("keydown", (e) => {
  if (state === "READY") { startGame(); return; }
  if (state !== "PLAY") return;
  switch (e.key) {
    case "ArrowUp": case "w": case "W": setDir(0, -1); e.preventDefault(); break;
    case "ArrowDown": case "s": case "S": setDir(0, 1); e.preventDefault(); break;
    case "ArrowLeft": case "a": case "A": setDir(-1, 0); e.preventDefault(); break;
    case "ArrowRight": case "d": case "D": setDir(1, 0); e.preventDefault(); break;
  }
});

canvas.addEventListener("click", (e) => {
  if (state === "READY") { startGame(); return; }
  if (state !== "PLAY") return;
  handleTapQuadrant(e.offsetX * dpr, e.offsetY * dpr);
});

startBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  startGame();
});

shareBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  shareGame();
});

muteBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  muted = !muted;
  localStorage.setItem("goldutya-snake-mute", muted ? "1" : "0");
  muteBtn.classList.toggle("muted", muted);
  muteBtn.innerHTML = muted ? "&#128263;" : "&#128266;";
});

skinPicker.addEventListener("click", (e) => {
  e.stopPropagation();
  const swatch = e.target.closest(".skin-swatch");
  if (!swatch) return;
  skin = swatch.dataset.skin;
  skinPicker.querySelectorAll(".skin-swatch").forEach(s => s.classList.remove("active"));
  swatch.classList.add("active");
});

window.addEventListener("resize", () => {
  resize();
  if (state === "PLAY") {
    const head = snake[0];
    if (head.x >= cols) head.x = cols - 1;
    if (head.y >= rows) head.y = rows - 1;
  }
});

initDuckImages();
loadBest();
resize();
initClouds();
initGame();
overlay.classList.remove("hidden");
requestAnimationFrame(loop);
document.addEventListener("visibilitychange", () => {
  paused = document.hidden && state === "PLAY";
});
muteBtn.innerHTML = muted ? "&#128263;" : "&#128266;";
})();
