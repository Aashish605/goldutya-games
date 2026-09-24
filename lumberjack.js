/* Goldutya LumberJack — Timberjack-style chop game.
   Sprites are the original tbot LumberJack SVGs (assets/lumberjack/*.svg). */
(function () {
  'use strict';

  // ------------------------------------------------------------------
  // Dimension + timing constants (from original)
  // ------------------------------------------------------------------
  var W = 750, H = 572;
  var QA = 8500,      // countdown cap
      GA = 250,       // ms added per chop
      START_MS = 4250; // initial countdown
  var WARN_FRAC = 0.25;
  var LEVEL_EVERY = 20;
  var LEVEL_FACTOR = 0.95;
  var TRUNK_W = 50, TRUNK_H = 375;
  var BRANCH_W = 125, BRANCH_H = 80;

  // Layout (mirrors original at 750x572)
  var GROUND_Y = H - 95;          // 477
  var GROUND_BG_X = 139;
  var GROUND_RIGHT_W = 195;
  var STUMP_X = W / 2 - 25;       // 350
  var STUMP_Y = H - 105;          // 467
  var PLAYER_FEET_Y = H - 55;     // 517
  var PLAYER_DX = 35;

  // ------------------------------------------------------------------
  // DOM refs
  // ------------------------------------------------------------------
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var overlay = document.getElementById('overlay');
  var overlayTitle = document.getElementById('overlayTitle');
  var overlaySub = document.getElementById('overlaySub');
  var startBtn = document.getElementById('startBtn');
  var shareBtn = document.getElementById('shareBtn');
  var leaderboardEl = document.getElementById('leaderboard');
  var diffPicker = document.getElementById('diffPicker');
  var btnLeft = document.getElementById('btnLeft');
  var btnRight = document.getElementById('btnRight');

  var BEST_KEY = 'lumberjack.best';

  // ------------------------------------------------------------------
  // Asset registry — SVG files, drawn at half (2x retina source)
  // ------------------------------------------------------------------
  var ASSETS = {
    bg_trees:   { src: 'assets/lumberjack/bg_trees.svg',   w: 420,  h: 140 },
    bg_bottom:  { src: 'assets/lumberjack/bg_bottom.svg',  w: 210,  h: 90  },
    bg_clouds:  { src: 'assets/lumberjack/bg_clouds.svg',  w: 475,  h: 128 },
    ground_bg:  { src: 'assets/lumberjack/ground_bg.svg',  w: 3,    h: 95  },
    ground_left:{ src: 'assets/lumberjack/ground_left.svg',w: 140,  h: 95  },
    ground_right:{src: 'assets/lumberjack/ground_right.svg',w: 195, h: 95  },
    trunk:      { src: 'assets/lumberjack/trunk.svg',      w: TRUNK_W, h: TRUNK_H },
    log:        { src: 'assets/lumberjack/log.svg',        w: 50,  h: 50  },
    branch:     { src: 'assets/lumberjack/branch.svg',     w: BRANCH_W, h: BRANCH_H },
    stumb:      { src: 'assets/lumberjack/stumb.svg',      w: 50,  h: 60  },
    lumber_body:{ src: 'assets/lumberjack/lumber_body.svg',w: 50,  h: 107 },
    lumber_died:{ src: 'assets/lumberjack/lumber_died.svg',w: 73,  h: 85  },
    hand_up:    { src: 'assets/lumberjack/hand_up.svg',    w: 47,  h: 52  },
    hand_down:  { src: 'assets/lumberjack/hand_down.svg',  w: 59,  h: 9   },
    timeline:   { src: 'assets/lumberjack/timeline.svg',   w: 100, h: 21  },
    timeline_bar:{src: 'assets/lumberjack/timeline_bar.svg',w: 88, h: 9   },
    timeline_warn:{src:'assets/lumberjack/timeline_warn.svg',w: 88, h: 9   }
  };

  var imgs = {};
  var loaded = 0;
  var totalAssets = Object.keys(ASSETS).length;

  function loadAll(cb) {
    var keys = Object.keys(ASSETS);
    keys.forEach(function (k) {
      var img = new Image();
      img.onload = function () {
        imgs[k] = img;
        loaded++;
        if (loaded >= totalAssets) cb();
      };
      img.onerror = function () {
        loaded++;
        if (loaded >= totalAssets) cb();
      };
      img.src = ASSETS[k].src;
    });
  }

  function spr(k, g, x, y, flip) {
    var a = ASSETS[k];
    if (!imgs[k]) return;
    if (flip) {
      g.save();
      g.translate(x + a.w, y);
      g.scale(-1, 1);
      g.drawImage(imgs[k], 0, 0, a.w, a.h);
      g.restore();
    } else {
      g.drawImage(imgs[k], 0, 0, a.w, a.h, x, y, a.w, a.h);
    }
  }

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------
  var S = {
    queue: [0, 0],
    pa: 100,
    drop: 0,
    side: -1,
    started: false,
    inGame: false,
    cdStarted: false,
    deadline: 0,
    frame: 0,
    score: 0,
    level: 1,
    qa: QA,
    ga: GA,
    levelHold: 0,
    over: false,
    // input lock used by difficulty gate
    ready: false
  };

  var branches = [];   // branch stack (side, y)
  var fallers = [];    // active falling pieces
  var deathT = 0;
  var levelHoldTotal = 0;
  var levelBannerShownAt = 0;
  var warnBlink = 0;
  var cloudX = 0;
  var lastFrame = 0;

  // ------------------------------------------------------------------
  // Audio (WebAudio synth)
  // ------------------------------------------------------------------
  var aCtx = null;
  function audio() {
    if (!aCtx) {
      try { aCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    }
    return aCtx;
  }
  function blip(freq, dur, type, vol, slideTo) {
    var ac = audio();
    if (!ac) return;
    try {
      var o = ac.createOscillator();
      var gn = ac.createGain();
      var t = ac.currentTime;
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      gn.gain.setValueAtTime(vol || 0.2, t);
      gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(gn); gn.connect(ac.destination);
      o.start(t); o.stop(t + dur);
    } catch (e) {}
  }
  function noiseBurst(freq, dur, vol) {
    var ac = audio();
    if (!ac) return;
    try {
      var len = Math.floor(ac.sampleRate * dur);
      var buf = ac.createBuffer(1, len, ac.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var src = ac.createBufferSource();
      src.buffer = buf;
      var f = ac.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
      var gn = ac.createGain();
      gn.gain.value = vol || 0.18;
      src.connect(f); f.connect(gn); gn.connect(ac.destination);
      src.start();
    } catch (e) {}
  }
  function sfxChop() { noiseBurst(2100, 0.08, 0.22); blip(150, 0.1, 'sine', 0.25, 65); }
  function sfxBranch() { blip(320, 0.12, 'triangle', 0.2, 90); }
  function sfxDeath() { blip(260, 0.4, 'sawtooth', 0.2, 40); noiseBurst(700, 0.3, 0.15); }
  function sfxThud() { blip(90, 0.12, 'sine', 0.3, 50); }

  // ------------------------------------------------------------------
  // Leaderboard (localStorage top 5)
  // ------------------------------------------------------------------
  function loadBest() {
    try { return JSON.parse(localStorage.getItem(BEST_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveBest(b) {
    try { localStorage.setItem(BEST_KEY, JSON.stringify(b)); } catch (e) {}
  }
  function submitScore() {
    var best = loadBest();
    best.push({ name: 'You', score: S.score });
    best.sort(function (a, b) { return b.score - a.score; });
    best = best.slice(0, 5);
    saveBest(best);
    renderLeaderboard(best);
  }
  function renderLeaderboard(best) {
    if (!best) best = loadBest();
    if (!best.length) {
      leaderboardEl.innerHTML = '';
      return;
    }
    var html = '<div class="lb-title">LEADERBOARD</div><ul class="lb-list">';
    for (var i = 0; i < best.length; i++) {
      html += '<li class="lb-row' + (best[i].name === 'You' ? ' you' : '') + '">' +
        '<span class="lb-place">' + (i + 1) + '</span>' +
        '<span class="lb-name">' + esc(best[i].name) + '</span>' +
        '<span class="lb-score">' + best[i].score + '</span></li>';
    }
    html += '</ul>';
    leaderboardEl.innerHTML = html;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ------------------------------------------------------------------
  // Countdown / timing
  // ------------------------------------------------------------------
  function startCountdown() {
    S.cdStarted = true;
    S.deadline = performance.now() + START_MS;
  }
  function onChopCountdown() {
    if (!S.cdStarted) {
      startCountdown();
      return;
    }
    S.deadline = Math.min(S.deadline + S.ga, performance.now() + S.qa);
  }

  function updateCountdown() {
    if (!S.inGame || !S.cdStarted || S.over) return;
    if (performance.now() >= S.deadline) {
      doDeath(S.side < 0);
    }
  }

  // ------------------------------------------------------------------
  // Queue + branches (original logic, tree seeded before first chop)
  // ------------------------------------------------------------------
  function pushPair() {
    var s = Math.random() < 0.5 ? -1 : 1;
    S.queue.push(s, 2 * s);
    S.pa += 100;
    var lastY = branches.length ? branches[branches.length - 1].y : (STUMP_Y + 80);
    branches.push({ side: s, y: lastY - 100, grow: true });
  }

  function seedTree() {
    S.queue = [0, 0];
    S.pa = 100;
    branches = [];
    // visible branch stack above the stump
    var y = STUMP_Y + 80;
    for (var i = 0; i < 6; i++) {
      var s = Math.random() < 0.5 ? -1 : 1;
      y -= 100;
      branches.push({ side: s, y: y, grow: true });
      if (i % 2 === 1) {
        S.queue.push(s, 2 * s);
        S.pa += 100;
      }
    }
  }

  // ------------------------------------------------------------------
  // Chopping / death
  // ------------------------------------------------------------------
  function chop(left) {
    if (!S.inGame || S.over || !S.ready) return;

    // flip to chopping side
    S.side = left ? -1 : 1;

    var d = S.queue.shift();

    // add next pair at odd queue length (original: 0-based pairs)
    if (S.queue.length % 2 === 1) pushPair();

    // determine chop side: a piece sits on the side of the next chop
    var hitSide = left ? 1 : -1; // chopping on the same side as an obstacle kills

    // d<0 -> obstacle on left, d>0 -> obstacle on right, 0 -> free
    if (d !== 0) {
      var obsLeft = d < 0;
      if (obsLeft === left) { // chopped INTO the obstacle
        spawnFalling(d);
        sfxBranch();
        doDeath(left, d);
        return;
      }
    }

    // free chop
    S.score++;
    handAnimAt = S.frame;
    onChopCountdown();
    sfxChop();
    sfxThud();

    // level-up every LEVEL_EVERY chops
    if (S.score % LEVEL_EVERY === 0) {
      S.level++;
      S.qa *= LEVEL_FACTOR;
      S.ga *= LEVEL_FACTOR;
      S.levelHold = levelHoldTotal = 2000;
      animLevelBanner();
    }

    // obstacle on the other side is cut off (visual)
    if (branches.length && d !== 0) {
      spawnFalling(d);
    }
    if (branches.length) branches.shift();
    S.drop += 50;
  }

  function spawnFalling(d, isDeath) {
    var piece = Math.abs(d) === 2 ? 'branch' : 'log';
    var dir = d < 0 ? -1 : 1;
    fallers.push({
      kind: piece,
      x: W / 2 + dir * 45,
      y: STUMP_Y - 60 - (isDeath ? 10 : 0),
      vx: dir * 130,
      rot: 0,
      vr: dir < 0 ? 0.12 : -0.12,
      alpha: 1,
      t: 0,
      T: 24,
      side: dir
    });
  }

  function doDeath(left, d) {
    if (S.over) return;
    S.over = true;
    S.inGame = false;
    sfxDeath();
    S.drop += 20;
    deathT = 26; // death animation frames ~ 430ms
  }

  function finishDeath() {
    S.cdStarted = false;
    S.started = false;
    submitScore();
    overlayDuck.src = 'assets/duck-mid.png';
    overlayTitle.textContent = 'GAME OVER';
    overlaySub.innerHTML = 'You scored <b>' + S.score + '</b> chops!';
    startBtn.textContent = 'PLAY AGAIN';
    shareBtn.style.display = '';
    showOverlay();
  }

  // ------------------------------------------------------------------
  // Level banner ("Level N" pop-in)
  // ------------------------------------------------------------------
  var levelBanner = null;
  function animLevelBanner() {
    levelBanner = { a: 0, t: 0, T: 10 };
  }

  // ------------------------------------------------------------------
  // Overlay
  // ------------------------------------------------------------------
  var overlayDuck = document.querySelector('.overlay-duck-img');
  function showOverlay() {
    overlay.classList.remove('hidden');
    btnLeft.style.visibility = 'hidden';
    btnRight.style.visibility = 'hidden';
    S.inGame = false;
  }
  function hideOverlay() {
    overlay.classList.add('hidden');
    btnLeft.style.visibility = 'visible';
    btnRight.style.visibility = 'visible';
  }

  function startGame() {
    if (!S.ready) return;
    S.score = 0;
    S.level = 1;
    S.qa = QA;
    S.ga = GA;
    S.drop = 0;
    S.side = -1;
    S.started = true;
    S.inGame = true;
    S.cdStarted = false;
    S.deadline = 0;
    S.over = false;
    S.levelHold = 0;
    deathT = 0;
    fallers.length = 0;
    seedTree();
    hideOverlay();
  }

  function shareScore() {
    var txt = 'I scored ' + S.score + ' in LumberJack on Goldutya!';
    if (navigator.share) {
      navigator.share({ text: txt }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(txt).catch(function () {});
    }
  }

  // ------------------------------------------------------------------
  // Input
  // ------------------------------------------------------------------
  function bindBtn(el, left) {
    el.addEventListener('click', function (e) {
      if (!S.inGame || S.over) { maybeStart(e); return; }
      chop(left);
    });
    el.addEventListener('touchstart', function (e) {
      if (S.inGame && !S.over) e.preventDefault();
    }, { passive: false });
  }
  bindBtn(btnLeft, true);
  bindBtn(btnRight, false);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') {
      if (!S.inGame || S.over) { maybeStart(e); return; }
      chop(true); e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      if (!S.inGame || S.over) { maybeStart(e); return; }
      chop(false); e.preventDefault();
    } else if (e.key === ' ' || e.key === 'Enter') {
      if (!S.inGame || S.over) {
        e.preventDefault();
        startGame();
      }
    }
  });

  function maybeStart(e) {
    if (overlay.classList.contains('hidden')) return;
    if (startBtn.textContent === 'PLAY AGAIN') { e.preventDefault(); startGame(); return; }
    e.preventDefault();
  }

  startBtn.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    startGame();
  });
  shareBtn.addEventListener('click', shareScore);

  // ------------------------------------------------------------------
  // Main loop
  // ------------------------------------------------------------------
  function tick(now) {
    if (!lastFrame) lastFrame = now;
    var dt = now - lastFrame;
    lastFrame = now;

    S.frame++;
    updateCountdown();

    // death sequence
    if (deathT > 0) {
      deathT--;
      if (deathT === 0) finishDeath();
    }

    // level banner countdown
    if (S.levelHold > 0) S.levelHold -= dt;
    if (levelBanner) {
      levelBanner.t++;
      if (levelBanner.t >= levelBanner.T) {
        levelBanner.a = 1;
        levelBanner = null;
      } else {
        levelBanner.a = levelBanner.t / levelBanner.T;
      }
    }

    // clouds drift
    cloudX = (cloudX + dt * 0.02 * (S.inGame && !S.over ? 1.6 : 0.7)) % W;

    // falling pieces physics (frame-based, 24 frames)
    for (var i = fallers.length - 1; i >= 0; i--) {
      var fl = fallers[i];
      fl.t++;
      if (fl.t >= fl.T) { fallers.splice(i, 1); continue; }
      var k = fl.t / fl.T;
      // slide outward + slight fall, then rotate + fade out
      fl.x += fl.vx * (1 / 60);
      fl.y += (k < 0.5 ? -0.4 : 0.6) * 3;
      fl.rot += fl.vr;
      if (k > 0.5) fl.alpha = 1 - (k - 0.5) * 2;
    }

    render();
    requestAnimationFrame(tick);
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  function render() {
    var g = ctx;

    // sky
    g.fillStyle = '#C7F0F9';
    g.fillRect(0, 0, W, H);

    // clouds (top layer)
    var clw = ASSETS.bg_clouds.w;
    var startX = -clw + (cloudX % clw);
    for (var cx = startX; cx < W; cx += clw) {
      spr('bg_clouds', g, cx, 15);
    }

    // background trees (full width, half-scale tile)
    var btw = ASSETS.bg_trees.w;
    var bx = -btw + (cloudX * 0.35 % btw);
    for (var bx2 = bx; bx2 < W; bx2 += btw) {
      spr('bg_trees', g, bx2, H - 140);
    }

    // bottom bg strip
    var bbw = ASSETS.bg_bottom.w;
    for (var bb = (-bbw + (cloudX * 0.55 % bbw)); bb < W; bb += bbw) {
      spr('bg_bottom', g, bb, H - 130);
    }

    // ground: left + right slabs, dirt tiling in trunk gap
    spr('ground_left', g, 0, GROUND_Y);
    spr('ground_right', g, W - GROUND_RIGHT_W, GROUND_Y);
    var tileW = ASSETS.ground_bg.w;
    for (var gx = GROUND_BG_X; gx < W - GROUND_RIGHT_W; gx += tileW) {
      spr('ground_bg', g, gx, GROUND_Y);
    }

    // stones (removed per user)

    // trunk — STATIC, anchored on stump, tiles upward (tree grows up, trunk does not move down)
    var trunkTop = STUMP_Y - TRUNK_H;
    for (var ty = trunkTop; ty + TRUNK_H > -TRUNK_H; ty -= TRUNK_H) {
      spr('trunk', g, W / 2 - TRUNK_W / 2, ty);
    }

    // stump
    spr('stumb', g, STUMP_X, STUMP_Y);

    // branches (descend with S.drop)
    for (var i = 0; i < branches.length; i++) {
      var br = branches[i];
      var by = br.y + S.drop;
      if (by > -BRANCH_H && by < STUMP_Y + 20) {
        if (br.side < 0) spr('branch', g, W / 2 - BRANCH_W + 12, by - BRANCH_H, true);
        else spr('branch', g, W / 2 - 12, by - BRANCH_H);
      }
    }

    // falling pieces
    for (var f = 0; f < fallers.length; f++) {
      var fl = fallers[f];
      g.save();
      g.globalAlpha = Math.max(0, Math.min(1, fl.alpha));
      g.translate(fl.x, fl.y);
      g.rotate(fl.rot);
      g.scale(fl.side < 0 ? -1 : 1, 1);
      fl.kind === 'branch' ? spr('branch', g, -BRANCH_W / 2, -BRANCH_H / 2, fl.vx > 0) : spr('log', g, -25, -25);
      g.restore();
    }

    // player (when started or in game)
    if (S.started) {
      var px = W / 2 + (S.side < 0 ? -PLAYER_DX : PLAYER_DX);
      if (S.over) {
        // dead sprite
        spr('lumber_died', g, W / 2 - (S.side < 0 ? 37 : 36) - 36, PLAYER_FEET_Y - 85, S.side > 0);
      } else {
        var flip = S.side < 0;
        var bodyX = px;
        var bodyY = PLAYER_FEET_Y - 107;
        spr('lumber_body', g, bodyX, bodyY, flip);
        // hand: up when recent chop, else down
        var recent = S.frame - handAnimAt < 6 ? 1 : 0;
        // draw hand_up spike briefly after each chop
        if (recent) spr('hand_up', g, bodyX + (flip ? 6 : 22), bodyY - 55, flip);
        else spr('hand_down', g, bodyX + (flip ? 8 : 26), bodyY - 52, flip);
      }
    }

    // HUD
    drawHud(g);
  }

  var handAnimAt = -99;

  // ------------------------------------------------------------------
  // HUD: timeline + score + level
  // ------------------------------------------------------------------
  function drawHud(g) {
    // score (top center)
    drawText(String(S.score), W / 2, 30, 'bold 20px Charter, Georgia, serif', '#FFFFFF', '#886332');

    // level banner
    if (S.levelHold > 0 || levelBanner) {
      var a = levelBanner ? levelBanner.a : 1;
      var fade = S.levelHold > levelHoldTotal - 400 ? (S.levelHold) / 400 : 1;
      g.globalAlpha = Math.min(1, a * (S.levelHold > 0 ? Math.min(1, fade) : 1));
      drawText('Level ' + S.level, W / 2, 56, 'bold 24px Charter, Georgia, serif', '#FFFFFF', '#886332');
      g.globalAlpha = 1;
    }

    // timeline bar
    if (S.cdStarted && !S.over) {
      var frac = S.deadline ? Math.max(0, Math.min(1, (S.deadline - performance.now()) / S.qa)) : 1;
      drawTimeline(frac);
    }
  }

  function drawTimeline(frac) {
    var g = ctx;
    var bw = 100, bh = 21;
    var bx = W / 2 - bw - 50;
    var by = 12;
    spr('timeline', g, bx - 2, by - 3);
    var warn = frac < WARN_FRAC;
    var barW = 88 * Math.max(0, Math.min(1, frac));
    var barX = bx + 6;
    if (warn) {
      warnBlink++;
      if (warnBlink % 14 < 7) spr('timeline_warn', g, barX, by + 4);
      else spr('timeline_bar', g, barX, by + 4);
    } else {
      spr('timeline_bar', g, barX, by + 4);
    }
  }

  function drawText(txt, x, y, font, fill, shadow) {
    var g = ctx;
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'top';
    g.fillStyle = shadow;
    g.fillText(txt, x + 2, y + 2);
    g.fillStyle = fill;
    g.fillText(txt, x, y);
  }

  // ------------------------------------------------------------------
  // Resize (keep logical 750x572, scale canvas element)
  // ------------------------------------------------------------------
  function resize() {
    var maxW = Math.min(600, window.innerWidth - 16);
    var availH = window.innerHeight - 140;
    var scale = Math.min(maxW / W, Math.max(availH, 220) / H);
    var cw = Math.floor(W * scale), ch = Math.floor(H * scale);
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    canvas.width = W;
    canvas.height = H;
  }

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------
  loadAll(function () {
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    S.ready = true;
    seedTree();
    renderLeaderboard();
    if (typeof Difficulty !== 'undefined') {
      Difficulty.renderPicker(diffPicker, 'lumberjack', function () {
        if (typeof TG !== 'undefined') TG.haptic('light');
      });
    }
    showOverlay();
    requestAnimationFrame(tick);
  });
})();