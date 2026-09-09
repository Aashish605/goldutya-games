(() => {
  "use strict";

  /* ── CONSTANTS ── */
  const STORAGE_KEY = "goldutya-memory-best";
  const EMOJIS = ["🦆","🪙","👑","⭐","💣","🛡️","❤️","⚡","🌙","🎯","🎪","🎨","🎵","💎","🔮","🦊","🎪","🌟"];
  const DIFFICULTIES = {
    easy:   { cols: 4, rows: 3, pairs: 6 },
    medium: { cols: 4, rows: 4, pairs: 8 },
    hard:   { cols: 6, rows: 6, pairs: 18 }
  };

  /* ── STATE ── */
  let currentDiff = "easy";
  let cards = [];
  let flippedCards = [];
  let matchedPairs = 0;
  let moves = 0;
  let timerInterval = null;
  let elapsed = 0;
  let gameStarted = false;
  let gameLocked = false;
  let muted = false;
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
    const { pairs } = DIFFICULTIES[currentDiff];
    const timeBonus = Math.max(0, 300 - elapsed);
    const score = pairs * 100 - moves * 5 + timeBonus;

    saveBest(currentDiff, score, moves, elapsed);

    overlayTitle.textContent = "YOU WIN!";
    overlaySub.textContent = `${score}pts · ${moves} moves · ${fmtTime(elapsed)}`;
    startBtn.textContent = "PLAY AGAIN";
    shareBtn.style.display = "inline-block";
    overlay.classList.add("visible");
    showBest();
  }

  /* ── TIMER ── */
  function startTimer() {
    elapsed = 0;
    timerEl.textContent = "00:00";
    timerInterval = setInterval(() => {
      elapsed++;
      timerEl.textContent = fmtTime(elapsed);
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
  }

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
    overlay.classList.remove("visible");
    buildGrid();
    showBest();
  }

  /* ── EVENTS ── */
  startBtn.addEventListener("click", resetGame);

  shareBtn.addEventListener("click", () => {
    const { pairs } = DIFFICULTIES[currentDiff];
    const timeBonus = Math.max(0, 300 - elapsed);
    const score = pairs * 100 - moves * 5 + timeBonus;
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
  buildGrid();
  showBest();
  overlay.classList.add("visible");
})();
