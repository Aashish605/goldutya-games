/* Egg Jump — one-tap basket landing. Extracted Gametion sprites, original code. */

"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const startBtn = document.getElementById("startBtn");
const shareBtn = document.getElementById("shareBtn");
const bestEl = document.getElementById("best");
const muteBtn = document.getElementById("muteBtn");
const overlayTitle = document.getElementById("overlayTitle");
const overlaySub = document.getElementById("overlaySub");
const overlayScore = document.getElementById("overlayScore");
const finalScore = document.getElementById("finalScore");
const lbContainer = document.getElementById("leaderboard");

const BEST_KEY = "goldutya-eggjump-best";
const MUTE_KEY = "goldutya-eggjump-muted";
const LIVES_MAX = 3;

let W = 390;
let H = 844;
let DPR = 1;
let IS_MOBILE = false;

/* ---------------- assets ---------------- */

function img(src) {
  const i = new Image();
  i.src = src;
  return i;
}

const IM = {
  bg: img("assets/eggjump/bg.webp"),
  egg: img("assets/eggjump/egg.webp"),
  basket: img("assets/eggjump/basket.webp"),
  menuEgg: img("assets/eggjump/menu-egg.webp"),
  wing: img("assets/eggjump/scorewing.webp"),
  hand: img("assets/eggjump/hand.webp"),
  ring: img("assets/eggjump/ring.webp"),
};

/* ---------------- audio ---------------- */

let muted = localStorage.getItem(MUTE_KEY) === "1";
let audioReady = false;
let audioCtx = null;

const SND = {};
["jump", "land", "fall", "nest", "bg"].forEach((n) => {
  const a = new Audio("assets/eggjump/audio/" + n + ".m4a");
  a.preload = "auto";
  if (n === "bg") {
    a.loop = true;
    a.volume = 0.32;
  }
  SND[n] = a;
});

function initAudio() {
  if (audioReady) return;
  audioReady = true;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    audioCtx = null;
  }
  if (!muted) SND.bg.play().catch(() => {});
}

function play(name) {
  if (muted) return;
  const s = SND[name];
  if (!s) return;
  if (name !== "bg") s.currentTime = 0;
  s.play().catch(() => {});
}

function setMuted(v) {
  muted = v;
  localStorage.setItem(MUTE_KEY, v ? "1" : "0");
  if (muted) {
    SND.bg.pause();
  } else if (state === "play" || state === "menu") {
    SND.bg.play().catch(() => {});
  }
  if (muteBtn) {
    muteBtn.innerHTML =
      '<svg class="icon" viewBox="0 0 24 24"><use href="assets/icons.svg#' +
      (muted ? "volume-off" : "volume-on") +
      '"/></svg>';
  }
}

if (muteBtn)
  muteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    initAudio();
    setMuted(!muted);
  });

function haptic(kind) {
  if (typeof TG !== "undefined" && TG.haptic) TG.haptic(kind);
}

/* ---------------- layout ---------------- */

function fitCanvas() {
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, rect.width);
  const cssH = Math.max(1, rect.height);
  DPR = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssW * DPR);
  canvas.height = Math.round(cssH * DPR);
  W = cssW;
  H = cssH;
  IS_MOBILE =
    (typeof TG !== "undefined" && TG.platform && ["android", "ios"].includes(TG.platform)) ||
    "ontouchstart" in window ||
    (navigator.maxTouchPoints || 0) > 0 ||
    W < 600;
}

window.addEventListener("resize", () => {
  fitCanvas();
  layoutMetrics();
});

/* ---------------- difficulty ---------------- */

function diffMult() {
  const d = typeof Difficulty !== "undefined" ? Difficulty.getDiff("eggjump") : "medium";
  return d === "easy" ? 0.8 : d === "hard" ? 1.25 : 1.0;
}

/* ---------------- world ---------------- */

let state = "menu"; // menu | play | paused | gameover
let paused = false;

let baskets = []; // {idx, x, y, w, h, move:{cx, amp, phase, speed}}
let egg = null; // {x, y, vy, phase:'rest'|'fly', squash}
let camY = 0;
let lives = LIVES_MAX;
let score = 0;
let best = Number(localStorage.getItem(BEST_KEY) || 0);
let lastScoredIdx = 0;
let lastBasket = null;
let topIdx = 0;
let combo = 0;
let maxCombo = 0;
let shakeT = 0;
let lifeFlash = 0;
let hintT = 0;
let floaters = []; // {x, y, text, color, life, vy}
let particles = []; // {x, y, vx, vy, life, color, size, rot, vr}
let rings = [];
let deadT = 0; // respawn timer after life lost

const BASKET_AR = 512 / 264;
const EGG_AR = 256 / 324;

let BW = 150; // basket width
let BH = BW / BASKET_AR;
let EW = 44;
let EH = EW / EGG_AR;
let G = 1;
let V0 = 1;

function layoutMetrics() {
  BW = Math.max(120, Math.min(W * 0.40, 190));
  BH = BW / BASKET_AR;
  EW = Math.max(34, BW * 0.29);
  EH = EW / EGG_AR;
  G = H * 0.00135;
}

function gapFor() {
  return Math.min(H * 0.205 + score * 2.6, H * 0.29);
}

function zoneScale() {
  const d = typeof Difficulty !== "undefined" ? Difficulty.getDiff("eggjump") : "medium";
  return d === "easy" ? 1.5 : d === "hard" ? 0.85 : 1.0;
}

function cleanZone(b) {
  return b.w * 0.16 * zoneScale();
}

function edgeZone(b) {
  return b.w * 0.40 * zoneScale();
}

function restY(b) {
  return b.y + b.h * 0.15;
}

function screenY(wy) {
  return H * 0.75 - wy + camY;
}

function resetWorld() {
  baskets = [];
  floaters = [];
  particles = [];
  rings = [];
  camY = 0;
  lives = LIVES_MAX;
  score = 0;
  lastScoredIdx = 0;
  combo = 0;
  maxCombo = 0;
  shakeT = 0;
  lifeFlash = 0;
  deadT = 0;
  hintT = 0;

  const start = makeBasket(0, W / 2, 0, false, 0);
  baskets.push(start);
  topIdx = 0;
  lastBasket = start;
  egg = { x: W / 2, y: restY(start), vy: 0, phase: "rest", squash: 0 };
  spawnAhead();
}

function makeBasket(idx, x, y, moving, lvl) {
  const b = {
    idx: idx,
    x: x,
    y: y,
    w: BW,
    h: BH,
    move: null,
  };
  if (moving) {
    const margin = b.w * 0.5 + 14;
    const cx = Math.max(margin, Math.min(W - margin, x));
    const amp = Math.min(W * 0.13 + lvl * 2.5, W * 0.22) * (0.75 + Math.random() * 0.4);
    b.move = {
      cx: cx,
      amp: Math.min(amp, cx - margin, W - margin - cx) || 0,
      phase: Math.random() * Math.PI * 2,
      speed: (0.017 + lvl * 0.0009) * (0.85 + Math.random() * 0.3),
    };
    if (b.move.amp < 12) b.move = null;
  }
  return b;
}

function spawnAhead() {
  const limit = camY + H * 1.6;
  while (baskets[baskets.length - 1].y < limit) {
    const prev = baskets[baskets.length - 1];
    const idx = prev.idx + 1;
    const gap = gapFor();
    const y = prev.y + gap;

    const tol = prev.w * 0.3 - EW * 0.5 - 4; // moving-bowl spawn spread
    const lvl = idx;
    let moving = false;
    if (idx >= 2) {
      const p = idx < 7 ? 0.5 : 0.7;
      moving = Math.random() < p;
    }

    let b;
    if (!moving) {
      const off = (Math.random() * 2 - 1) * BW * 0.14; // inside clean zone
      b = makeBasket(idx, clamp(prev.x + off, BW * 0.5 + 14, W - BW * 0.5 - 14), y, false, lvl);
    } else {
      const off = (Math.random() * 2 - 1) * Math.max(0, tol * 1.6);
      b = makeBasket(idx, clamp(prev.x + off, BW * 0.5 + 14, W - BW * 0.5 - 14), y, true, lvl);
    }
    baskets.push(b);
    topIdx = idx;
  }
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

/* ---------------- particles / fx ---------------- */

const CONFETTI_COLORS = ["#ff2d55", "#ff00d4", "#38b6ff", "#22c55e", "#00e5ff", "#8b5cf6", "#ff9500", "#a3e635", "#facc15"];

function spawnSparkles(x, y, n, color) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1.5 + Math.random() * 3;
    particles.push({
      x: x,
      y: y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp + 1,
      life: 30 + Math.random() * 18,
      color: color || "#fff7c2",
      size: 2 + Math.random() * 3.5,
      rot: 0,
      vr: 0,
      grav: 0.08,
    });
  }
}

function spawnConfetti(x, y, n) {
  for (let i = 0; i < n; i++) {
    particles.push({
      x: x + (Math.random() * 2 - 1) * 60,
      y: y,
      vx: (Math.random() * 2 - 1) * 3.2,
      vy: 2 + Math.random() * 4,
      life: 60 + Math.random() * 40,
      color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
      size: 5 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      vr: (Math.random() * 2 - 1) * 0.3,
      grav: 0.14,
    });
  }
}

function addFloater(x, y, text, color) {
  floaters.push({ x: x, y: y, text: text, color: color || "#fff", life: 55, vy: 0.9 });
}

/* ---------------- game flow ---------------- */

function startGame() {
  initAudio();
  resetWorld();
  state = "play";
  paused = false;
  hintT = 1000000; // until first jump
  overlayTitle.textContent = "EGG JUMP";
  overlay.classList.add("hidden");
  if (!muted) SND.bg.play().catch(() => {});
  haptic("light");
}

function jump() {
  if (state !== "play" || paused || !egg || egg.phase !== "rest" || deadT > 0) return;
  // impulse measured against the ACTUAL next bowl geometry (screen-height safe)
  const target = baskets.find((b) => b.y > lastBasket.y + lastBasket.h);
  const top = target ? target.y + target.h / 2 : lastBasket.y + gapFor();
  const dist = top + EH / 2 + H * 0.085 - egg.y;
  V0 = Math.sqrt(2 * G * Math.max(dist, H * 0.12));
  egg.vy = V0;
  egg.phase = "fly";
  egg.tipped = false;
  egg.squash = 0;
  play("jump");
  haptic("light");
  hintT = 0;
}

function loseLife() {
  lives--;
  play("fall");
  haptic("heavy");
  shakeT = 18;
  lifeFlash = 30;
  combo = 0;
  if (lives <= 0) {
    gameOver();
  } else {
    addFloater(W / 2, H * 0.4, "LIFE LOST", "#ff5d7a");
    deadT = 45;
  }
}

function respawn() {
  egg.x = lastBasket.x;
  egg.y = restY(lastBasket) + H * 0.18;
  egg.vy = -2.2;
  egg.phase = "fly"; // drop-in
  egg.dropping = true;
  egg.tipped = false;
  egg.perchB = null;
}

function gameOver() {
  state = "gameover";
  SND.bg.pause();
  if (score > best) {
    best = score;
    localStorage.setItem(BEST_KEY, String(best));
  }
  bestEl.textContent = best;
  try {
    Leaderboard.addScore("eggjump", score, { combo: maxCombo });
  } catch (e) {}
  showGameOver();
}

function showGameOver() {
  overlayTitle.textContent = "GAME OVER";
  overlaySub.textContent =
    score >= best && score > 0 ? "NEW BEST! The nests respect you." : "The egg broke. Shake it off.";
  overlayScore.hidden = false;
  finalScore.textContent = score;
  startBtn.textContent = "PLAY AGAIN";
  shareBtn.style.display = score > 0 ? "" : "none";
  if (lbContainer) {
    try {
      Leaderboard.renderBoard(lbContainer, "eggjump", score);
    } catch (e) {}
  }
  overlay.classList.remove("hidden");
}

function showMenu() {
  state = "menu";
  overlayTitle.textContent = "EGG JUMP";
  overlaySub.textContent =
    "Tap once. Time the jump. Land the egg in the next basket and climb as high as you can.";
  overlayScore.hidden = true;
  startBtn.textContent = "START";
  shareBtn.style.display = "none";
  overlay.classList.remove("hidden");
}

/* ---------------- input ---------------- */

function onPointer(e) {
  if (e.target && e.target.closest && e.target.closest("a, button, .overlay, .topbar")) return;
  initAudio();
  if (state === "play") {
    if (paused) {
      paused = false;
      return;
    }
    jump();
  }
}

canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  onPointer(e);
});
window.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
    if (state === "play") {
      e.preventDefault();
      initAudio();
      if (paused) paused = false;
      else jump();
    }
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && state === "play") paused = true;
});

startBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  startGame();
});

function shareScore() {
  const text = "I scored " + score + " in Egg Jump! Can you land higher?";
  const url = location.href.split("#")[0];
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text + " " + url).then(() => {
      shareBtn.textContent = "COPIED!";
      setTimeout(() => {
        shareBtn.textContent = "SHARE SCORE";
      }, 2000);
    });
  }
}

if (shareBtn) shareBtn.addEventListener("click", (e) => { e.stopPropagation(); shareScore(); });

/* ---------------- update ---------------- */

function update(dt) {
  const f = Math.min(2.5, dt / 16.6667);

  if (state === "play" && !paused) {
    if (shakeT > 0) shakeT -= f;
    if (lifeFlash > 0) lifeFlash -= f;

    // move baskets
    for (const b of baskets) {
      if (b.move) {
        b.move.phase += b.move.speed * f * diffMult();
        b.x = b.move.cx + Math.sin(b.move.phase) * b.move.amp;
      }
    }

    if (deadT > 0) {
      deadT -= f;
      if (deadT <= 0) respawn();
    } else if (egg) {
      if (egg.dropping) {
        egg.vy -= G * f;
        egg.y += egg.vy * f;
        egg.x += (lastBasket.x - egg.x) * 0.2 * f;
        const top = lastBasket.y + lastBasket.h / 2;
        if (egg.vy < 0 && egg.y - EH / 2 <= top) {
          egg.dropping = false;
          land(lastBasket, true);
        }
      } else if (egg.phase === "perch") {
        const b = egg.perchB;
        egg.x = b.x + egg.perchDx;
        egg.y = restY(b);
        egg.squash = 0.25 + Math.abs(Math.sin(egg.perchT * 0.55)) * 0.3;
        egg.perchT -= f;
        if (egg.perchT <= 0) {
          const sign = egg.perchDx >= 0 ? 1 : -1;
          egg.x = b.x + sign * edgeZone(b) * 1.05;
          egg.phase = "fly";
          egg.tipped = true;
          egg.vy = -1;
          play("fall");
          haptic("medium");
          addFloater(egg.x, egg.y + 34, "OFF!", "#ff5d7a");
        }
      } else if (egg.phase === "rest") {
        const b = baskets.find((x) => x.idx === lastBasket.idx) || lastBasket;
        egg.x = b.x;
        egg.y = restY(b);
      } else if (egg.phase === "fly") {
        egg.vy -= G * f;
        egg.y += egg.vy * f;

        // falling (vy < 0, y-up world) → catch: precision zones
        // clean = sticks, edge = perch then tip off, else falls through.
        // bowls at or below lastScoredIdx are never catchable (no free return).
        if (egg.vy < 0 && !egg.dropping && !egg.tipped) {
          const bottom = egg.y - EH / 2;
          for (const b of baskets) {
            if (b.idx <= lastScoredIdx) continue;
            const top = b.y + b.h / 2;
            const deep = top - b.h * 0.95;
            if (bottom <= top + 2 && bottom >= deep) {
              const dx = egg.x - b.x;
              const adx = Math.abs(dx);
              if (adx <= cleanZone(b)) {
                land(b, false);
              } else if (adx <= edgeZone(b)) {
                egg.phase = "perch";
                egg.perchT = 26;
                egg.perchB = b;
                egg.perchDx = dx;
                play("land");
                haptic("light");
              }
              break;
            }
          }
        }

        // fell below the basket it left → life lost
        if (egg.phase === "fly" && !egg.dropping && egg.y < lastBasket.y - H * 0.30) {
          loseLife();
        }
        if (egg.phase === "fly" && !egg.dropping && screenY(egg.y) > H + 120) {
          if (state === "play" && lives > 0) loseLife();
        }
      }
    }

    // camera follows up
    camY = Math.max(camY, egg.y - H * 0.40);

    // cull + spawn
    while (baskets.length > 2 && screenY(baskets[0].y) > H + 260) {
      const removed = baskets.shift();
      if (lastBasket && removed.idx === lastBasket.idx) lastBasket = baskets[0];
    }
    spawnAhead();
  }

  // fx always tick
  for (const p of particles) {
    p.x += p.vx * f;
    p.y += p.vy * f;
    p.vy -= (p.grav || 0) * f;
    p.rot += (p.vr || 0) * f;
    p.life -= f;
  }
  particles = particles.filter((p) => p.life > 0);
  for (const t of floaters) {
    t.y += t.vy * f;
    t.life -= f;
  }
  floaters = floaters.filter((t) => t.life > 0);
  for (const r of rings) {
    r.t += f;
    r.life -= f;
  }
  rings = rings.filter((r) => r.life > 0);
  if (egg && egg.squash > 0) egg.squash = Math.max(0, egg.squash - 0.06 * f);
}

function land(b, isRespawn) {
  const landDx = Math.abs(egg.x - b.x);
  egg.phase = "rest";
  egg.vy = 0;
  egg.x = b.x;
  egg.y = restY(b);
  egg.squash = 0.45;
  egg.tipped = false;
  egg.perchB = null;
  lastBasket = b;
  rings.push({ x: b.x, y: b.y, t: 0, life: 26 });

  if (isRespawn) {
    play("nest");
    return;
  }

  const perfect = landDx < b.w * 0.09;

  if (b.idx > lastScoredIdx) {
    lastScoredIdx = b.idx;
    score++;
    if (score > best) {
      best = score;
      localStorage.setItem(BEST_KEY, String(best));
      bestEl.textContent = best;
    }
    if (perfect) {
      combo++;
      maxCombo = Math.max(maxCombo, combo);
      play("nest");
      spawnSparkles(egg.x, egg.y, 12, "#ffe98a");
      addFloater(egg.x, egg.y + 30, combo > 1 ? "PERFECT x" + combo : "PERFECT!", "#ffe98a");
      haptic("medium");
    } else {
      combo = 0;
      play("land");
      spawnSparkles(egg.x, egg.y, 6, "#ffffff");
      addFloater(egg.x, egg.y + 26, "+1", "#9dff70");
    }
    if (score > 0 && score % 10 === 0) {
      spawnConfetti(egg.x, egg.y + 40, 34);
      addFloater(egg.x, egg.y + 70, score + "!", "#56D9FF");
      haptic("heavy");
    }
  } else {
    play("nest");
  }
}

/* ---------------- render ---------------- */

function drawBg() {
  if (!IM.bg.complete || !IM.bg.naturalWidth) {
    ctx.fillStyle = "#132211";
    ctx.fillRect(0, 0, W, H);
    return;
  }
  // single cover image with limited parallax (no tiling seams)
  const h = H * 1.35;
  const w = h;
  const slack = h - H;
  const off = Math.min(slack, camY * 0.07);
  const x = (W - w) / 2;
  const y = H - h + (slack - off);
  ctx.drawImage(IM.bg, x, y, w, h);
  ctx.fillStyle = "rgba(4,10,4,0.34)";
  ctx.fillRect(0, 0, W, H);
}

function drawBasket(b) {
  if (!IM.basket.complete || !IM.basket.naturalWidth) return;
  const sy = screenY(b.y);
  if (sy < -b.h || sy > H + b.h) return;
  ctx.drawImage(IM.basket, b.x - b.w / 2, sy - b.h / 2, b.w, b.h);
}

function drawEgg() {
  if (!egg || !IM.egg.complete || !IM.egg.naturalWidth) return;
  const sy = screenY(egg.y);
  if (sy < -EH || sy > H + EH * 2) return;

  let ang = 0;
  if (egg.phase === "fly") {
    ang = clamp(egg.vy * 0.018, -0.5, 0.5);
  }
  const sq = egg.squash || 0;
  const sx = 1 + sq * 0.45;
  const sy2 = 1 - sq * 0.45;

  ctx.save();
  ctx.translate(egg.x + (ctx.__shakeX || 0), sy + (ctx.__shakeY || 0));
  ctx.rotate(ang);
  ctx.scale(sx, sy2);
  ctx.drawImage(IM.egg, -EW / 2, -EH / 2, EW, EH);
  ctx.restore();
}

function drawHud() {
  if (!IM.wing.complete || !IM.wing.naturalWidth) return;
  // score wing medallion — below topbar
  const ww = Math.min(W * 0.34, 140);
  const wh = (ww * 112) / 208;
  const wy = 62;
  ctx.drawImage(IM.wing, W / 2 - ww / 2, wy, ww, wh);
  ctx.fillStyle = "#fff";
  ctx.font = "700 " + Math.round(wh * 0.42) + "px 'Bebas Neue', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(score), W / 2, wy + wh * 0.52);

  // lives: mini eggs below topbar, left
  const lw = Math.min(W * 0.07, 28);
  const lh = (lw * 324) / 256;
  for (let i = 0; i < LIVES_MAX; i++) {
    const alive = i < lives;
    ctx.globalAlpha = alive ? 1 : 0.22;
    const pulse = !alive && lifeFlash > 0 ? Math.sin(lifeFlash * 0.8) * 2 : 0;
    ctx.drawImage(IM.egg, 14 + i * (lw + 8), 68 + pulse, lw, lh);
  }
  ctx.globalAlpha = 1;
}

function drawHint() {
  if (hintT <= 0 || state !== "play") return;
  if (!IM.hand.complete) return;
  const bob = Math.sin(performance.now() / 220) * 8;
  const hw = Math.min(W * 0.22, 92);
  const hh = (hw * 312) / 336;
  ctx.globalAlpha = 0.9;
  ctx.drawImage(IM.hand, egg.x - hw * 0.3, screenY(egg.y) - EH - hh * 0.85 + bob, hw, hh);
  ctx.globalAlpha = 1;
}

function drawFx() {
  for (const r of rings) {
    const p = 1 - r.life / 26;
    const rad = 20 + p * 70;
    ctx.globalAlpha = r.life / 26 * 0.8;
    const s = rad * 2;
    ctx.drawImage(IM.ring, r.x - rad, screenY(r.y) - rad, s, s);
  }
  ctx.globalAlpha = 1;

  for (const p of particles) {
    const a = Math.min(1, p.life / 20);
    ctx.globalAlpha = a;
    if (p.vr) {
      ctx.save();
      ctx.translate(p.x, screenY(p.y));
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
      ctx.restore();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, screenY(p.y), p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const t of floaters) {
    ctx.globalAlpha = Math.min(1, t.life / 22);
    ctx.font = "700 22px 'Bebas Neue', sans-serif";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.strokeText(t.text, t.x, screenY(t.y));
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, screenY(t.y));
  }
  ctx.globalAlpha = 1;
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  let shx = 0;
  let shy = 0;
  if (shakeT > 0) {
    shx = (Math.random() * 2 - 1) * shakeT * 0.6;
    shy = (Math.random() * 2 - 1) * shakeT * 0.6;
  }
  ctx.__shakeX = shx;
  ctx.__shakeY = shy;

  ctx.save();
  ctx.translate(shx, shy);

  drawBg();

  for (const b of baskets) drawBasket(b);
  drawEgg();
  drawFx();

  if (state === "play" || state === "paused") drawHud();
  drawHint();

  if (paused) {
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fff";
    ctx.font = "700 42px 'Bebas Neue', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("PAUSED", W / 2, H / 2);
    ctx.font = "400 16px 'Space Mono', monospace";
    ctx.fillText("tap to resume", W / 2, H / 2 + 40);
  }

  ctx.restore();
  ctx.__shakeX = 0;
  ctx.__shakeY = 0;
}

/* ---------------- loop ---------------- */

let lastT = performance.now();

function loop(t) {
  const dt = Math.min(50, t - lastT);
  lastT = t;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

/* ---------------- boot ---------------- */

fitCanvas();
layoutMetrics();
resetWorld();
bestEl.textContent = best;
showMenu();
if (typeof Difficulty !== "undefined" && Difficulty.renderPicker)
  Difficulty.renderPicker(document.getElementById("diffPicker"), "eggjump");
setMuted(muted);
requestAnimationFrame(loop);
