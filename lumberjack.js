/* Goldutya LumberJack — layout/render matches tbot.xyz/lumber (600×672 + exact sprite positions). */
(function () {
  'use strict';

  // ------------------------------------------------------------------
  // Dimensions (computed like original Oa/Pa)
  // ------------------------------------------------------------------
  var W = 600, H = 672; // set in resize()
  var FOOTER_H = 228;

  var QA = 8500, GA = 250, START_MS = 4250;
  var WARN_FRAC = 0.25, LEVEL_EVERY = 20, LEVEL_FACTOR = 0.95;

  // Sprite native sizes (SVG px) and display sizes (half-scale like tileScale 0.5)
  var ASSETS = {
    bg_trees:     { src: 'assets/lumberjack/bg_trees.svg',     nw: 840, nh: 280, w: 420, h: 140 },
    bg_bottom:    { src: 'assets/lumberjack/bg_bottom.svg',    nw: 420, nh: 180, w: 210, h: 90 },
    bg_clouds:    { src: 'assets/lumberjack/bg_clouds.svg',    nw: 950, nh: 256, w: 475, h: 128 },
    ground_bg:    { src: 'assets/lumberjack/ground_bg.svg',    nw: 2,   nh: 190, w: 1,   h: 95 },
    ground_left:  { src: 'assets/lumberjack/ground_left.svg',  nw: 280, nh: 190, w: 140, h: 95 },
    ground_right: { src: 'assets/lumberjack/ground_right.svg', nw: 390, nh: 190, w: 195, h: 95 },
    trunk:        { src: 'assets/lumberjack/trunk.svg',        nw: 100, nh: 750, w: 50,  h: 375 },
    log:          { src: 'assets/lumberjack/log.svg',          nw: 100, nh: 100, w: 50,  h: 50 },
    branch:       { src: 'assets/lumberjack/branch.svg',       nw: 250, nh: 160, w: 125, h: 80 },
    stumb:        { src: 'assets/lumberjack/stumb.svg',        nw: 100, nh: 120, w: 50,  h: 60 },
    stones:       { src: 'assets/lumberjack/stones.svg',       nw: 150, nh: 72,  w: 75,  h: 36 },
    lumber_body:  { src: 'assets/lumberjack/lumber_body.svg',  nw: 100, nh: 214, w: 50,  h: 107 },
    lumber_died:  { src: 'assets/lumberjack/lumber_died.svg',  nw: 141, nh: 170, w: 73,  h: 85 },
    hand_up:      { src: 'assets/lumberjack/hand_up.svg',      nw: 94,  nh: 104, w: 47,  h: 52 },
    hand_down:    { src: 'assets/lumberjack/hand_down.svg',    nw: 118, nh: 18,  w: 59,  h: 9 },
    timeline:     { src: 'assets/lumberjack/timeline.svg',     nw: 200, nh: 42,  w: 100, h: 21 },
    timeline_bar: { src: 'assets/lumberjack/timeline_bar.svg', nw: 176, nh: 18,  w: 88,  h: 9 },
    timeline_warn:{ src: 'assets/lumberjack/timeline_warn.svg',nw: 176, nh: 18,  w: 88,  h: 9 }
  };

  var imgs = {}, loaded = 0, totalAssets = Object.keys(ASSETS).length;

  // ------------------------------------------------------------------
  // DOM
  // ------------------------------------------------------------------
  var pageWrap = document.getElementById('page_wrap');
  var canvasWrap = document.getElementById('canvas_wrap');
  var scoreValueEl = document.getElementById('score_value');
  var scoreShareEl = document.getElementById('score_share');
  var tableEl = document.getElementById('table');
  var tableWrapEl = document.getElementById('table_wrap');
  var btnLeft = document.getElementById('btnLeft');
  var btnRight = document.getElementById('btnRight');

  var canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  canvasWrap.appendChild(canvas);
  var ctx = canvas.getContext('2d');

  var BEST_KEY = 'lumberjack.scores';

  // ------------------------------------------------------------------
  // State (mirrors original: Z=started, h=over/idle-result, aa=playing)
  // ------------------------------------------------------------------
  var S = {
    started: false,     // Z
    over: true,         // h  (true on greet so in_result shows ground scene)
    playing: false,     // aa
    ready: false,       // xa
    score: 0,           // ca
    level: 1,           // Ha
    side: false,        // m  (false=right, true=left)
    queue: [0, 0],      // da
    pa: 100,
    dropW: 0,           // W vertical scroll
    deadline: 0,
    qa: QA,
    ga: GA,
    handAnimUntil: 0,
    levelBannerT: 0,
    cloudX: 15,
    frame: 0
  };

  var branches = [];    // sprites in container u: {side, type, y, sprite-ish}
  var fallers = [];
  var lastFrame = 0;
  var warnBlink = 0;
  var levelBanner = null;

  // ------------------------------------------------------------------
  // Audio
  // ------------------------------------------------------------------
  var aCtx = null;
  function audio() {
    if (!aCtx) { try { aCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    return aCtx;
  }
  function blip(f, d, type, v, s) {
    var ac = audio(); if (!ac) return;
    try {
      var o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f, t);
      if (s) o.frequency.exponentialRampToValueAtTime(s, t + d);
      g.gain.setValueAtTime(v || 0.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g); g.connect(ac.destination);
      o.start(t); o.stop(t + d);
    } catch (e) {}
  }
  function noise(f, d, v) {
    var ac = audio(); if (!ac) return;
    try {
      var l = Math.floor(ac.sampleRate * d), b = ac.createBuffer(1, l, ac.sampleRate), c = b.getChannelData(0);
      for (var i = 0; i < l; i++) c[i] = (Math.random() * 2 - 1) * (1 - i / l);
      var s = ac.createBufferSource(); s.buffer = b;
      var fl = ac.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = f; fl.Q.value = 1.2;
      var g = ac.createGain(); g.gain.value = v || 0.18;
      s.connect(fl); fl.connect(g); g.connect(ac.destination); s.start();
    } catch (e) {}
  }
  function sfxChop() { noise(2100, 0.08, 0.22); blip(150, 0.1, 'sine', 0.25, 65); }
  function sfxBranch() { blip(320, 0.12, 'triangle', 0.2, 90); }
  function sfxDeath() { blip(260, 0.4, 'sawtooth', 0.2, 40); noise(700, 0.3, 0.15); }
  function sfxThud() { blip(90, 0.12, 'sine', 0.3, 50); }

  // ------------------------------------------------------------------
  // Assets
  // ------------------------------------------------------------------
  function loadAll(cb) {
    Object.keys(ASSETS).forEach(function (k) {
      var img = new Image();
      img.onload = function () { imgs[k] = img; if (++loaded >= totalAssets) cb(); };
      img.onerror = function () { if (++loaded >= totalAssets) cb(); };
      img.src = ASSETS[k].src;
    });
  }

  // ------------------------------------------------------------------
  // Draw helpers
  // ------------------------------------------------------------------
  function drawSprite(key, x, y, w, h, flipX, alpha) {
    var img = imgs[key], a = ASSETS[key];
    if (!img) return;
    w = w != null ? w : a.w;
    h = h != null ? h : a.h;
    if (alpha != null && alpha < 1) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    }
    if (flipX) {
      ctx.save();
      ctx.translate(x + w, y);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, a.nw, a.nh, 0, 0, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(img, 0, 0, a.nw, a.nh, x, y, w, h);
    }
    if (alpha != null && alpha < 1) ctx.restore();
  }

  /* TilingSprite equivalent: tile texture across rect at half scale with offsets */
  function drawTiled(key, dx, dy, dw, dh, tileX, tileY) {
    var img = imgs[key], a = ASSETS[key];
    if (!img || dw <= 0 || dh <= 0) return;
    var tw = a.w, th = a.h; // half-scale tile size
    ctx.save();
    ctx.beginPath();
    ctx.rect(dx, dy, dw, dh);
    ctx.clip();
    // PixiJS tilePosition shifts texture origin: visible texel at output = (x - dx - tileX)
    var startX = dx + (tileX % tw);
    if (startX > dx) startX -= tw;
    var startY = dy + (tileY % th);
    if (startY > dy) startY -= th;
    for (var y = startY; y < dy + dh; y += th) {
      for (var x = startX; x < dx + dw; x += tw) {
        ctx.drawImage(img, 0, 0, a.nw, a.nh, x, y, tw, th);
      }
    }
    ctx.restore();
  }

  function drawText(txt, x, y, font, fill, shadow, scaleX) {
    ctx.save();
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    if (scaleX && scaleX !== 1) {
      ctx.translate(x, y);
      ctx.scale(scaleX, 1);
      x = 0; y = 0;
    }
    if (shadow) {
      ctx.fillStyle = shadow;
      ctx.fillText(txt, x + 1.5, y + 1.5);
    }
    ctx.fillStyle = fill;
    ctx.fillText(txt, x, y);
    ctx.restore();
  }

  // ------------------------------------------------------------------
  // Layout positions (Pa function equivalent) — recomputed on resize
  // ------------------------------------------------------------------
  var L = {};
  function layout() {
    L.groundY = H - 95;                 // t.y = f-95 = 577
    L.groundMidX = 139;
    L.groundMidW = Math.max(0, W - 139 - 194); // 267
    L.groundRightX = W - 195;
    L.bgBottomY = H - 130;              // 542
    L.bgTreesTileY = H - 52;            // tilePosition.y
    L.stumpX = (W - 50) / 2;            // 275
    L.stumpY = H - 45 - 60;             // 567
    L.stonesX = (W - 75) / 2;           // 262.5
    L.stonesY = H - 34 - 36;            // 602
    L.playerFeetY = H - 55;             // 617
    L.branchCX = W / 2;
    L.branchCY = H - 105;               // 567 (K.y)
    L.trunkX = (W - 50) / 2;
    L.trunkH = H - 45;                  // 627
    L.timelineX = W / 2 - 44;
    L.timelineY = 15;
    L.scoreY = 30;
    L.levelY = 56;
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
  }

  function resize() {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    // Match original: footer 228/188/128 based on height; wrap max 600 (or 800 landscape short)
    var wide = vh <= 480 && vw >= 480;
    var footerH = vh <= 480 ? 128 : vh <= 570 ? 188 : 228;
    var availH = vh - footerH;
    W = Math.min(vw, wide ? 800 : 600);
    if (W < 375) W = Math.min(vw, 375);
    H = Math.max(320, availH);
    FOOTER_H = footerH;
    layout();
  }

  // ------------------------------------------------------------------
  // State classes (Ia)
  // ------------------------------------------------------------------
  function setStateClasses() {
    // in_greet: !started; in_game: !over; in_result: over
    toggleClass(pageWrap, 'in_greet', !S.started);
    toggleClass(pageWrap, 'in_game', !S.over);
    toggleClass(pageWrap, 'in_result', S.over);
    toggleClass(pageWrap, 'ready', S.ready);
    toggleClass(pageWrap, 'loading', !S.ready);
  }
  function toggleClass(el, cls, on) {
    if (on) el.classList.add(cls);
    else el.classList.remove(cls);
  }

  // ------------------------------------------------------------------
  // Leaderboard
  // ------------------------------------------------------------------
  function loadScores() {
    try { return JSON.parse(localStorage.getItem(BEST_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function saveScores(list) {
    try { localStorage.setItem(BEST_KEY, JSON.stringify(list)); } catch (e) {}
  }
  function hadPriorScores() {
    try { return JSON.parse(localStorage.getItem(BEST_KEY) || '[]').length > 0; }
    catch (e) { return false; }
  }
  function submitScore() {
    if (!S.started) return;
    var prior = hadPriorScores();
    var list = loadScores();
    list.push({ name: 'You', score: S.score, current: true });
    list.sort(function (a, b) { return b.score - a.score; });
    list = list.slice(0, 10);
    list.forEach(function (r, i) { r.pos = i + 1; r.current = r.name === 'You' && r.score === S.score; });
    // keep only one current
    var seen = false;
    list.forEach(function (r) {
      if (r.current) { if (seen) r.current = false; else seen = true; }
    });
    saveScores(list);
    // Match reference: Share stays hidden (Telegram-only in original);
    // leaderboard opens only when prior scores exist (server-driven in original)
    if (prior) renderTable(list);
    else tableWrapEl.classList.remove('opened');
  }
  function renderTable(list) {
    if (list === false || !list) { tableWrapEl.classList.remove('opened'); return; }
    if (!list.length) { tableWrapEl.classList.remove('opened'); return; }
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      html += '<li class="row' + (b.current ? ' you' : '') + '"><span class="place">' + (b.pos || (i + 1)) +
        '.</span><span class="score">' + b.score + '</span><div class="name">' + escapeHtml(b.name) + '</div></li>';
    }
    tableEl.innerHTML = html;
    tableWrapEl.classList.add('opened');
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ------------------------------------------------------------------
  // Score text (Fa)
  // ------------------------------------------------------------------
  function updateScoreText() {
    var a = String(S.score || 0);
    scoreValueEl.textContent = a;
    // canvas score drawn in render via S.score
  }

  // ------------------------------------------------------------------
  // Seed / start / death
  // ------------------------------------------------------------------
  function seedQueue() {
    S.queue = [0, 0];
    // Start pa=50 so first branch yRel=-150: at first obstacle check (dropW=100)
    // worldY = 617+100-150 = 567 (body level), not 517 (head/above — unfair death)
    S.pa = 50;
    branches = [];
    while (S.queue.length < 11) {
      var left = Math.random() < 0.5;
      var side = left ? -1 : 1;
      S.queue.push(side, side * 2);
      S.pa += 100;
      branches.push({
        side: side,
        type: 2,
        yRel: -S.pa,
        xRel: left ? -10 : 10,
        ox: 0
      });
    }
  }

  function startGame() {
    if (!S.ready) return;
    S.started = true;
    S.over = false;
    S.playing = true;
    S.score = 0;
    S.level = 1;
    S.qa = QA;
    S.ga = GA;
    S.dropW = 0;
    S.deadline = performance.now() + START_MS;
    S.handAnimUntil = 0;
    levelBanner = null;
    fallers = [];
    scoreShareEl.classList.remove('shown');
    tableWrapEl.classList.remove('opened');
    seedQueue();
    updateScoreText();
    setStateClasses();
  }

  function doDeath(fromLeft) {
    if (S.over) return;
    S.over = true;
    S.playing = false;
    sfxDeath();
    setSide(fromLeft);
    // small delay then show result (original: setTimeout 400)
    setTimeout(function () {
      updateScoreText();
      submitScore();
      setStateClasses();
    }, 400);
  }

  function setSide(left) {
    S.side = !!left;
    // positions applied during render
  }

  // ------------------------------------------------------------------
  // Chop — matches original $a / Ca
  // ------------------------------------------------------------------
  function applyFreeChop(left) {
    // $a: if da.length odd, push pair first; then shift
    if (S.queue.length % 2 === 1) pushPair();
    var d = S.queue.shift();
    if (d === undefined) d = 0;

    // spawn falling piece: abs(d)==2 → branch (and remove lowest visual), else log
    if (Math.abs(d) === 2) {
      if (branches.length) branches.shift();
      spawnFalling('branch', left);
    } else {
      spawnFalling('log', left);
    }

    S.dropW += 50;
  }

  // Axe cut line: hand_down sits at feetY-67 (chop stroke). Branch center below that = already under the axe → no longer a threat.
  function axeCutY() {
    return L.playerFeetY - 58;
  }

  function branchBelowAxe(br) {
    if (!br) return false;
    var by = L.playerFeetY + S.dropW + br.yRel + (br.ox || 0);
    return (by - 40) > axeCutY(); // center of 80px branch below cut line
  }

  function chop(left) {
    if (!S.playing || S.over || !S.ready) return;
    setSide(left);

    // Ca: peek da[0] — do not shift until free path (or abs==1 death uses $a)
    var b = S.queue.length ? S.queue[0] : 0;
    var hit = b !== 0 && left === (b < 0);

    // Branch scrolled below axe cut → not an obstacle; clear it and chop free
    if (hit && branchBelowAxe(branches[0])) {
      applyFreeChop(left);
      S.handAnimUntil = performance.now() + 50;
      S.deadline = Math.min(S.deadline + S.ga, performance.now() + S.qa);
      S.score++;
      sfxChop(); sfxThud();
      if (S.score % LEVEL_EVERY === 0) {
        S.level++;
        S.qa *= LEVEL_FACTOR;
        S.ga *= LEVEL_FACTOR;
        levelBanner = { t: 0, T: 120, a: 0 };
      }
      return;
    }

    if (hit) {
      // death toward obstacle side
      if (Math.abs(b) === 1) {
        // original: $a(a, true) — shift/push/scroll but no fall from $a; Va() after
        if (S.queue.length % 2 === 1) pushPair();
        S.queue.shift();
        S.dropW += 50;
      }
      // abs==2: original does not shift on death
      spawnFalling(Math.abs(b) === 2 ? 'branch' : 'log', b < 0);
      sfxBranch();
      doDeath(left);
      return;
    }

    // free chop
    applyFreeChop(left);
    S.handAnimUntil = performance.now() + 50;
    S.deadline = Math.min(S.deadline + S.ga, performance.now() + S.qa);
    S.score++;
    sfxChop(); sfxThud();

    if (S.score % LEVEL_EVERY === 0) {
      S.level++;
      S.qa *= LEVEL_FACTOR;
      S.ga *= LEVEL_FACTOR;
      levelBanner = { t: 0, T: 120, a: 0 };
    }
  }

  function pushPair() {
    var left = Math.random() < 0.5;
    var side = left ? -1 : 1;
    S.queue.push(side, side * 2);
    S.pa += 100;
    pushBranchSprite(side, left);
  }

  function pushBranchSprite(side, left) {
    if (side == null) return;
    branches.push({
      side: side,
      type: 2,
      yRel: -S.pa,
      xRel: left ? -10 : 10,
      ox: 0
    });
  }

  function spawnFalling(kind, left) {
    var dir = left ? -1 : 1;
    fallers.push({
      kind: kind,
      x: W / 2 + dir * 45,
      y: L.stumpY - 40,
      vx: dir * 130,
      rot: 0,
      vr: dir < 0 ? 0.12 : -0.12,
      alpha: 1,
      t: 0,
      T: 24,
      side: dir
    });
  }

  // ------------------------------------------------------------------
  // Countdown
  // ------------------------------------------------------------------
  function updateCountdown() {
    if (!S.playing || S.over || !S.ready) return;
    if (performance.now() >= S.deadline) doDeath(S.side);
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  function render(now) {
    var g = ctx;
    var isGreet = !S.started;
    var isPlaying = !S.over && S.started;
    var isResult = S.over && S.started; // after death
    // On initial load S.over=true & !started → greet scene (original h=true, Z=false)

    // Clear with renderer bg #D3F7FF
    g.fillStyle = '#d3f7ff';
    g.fillRect(0, 0, W, H);

    // O: bg_trees full canvas, tilePos (-13, H-52)
    drawTiled('bg_trees', 0, 0, W, H, -13, L.bgTreesTileY);

    // P: bg_bottom y=H-130 h=90, tilePos.x=-13
    drawTiled('bg_bottom', 0, L.bgBottomY, W, 90, -13, 0);

    // E: bg_clouds y=15 h=128, tilePos.x = S.cloudX (animated)
    drawTiled('bg_clouds', 0, 15, W, 128, S.cloudX, 0);

    // Ground: middle strip + left + right
    drawTiled('ground_bg', L.groundMidX, L.groundY, L.groundMidW, 95, 0, 0);
    drawSprite('ground_left', 0, L.groundY, 140, 95);
    drawSprite('ground_right', L.groundRightX, L.groundY, 195, 95);

    // Stones (always on main in original - L)
    drawSprite('stones', L.stonesX, L.stonesY, 75, 36);

    // Trunk (only when !over i.e. playing — v.visible=!h)
    if (!S.over) {
      // v: x centered, y=0, height=H-45, tileScale 0.5, tilePos.y=25+W
      drawTiled('trunk', L.trunkX, 0, 50, L.trunkH, 0, 25 + S.dropW);
    }

    // Stump (only when over — z.visible=!!h)
    if (S.over) {
      drawSprite('stumb', L.stumpX, L.stumpY, 50, 60);
    }

    // Branches (only when !over — u.visible=!h)
    if (!S.over) {
      var uY = L.playerFeetY + S.dropW; // u.y = f-55+W
      for (var i = 0; i < branches.length; i++) {
        var br = branches[i];
        var by = uY + br.yRel + br.ox; // anchor bottom-left at yRel
        var bx = L.branchCX + br.xRel;
        // hide branches that have scrolled below the axe cut line
        if ((by - 40) > axeCutY()) continue;
        if (by > -80 && by < H + 20) {
          // left side: sprite flipped, connector attaches at trunk edge
          if (br.side < 0) {
            // right edge of branch near trunk left edge
            drawSprite('branch', bx - 125 + 15, by - 80, 125, 80, true);
          } else {
            drawSprite('branch', bx - 15, by - 80, 125, 80, false);
          }
        }
      }
    }

    // Falling pieces
    for (var f = 0; f < fallers.length; f++) {
      var fl = fallers[f];
      g.save();
      g.globalAlpha = Math.max(0, Math.min(1, fl.alpha));
      g.translate(fl.x, fl.y);
      g.rotate(fl.rot);
      // single mirror via side
      if (fl.side < 0) {
        g.scale(-1, 1);
        drawSprite(fl.kind === 'branch' ? 'branch' : 'log', -62 + 15, -40, fl.kind === 'branch' ? 125 : 50, fl.kind === 'branch' ? 80 : 50, false);
      } else {
        drawSprite(fl.kind === 'branch' ? 'branch' : 'log', -15, -40, fl.kind === 'branch' ? 125 : 50, fl.kind === 'branch' ? 80 : 50, false);
      }
      g.restore();
    }

    // Player — right keeps original +35; left pushed further out per feedback
    var originX = W / 2 + (S.side ? -52 : 35);
    var py = L.playerFeetY;
    var flip = S.side;
    var showDead = S.over && S.started;
    var showAlive = !S.over;

    if (showAlive) {
      // body: unflipped [origin, origin+50]; flipped [origin-50, origin]
      var bodyX = flip ? originX - 50 : originX;
      drawSprite('lumber_body', bodyX, py - 107, 50, 107, flip);
      // hands: exact Pixi child math with parent scale.x=-1 when flipped
      var handUp = !(S.handAnimUntil > now);
      if (handUp) {
        // I: x=21, y=-57, anchor(0,1), 47×52
        // flipped: world [origin-68, origin-21]
        if (flip) {
          drawSprite('hand_up', originX - 68, py - 109, 47, 52, true);
        } else {
          drawSprite('hand_up', originX + 21, py - 109, 47, 52, false);
        }
      } else {
        // H: x=29, y=-58, anchor(1,1), 59×9 → local x=-30..29
        if (flip) {
          drawSprite('hand_down', originX - 29, py - 67, 59, 9, true);
        } else {
          drawSprite('hand_down', originX - 30, py - 67, 59, 9, false);
        }
      }
    } else if (showDead) {
      // w: right keeps ±32; left pushed further out
      var wx = W / 2 + (S.side ? -48 : 32);
      var deadX = S.side ? wx - 73 : wx;
      drawSprite('lumber_died', deadX, py - 85, 73, 85, S.side);
    }

    // Timeline + score + level (only when !over)
    if (!S.over) {
      drawTimeline();
      drawText(String(S.score), W / 2, L.scoreY, 'bold 20px Charter, Georgia, serif', '#ffffff', '#886332', 1);
      if (levelBanner) {
        levelBanner.t++;
        levelBanner.a = levelBanner.t < levelBanner.T / 2
          ? levelBanner.t / (levelBanner.T / 2)
          : Math.max(0, 1 - (levelBanner.t - levelBanner.T / 2) / (levelBanner.T / 2));
        if (levelBanner.t >= levelBanner.T) levelBanner = null;
        else {
          g.save();
          g.globalAlpha = Math.min(1, levelBanner.a);
          drawText('Level ' + S.level, W / 2, L.levelY, 'bold 24px Charter, Georgia, serif', '#ffffff', '#886332', 0.8);
          g.restore();
        }
      }
    }
  }

  function drawTimeline() {
    var frac = 1;
    if (S.deadline) {
      frac = (S.deadline - performance.now()) / S.qa;
      if (frac < 0) frac = 0;
      if (frac > 1) frac = 1;
    }
    var ax = L.timelineX, ay = L.timelineY;
    // Graphics rect (-3,-3,94,15) white then black mask region — approximate with bar clip
    var bx = ax - 88; // ea.x = -88 relative, plus mask; bar drawn from left of track
    // track: timeline sprite at (-6,-6) size 100×21
    drawSprite('timeline', ax - 6, ay - 6, 100, 21);
    // bar width 88 * frac, clipped to (-3,-3,94,15) local → (ax-3, ay-3, 94, 15)
    ctx.save();
    ctx.beginPath();
    ctx.rect(ax - 3, ay - 3, 94, 15);
    ctx.clip();
    var warn = frac < WARN_FRAC;
    if (warn) {
      warnBlink++;
      var key = (warnBlink % 14 < 7) ? 'timeline_warn' : 'timeline_bar';
      // ea.x = -88*(1-frac) shifts bar; visible portion grows from right
      var barX = ax + (-88 * (1 - frac));
      drawSprite(key, barX, ay, 88, 9);
    } else {
      var barX2 = ax + (-88 * (1 - frac));
      drawSprite('timeline_bar', barX2, ay, 88, 9);
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------
  // Loop
  // ------------------------------------------------------------------
  function tick(now) {
    if (!lastFrame) lastFrame = now;
    var dt = now - lastFrame;
    lastFrame = now;
    S.frame++;

    updateCountdown();

    // clouds drift: E.tilePosition.x -= 0.25 per frame (original uses ticker not dt)
    S.cloudX -= 0.25;
    if (S.cloudX < -475) S.cloudX += 475;

    // fallers
    for (var i = fallers.length - 1; i >= 0; i--) {
      var fl = fallers[i];
      fl.t++;
      if (fl.t >= fl.T) { fallers.splice(i, 1); continue; }
      var k = fl.t / fl.T;
      fl.x += fl.vx / 60;
      fl.y += (k < 0.5 ? -0.4 : 0.6) * 3;
      fl.rot += fl.vr;
      if (k > 0.5) fl.alpha = 1 - (k - 0.5) * 2;
    }

    render(now);
    requestAnimationFrame(tick);
  }

  // ------------------------------------------------------------------
  // Input
  // ------------------------------------------------------------------
  function onLeft(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!S.ready) return;
    if (!S.started) { startGame(); return; }
    if (S.over) { startGame(); return; }
    chop(true);
  }
  function onRight(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!S.ready || !S.started || S.over) return;
    chop(false);
  }

  // Expose for Playwright diagnostics
  window.__lj = {
    state: function () {
      return {
        started: S.started, over: S.over, playing: S.playing, ready: S.ready,
        score: S.score, queue: S.queue.slice(0, 8),
        dropW: S.dropW, pa: S.pa, side: S.side,
        branches: branches.map(function (b) { return { side: b.side, yRel: b.yRel, xRel: b.xRel }; })
      };
    },
    chop: chop,
    start: startGame
  };

  btnLeft.addEventListener('click', onLeft);
  btnRight.addEventListener('click', onRight);
  btnLeft.addEventListener('touchstart', function (e) { e.preventDefault(); onLeft(e); }, { passive: false });
  btnRight.addEventListener('touchstart', function (e) { e.preventDefault(); onRight(e); }, { passive: false });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') {
      if (S.playing && !S.over) { e.preventDefault(); chop(true); }
      else if (!S.started) { e.preventDefault(); startGame(); }
    } else if (e.key === 'ArrowRight') {
      if (S.playing && !S.over) { e.preventDefault(); chop(false); }
    } else if (e.key === ' ' || e.key === 'Enter') {
      if (!S.started || S.over) { e.preventDefault(); startGame(); }
    }
  });

  scoreShareEl.addEventListener('click', function (e) {
    e.stopPropagation();
    var t = 'I scored ' + S.score + ' in LumberJack on Goldutya!';
    if (navigator.share) navigator.share({ text: t }).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(t).catch(function () {});
  });

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () {
    setTimeout(resize, 100);
  });

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------
  scoreValueEl.textContent = '0';
  resize();
  loadAll(function () {
    S.ready = true;
    S.started = false;
    S.over = true; // greet shows result-scene (ground+stump+player) per original
    seedQueue();
    setStateClasses();
    // greet: empty table like reference first visit
    tableWrapEl.classList.remove('opened');
    requestAnimationFrame(tick);
  });
})();
