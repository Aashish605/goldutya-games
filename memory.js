(() => {
  "use strict";

  /* ── CONSTANTS ── */
  const STORAGE_KEY = "goldutya-memory-best";
  const EMOJIS = ["🦆","🪙","👑","⭐","💣","🛡️","❤️","⚡","🌙","🎯","🍀","🎨","🎵","💎","🔮","🦊","🎪","🌟"];
  const DIFFICULTIES = {
    easy:   { cols: 4, rows: 3, pairs: 6 },
    medium: { cols: 4, rows: 4, pairs: 8 },
    hard:   { cols: 6, rows: 5, pairs: 15 }
  };

  /* ── STATE ── */
  let currentDiff = "easy";
  let cards = [];
  let flippedCards = [];
  let matchedPairs = 0;
let moves = 0;
let elapsed = 0;
  let gameStarted = false;
  let gameLocked = false;
let muted = localStorage.getItem("goldutya-memory-mute") === "1";
let currentSkin = "default";
  let audioCtx = null;

  /* ── DOM ── */
  const $ = (sel) => document.querySelector(sel);
  const grid = $("#cardGrid");
  const timerEl = $("#timer");
  const movesEl = $("#moves");
  const bestEl = $("#bestScore");
  const overlay = $("#overlay");
  const overlayTitle = $("#overlayTitle");
  const overlaySub = $("#overlaySub");
  const startBtn = $("#startBtn");
  const shareBtn = $("#shareBtn");
  const muteBtn = $("#muteBtn");
  const diffBtns = $("#diffBtns");
  const skinPicker = $("#skinPicker");

  /* ── AUDIO ── */
  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  }

  function playTone(freq, duration, type = "square", vol = 0.15) {
    if (muted || !audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  }

  function sfxFlip()  { playTone(300, 0.05); }
  function sfxMatch() { playTone(880, 0.1, "sine", 0.2); }
  function sfxMismatch() { playTone(200, 0.15, "sawtooth", 0.12); }
  function sfxWin() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      setTimeout(() => playTone(f, 0.2, "sine", 0.18), i * 120);
    });
  }

  /* ── HELPERS ── */
  function fisherYates(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function fmtTime(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0");
  }

  function getDuckSrc() {
    if (currentSkin === "gold") return "assets/duck-mid.png";
    if (currentSkin === "crown") return "assets/duck-mid.png";
    return "assets/duck-mid.png";
  }

  /* ── BEST SCORE ── */
  function loadBest() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  }

  function saveBest(diff, score, mvs, time) {
    const key = `${STORAGE_KEY}-${diff}`;
    try {
      const raw = localStorage.getItem(key);
      const prev = raw ? JSON.parse(raw) : null;
      if (!prev || mvs < prev.moves || (mvs === prev.moves && time < prev.time)) {
        localStorage.setItem(key, JSON.stringify({ score, moves: mvs, time }));
      }
    } catch {}
  }

  function showBest() {
    const data = loadBestFor(currentDiff);
    if (data) {
      bestEl.textContent = `BEST: ${data.score}pts · ${data.moves}mv · ${fmtTime(data.time)}`;
    } else {
      bestEl.textContent = "BEST: --";
    }
  }

  function loadBestFor(diff) {
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY}-${diff}`);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  /* ── LIVE SCORE ── */
  const liveScoreEl = $("#liveScore");
  function calcScore() {
    const { pairs } = DIFFICULTIES[currentDiff];
    const timeBonus = Math.max(0, 300 - elapsed);
    return pairs * 100 - moves * 5 + timeBonus;
  }
  function updateLiveScore() {
    if (!gameStarted || !liveScoreEl) return;
    liveScoreEl.textContent = calcScore();
  }

  /* ── STAR RATING ── */
  function getStars(mvs, diff) {
    const { pairs } = DIFFICULTIES[diff];
    const optimal = pairs;
    if (mvs <= optimal) return 3;
    if (mvs <= optimal * 1.5) return 2;
    return 1;
  }

  function renderStars(n) {
    let s = "";
    for (let i = 0; i < 3; i++) s += i < n ? "★" : "☆";
    return s;
  }

  /* ── CONFETTI ── */
  function spawnConfetti() {
    const colors = ["#F5C518", "#FFDF59", "#56D9FF", "#D42B2B", "#fff"];
    for (let i = 0; i < 30; i++) {
      const el = document.createElement("div");
      el.className = "confetti-piece";
      el.style.left = Math.random() * 100 + "%";
      el.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      el.style.animationDuration = (1.5 + Math.random() * 2) + "s";
      el.style.animationDelay = (Math.random() * 0.6) + "s";
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 4000);
    }
  }

  /* ── GRID ── */
  function buildGrid() {
    const { cols, rows, pairs } = DIFFICULTIES[currentDiff];
    grid.innerHTML = "";
    grid.className = `card-grid grid-${currentDiff}`;
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

    const emojis = fisherYates([...EMOJIS]).slice(0, pairs);
    const deck = fisherYates([...emojis, ...emojis]);
    cards = deck;

    const duckSrc = getDuckSrc();

    deck.forEach((emoji, i) => {
      const card = document.createElement("div");
      card.className = "card";
      card.dataset.index = i;
      card.dataset.face = emoji;
      card.innerHTML = `
        <div class="card-inner">
          <div class="card-front"><span class="card-emoji">${emoji}</span></div>
          <div class="card-back"><img class="duck-icon" src="${duckSrc}" alt="back"></div>
        </div>`;
      card.addEventListener("click", () => flipCard(card));
      grid.appendChild(card);
    });
  }

  /* ── GAME LOGIC ── */
  function flipCard(card) {
    if (gameLocked) return;
    if (card.classList.contains("flipped") || card.classList.contains("matched")) return;
    if (flippedCards.length >= 2) return;

    ensureAudio();
    sfxFlip();

    card.classList.add("flipped");
    flippedCards.push(card);

    if (!gameStarted) {
      gameStarted = true;
      startTimer();
    }

    if (flippedCards.length === 2) {
      moves++;
      movesEl.textContent = moves;
      gameLocked = true;

      const [a, b] = flippedCards;
      if (a.dataset.face === b.dataset.face) {
        handleMatch(a, b);
      } else {
        handleMismatch(a, b);
      }
    }
  }

  function handleMatch(a, b) {
    sfxMatch();
    setTimeout(() => {
      a.classList.add("matched");
      b.classList.add("matched");
      matchedPairs++;
      flippedCards = [];
      gameLocked = false;
      updateLiveScore();

      const { pairs } = DIFFICULTIES[currentDiff];
      if (matchedPairs === pairs) {
        handleWin();
      }
    }, 300);
  }

  function handleMismatch(a, b) {
    sfxMismatch();
    grid.classList.add("shake");
    setTimeout(() => grid.classList.remove("shake"), 300);
    setTimeout(() => {
      a.classList.remove("flipped");
      b.classList.remove("flipped");
      flippedCards = [];
      gameLocked = false;
    }, 800);
  }

  function handleWin() {
    stopTimer();
    sfxWin();
    const score = calcScore();
    const stars = getStars(moves, currentDiff);
    const prev = loadBestFor(currentDiff);
    const isNewBest = !prev || score > prev.score || (score === prev.score && moves < prev.moves);

    saveBest(currentDiff, score, moves, elapsed);

    overlayTitle.textContent = isNewBest ? "NEW BEST!" : "YOU WIN!";
    overlaySub.innerHTML = `<span class="stars">${renderStars(stars)}</span><br>${score}pts · ${moves} moves · ${fmtTime(elapsed)}`;
    startBtn.textContent = "PLAY AGAIN";
    shareBtn.style.display = "inline-block";
    overlay.classList.add("visible");
    showBest();

    spawnConfetti();
    if (isNewBest) {
      playTone(440, 0.3, "sine", 0.2);
      setTimeout(() => playTone(880, 0.3, "sine", 0.2), 150);
    }
  }

  /* ── TIMER ── */
  let timerStartMs = 0;
  let timerPaused = false;
  let timerAccumulated = 0;

  function startTimer() {
    elapsed = 0;
    timerAccumulated = 0;
    timerStartMs = Date.now();
    timerPaused = false;
    timerEl.textContent = "00:00";
  }

  function stopTimer() {
    if (!timerPaused) {
      timerAccumulated += Date.now() - timerStartMs;
    }
    timerPaused = true;
  }

  function tickTimer() {
    if (timerPaused || !gameStarted) return;
    elapsed = Math.floor((timerAccumulated + (Date.now() - timerStartMs)) / 1000);
    timerEl.textContent = fmtTime(elapsed);
    updateLiveScore();
  }

  document.addEventListener("visibilitychange", () => {
    if (!gameStarted) return;
    if (document.hidden && !timerPaused) {
      timerAccumulated += Date.now() - timerStartMs;
      timerPaused = true;
    } else if (!document.hidden && timerPaused && gameStarted) {
      timerStartMs = Date.now();
      timerPaused = false;
    }
  });

  /* ── RESET ── */
  function resetGame() {
    stopTimer();
    elapsed = 0;
    moves = 0;
    matchedPairs = 0;
    flippedCards = [];
    gameStarted = false;
    gameLocked = false;
    timerEl.textContent = "00:00";
    movesEl.textContent = "0";
    if (liveScoreEl) liveScoreEl.textContent = "0";
    overlay.classList.remove("visible");
    buildGrid();
    showBest();
  }

  /* ── EVENTS ── */
  startBtn.addEventListener("click", resetGame);

  shareBtn.addEventListener("click", () => {
    const score = calcScore();
    const txt = `🃏 GOLDUTYA MEMORY\n${currentDiff.toUpperCase()}\n${score}pts · ${moves} moves · ${fmtTime(elapsed)}\nTry to beat me!`;
    if (navigator.share) {
      navigator.share({ title: "GOLDUTYA MEMORY", text: txt }).catch(() => {});
    } else {
      navigator.clipboard.writeText(txt).then(() => {
        shareBtn.textContent = "COPIED!";
        setTimeout(() => shareBtn.textContent = "SHARE SCORE", 1500);
      }).catch(() => {});
    }
  });

  muteBtn.addEventListener("click", () => {
    muted = !muted;
    localStorage.setItem("goldutya-memory-mute", muted ? "1" : "0");
    muteBtn.textContent = muted ? "🔇" : "🔊";
  });

  diffBtns.addEventListener("click", (e) => {
    const btn = e.target.closest(".difficulty-btn");
    if (!btn) return;
    diffBtns.querySelectorAll(".difficulty-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentDiff = btn.dataset.diff;
    resetGame();
  });

  skinPicker.addEventListener("click", (e) => {
    const btn = e.target.closest(".skin-opt");
    if (!btn) return;
    skinPicker.querySelectorAll(".skin-opt").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentSkin = btn.dataset.skin;
    if (gameStarted) resetGame();
  });

  /* ── INIT ── */
  setInterval(tickTimer, 250);
  buildGrid();
  showBest();
  overlay.classList.add("visible");
  muteBtn.textContent = muted ? "🔇" : "🔊";
})();
