(function () {
  'use strict';

  // ------------------------------------------------------------------
  // Constants
  // ------------------------------------------------------------------
  var W = 750, H = 572;                 // logical canvas size
  var QA = 8500;                        // countdown window cap (ms)
  var GA = 250;                         // time added per chop (ms)
  var START_MS = 4250;                  // initial grace window
  var WARN_FRAC = 0.25;                 // timeline warn threshold
  var LEVEL_EVERY = 20;                 // chops per level
  var LEVEL_FACTOR = 0.95;              // per-level scaling
  var TRUNK_W = 56, TRUNK_H = 400;      // trunk tile (logical)
  var DROP_PER_CHOP = 50;               // scene drop per chop
  var PLAYER_FOOT_Y = H - 55;           // player feet baseline
  var PLAYER_DX = 35;                   // player x offset from centre
  var PA_INIT = 100;                    // branch stack start

  // Palette (from observed original)
  var PAL = {
    sky: '#D3F8FF',
    bgTrees: '#C7F0F9',
    clouds: '#F1FCFF',
    wood: '#A17438',
    woodLite: '#BA8C4D',
    woodDark: '#825F31',
    woodShadow: '#886332',
    leaf: '#7EAD4F',
    leafLite: '#99CC66',
    grass: '#AEDD7F',
    grassDark: '#99CC66',
    dirt: '#644C3C',
    dirtLite: '#91664A',
    stone: '#808080',
    stoneLite: '#B3B3B3',
    shirt: '#B4352B',
    shirtLite: '#CF463B',
    overalls: '#3D6894',
    skin: '#FEB9A0',
    shoe: '#4A7DB0',
    axe: '#CE453A',
    axeWood: '#825F31',
    white: '#FFFFFF'
  };

  // ------------------------------------------------------------------
  // DOM refs
  // ------------------------------------------------------------------
  var canvas = document.getElementById('game_canvas');
  var ctx = canvas.getContext('2d');
  var groundCanvas = document.getElementById('g_canvas');
  var gctx = groundCanvas.getContext('2d');
  var wrap = document.getElementById('page_wrap');
  var scoreEl = document.getElementById('score_value');
  var scoreWrap = document.querySelector('.result_score');
  var titleEl = document.querySelector('.game_title');
  var shareBtn = document.getElementById('score_share');
  var btnLeft = document.getElementById('button_left');
  var btnRight = document.getElementById('button_right');
  var tableEl = document.getElementById('table');
  var tableWrapEl = document.querySelector('.table_wrap');

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------
  var S = {
    score: 0,
    level: 1,
    deadline: 0,
    qa: QA,
    ga: GA,
    queue: [0, 0],
    drop: 0,            // W
    pa: PA_INIT,        // branch spawn stack
    side: 0,            // -1 left, 1 right (last chop side)
    started: false,
    inGame: false,
    cdStarted: false,
    over: false,
    levelHold: 0,       // level banner timer
    frame: 0
  };

  var tweens = [];
  var branches = [];    // {side, kind(log|branch), x,y,visible}
  var fallers = [];     // dying pieces
  var handDown = 0;     // frames of axe-swing pose
  var deathT = 0;       // death sequence timer
  var cloudX = 0;
  var warnBlink = 0;
  var audio = null;

  var g_ctx = null; // ground offscreen

  // ------------------------------------------------------------------
  // Tween engine (frame-based, 60fps assumption)
  // ------------------------------------------------------------------
  function tween(obj, keys, frames, ease, onDone, delay) {
    var t = {
      obj: obj,
      keys: keys,
      start: {},
      end: {},
      frames: frames,
      f: 0,
      delay: delay || 0,
      ease: ease || function (x) { return x; },
      done: onDone || null
    };
    for (var k in keys) t.start[k] = obj[k];
    tweens.push(t);
    return t;
  }

  function updateTweens() {
    var next = [];
    for (var i = 0; i < tweens.length; i++) {
      var t = tweens[i];
      if (t.delay > 0) { t.delay--; next.push(t); continue; }
      t.f++;
      var p = Math.min(1, t.f / t.frames);
      var e = t.ease(p);
      for (var k in t.keys) {
        t.obj[k] = t.start[k] + (t.keys[k] - t.start[k]) * e;
      }
      if (p >= 1) { if (t.done) t.done(); }
      else next.push(t);
    }
    tweens = next;
  }

  function easeOut(x) { return 1 - Math.pow(1 - x, 3); }

  // ------------------------------------------------------------------
  // Audio (WebAudio synthesis)
  // ------------------------------------------------------------------
  function ctx_audio() {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    return audio;
  }

  function sfx(type) {
    try {
      var ac = ctx_audio();
      var t0 = ac.currentTime;
      if (type === 'chop') {
        // noise burst
        var n = ac.createBufferSource();
        var buf = ac.createBuffer(1, ac.sampleRate * 0.06, ac.sampleRate);
        var d = buf.getChannelData(0);
        for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
        n.buffer = buf;
        var bp = ac.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 2100; bp.Q.value = 1.2;
        var ng = ac.createGain();
        ng.gain.value = 0.5;
        n.connect(bp); bp.connect(ng); ng.connect(ac.destination);
        n.start(t0); n.stop(t0 + 0.07);
        // thud
        var o = ac.createOscillator(), og = ac.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(150, t0);
        o.frequency.exponentialRampToValueAtTime(65, t0 + 0.09);
        og.gain.setValueAtTime(0.55, t0);
        og.gain.exponentialRampToValueAtTime(0.001, t0 + 0.1);
        o.connect(og); og.connect(ac.destination);
        o.start(t0); o.stop(t0 + 0.11);
      } else if (type === 'branch') {
        var o2 = ac.createOscillator(), og2 = ac.createGain();
        o2.type = 'triangle';
        o2.frequency.setValueAtTime(320, t0);
        o2.frequency.exponentialRampToValueAtTime(90, t0 + 0.12);
        og2.gain.setValueAtTime(0.4, t0);
        og2.gain.exponentialRampToValueAtTime(0.001, t0 + 0.13);
        o2.connect(og2); og2.connect(ac.destination);
        o2.start(t0); o2.stop(t0 + 0.14);
      } else if (type === 'death') {
        var o3 = ac.createOscillator(), og3 = ac.createGain();
        o3.type = 'sawtooth';
        o3.frequency.setValueAtTime(260, t0);
        o3.frequency.exponentialRampToValueAtTime(40, t0 + 0.4);
        og3.gain.setValueAtTime(0.45, t0);
        og3.gain.exponentialRampToValueAtTime(0.001, t0 + 0.42);
        o3.connect(og3); og3.connect(ac.destination);
        o3.start(t0); o3.stop(t0 + 0.45);
        var n2 = ac.createBufferSource();
        var buf2 = ac.createBuffer(1, ac.sampleRate * 0.3, ac.sampleRate);
        var d2 = buf2.getChannelData(0);
        for (var j = 0; j < d2.length; j++) d2[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / d2.length, 2);
        n2.buffer = buf2;
        var lp = ac.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 700;
        var ng2 = ac.createGain(); ng2.gain.value = 0.4;
        n2.connect(lp); lp.connect(ng2); ng2.connect(ac.destination);
        n2.start(t0); n2.stop(t0 + 0.32);
      }
    } catch (e) { /* audio blocked */ }
  }

  // ------------------------------------------------------------------
  // Sprite drawing (original artwork, canvas-generated)
  // ------------------------------------------------------------------
  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function drawWoodSection(c, x, y, w, h, r) {
    // rounded wood block with bark ring + grain
    var g = c.getContext('2d');
    g.beginPath();
    if (r) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h);
    g.fillStyle = PAL.wood;
    g.fill();
    // bark stripe
    g.fillStyle = PAL.woodDark;
    g.fillRect(x, y + h * 0.18, w * 0.16, h * 0.64);
    // lite stripe
    g.fillStyle = PAL.woodLite;
    g.fillRect(x + w * 0.6, y + h * 0.1, w * 0.16, h * 0.8);
    // ring ticks
    g.strokeStyle = PAL.woodShadow;
    g.lineWidth = 2;
    for (var yy = y + 8; yy < y + h - 4; yy += 12) {
      g.beginPath();
      g.moveTo(x + 4, yy);
      g.lineTo(x + w - 4, yy);
      g.stroke();
    }
  }

  function spriteTrunk() {
    var c = makeCanvas(TRUNK_W, TRUNK_H);
    drawWoodSection(c, 0, 0, TRUNK_W, TRUNK_H, 6);
    return c;
  }

  function spriteLog() {
    var c = makeCanvas(50, 50);
    drawWoodSection(c, 0, 0, 50, 50, 8);
    // end rings
    var g = c.getContext('2d');
    g.strokeStyle = PAL.woodDark;
    g.lineWidth = 2;
    g.beginPath(); g.arc(10, 25, 7, 0, 7); g.stroke();
    g.beginPath(); g.arc(10, 25, 4, 0, 7); g.stroke();
    return c;
  }

  function spriteBranch(side) {
    // branch: log + leaves tuft on top, shadow under
    var c = makeCanvas(125, 80);
    var g = c.getContext('2d');
    // leaves blob
    g.fillStyle = PAL.leaf;
    g.beginPath();
    g.moveTo(20, 48);
    g.bezierCurveTo(8, 30, 22, 12, 40, 10);
    g.bezierCurveTo(52, 0, 70, 2, 76, 12);
    g.bezierCurveTo(92, 4, 110, 10, 112, 24);
    g.bezierCurveTo(124, 26, 124, 40, 114, 44);
    g.bezierCurveTo(112, 60, 90, 66, 70, 62);
    g.bezierCurveTo(52, 74, 26, 70, 20, 48);
    g.fill();
    g.fillStyle = PAL.leafLite;
    g.beginPath();
    g.moveTo(34, 26);
    g.bezierCurveTo(44, 16, 60, 14, 68, 22);
    g.bezierCurveTo(76, 14, 92, 18, 96, 28);
    g.bezierCurveTo(86, 34, 70, 34, 62, 28);
    g.bezierCurveTo(52, 36, 40, 36, 34, 26);
    g.fill();
    // log base
    drawWoodSection(c, 20, 40, 90, 16, 4);
    // shadow under branch bottom edge
    g.fillStyle = PAL.woodShadow;
    g.globalAlpha = 0.35;
    g.beginPath();
    g.moveTo(24, 60);
    g.lineTo(108, 60);
    g.lineTo(100, 68);
    g.lineTo(32, 68);
    g.fill();
    g.globalAlpha = 1;
    return c;
  }

  function spriteStump() {
    var c = makeCanvas(50, 60);
    var g = c.getContext('2d');
    drawWoodSection(c, 0, 10, 50, 50, 6);
    g.fillStyle = PAL.woodDark;
    g.fillRect(0, 10, 50, 6);
    // top rings
    g.fillStyle = PAL.woodLite;
    g.beginPath(); g.ellipse(25, 12, 15, 5, 0, 0, 7); g.fill();
    g.strokeStyle = PAL.woodDark;
    g.lineWidth = 2;
    g.beginPath(); g.ellipse(25, 12, 10, 3.4, 0, 0, 7); g.stroke();
    g.beginPath(); g.ellipse(25, 12, 5, 1.8, 0, 0, 7); g.stroke();
    return c;
  }

  function spriteStone() {
    var c = makeCanvas(75, 36);
    var g = c.getContext('2d');
    for (var i = 0; i < 3; i++) {
      var sx = 6 + i * 24, ss = 16 + (i % 2) * 5;
      g.fillStyle = PAL.stone;
      g.beginPath(); g.ellipse(sx, 24, ss, 9, 0, Math.PI, 2 * Math.PI); g.fill();
      g.fillStyle = PAL.stoneLite;
      g.beginPath(); g.ellipse(sx - 3, 19, ss * 0.5, 3.4, 0, 0, Math.PI); g.fill();
      g.fillStyle = PAL.stone;
    }
    return c;
  }

  function spritePlayer(died) {
    // lumberjack, feet at bottom of 107px body; anchored bottom-centre at use
    var c = makeCanvas(50, 107);
    var g = c.getContext('2d');
    // legs (overalls)
    g.fillStyle = PAL.overalls;
    g.fillRect(10, 62, 12, 30);
    g.fillRect(28, 62, 12, 30);
    // shoes
    g.fillStyle = PAL.shoe;
    g.fillRect(8, 88, 15, 19);
    g.fillRect(27, 88, 15, 19);
    // shirt body
    g.fillStyle = died ? PAL.shirt : PAL.shirt;
    g.beginPath();
    g.moveTo(5, 62);
    g.lineTo(45, 62);
    g.lineTo(43, 26);
    g.lineTo(7, 26);
    g.fill();
    g.fillStyle = PAL.shirtLite;
    g.beginPath();
    g.moveTo(7, 26);
    g.lineTo(43, 26);
    g.lineTo(40, 34);
    g.lineTo(10, 34);
    g.fill();
    // head
    var headColor = died ? '#E7E7E7' : PAL.skin;
    g.fillStyle = headColor;
    g.fillRect(14, 6, 22, 22);
    // hair
    g.fillStyle = '#59412E';
    g.fillRect(14, 6, 22, 6);
    g.fillRect(14, 6, 8, 12);
    // eye
    g.fillStyle = '#3B3B3B';
    g.fillRect(28, 14, 3, 4);
    // axe (raised)
    var ax = 2;
    g.strokeStyle = PAL.axeWood;
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(ax + 4, 96); g.lineTo(ax + 38, 10); g.stroke();
    // axe head
    g.fillStyle = PAL.axe;
    g.beginPath();
    g.moveTo(ax + 36, 8);
    g.lineTo(ax + 48, 16);
    g.lineTo(ax + 38, 24);
    g.lineTo(ax + 30, 14);
    g.closePath(); g.fill();
    g.fillStyle = PAL.white;
    g.beginPath(); g.moveTo(ax + 37, 12); g.lineTo(ax + 44, 15); g.lineTo(ax + 37, 19); g.lineTo(ax + 33, 14); g.closePath(); g.fill();
    if (died) {
      // fallen axe on ground
      g.clearRect(0, 0, 50, 107);
      // body lying rotated
      g.save();
      g.translate(25, 80);
      g.rotate(0.9);
      g.fillStyle = PAL.shirt;
      g.fillRect(-16, -12, 30, 24);
      g.fillStyle = PAL.overalls;
      g.fillRect(-2, -8, 20, 16);
      g.fillStyle = PAL.skin;
      g.fillRect(-20, -10, 12, 12);
      g.fillStyle = '#59412E';
      g.fillRect(-20, -10, 12, 4);
      // axe handle on ground
      g.strokeStyle = PAL.axeWood;
      g.lineWidth = 5;
      g.beginPath(); g.moveTo(10, 4); g.lineTo(30, -10); g.stroke();
      g.fillStyle = PAL.axe;
      g.beginPath();
      g.moveTo(28, -12); g.lineTo(38, -4); g.lineTo(30, 4); g.lineTo(24, -4);
      g.closePath(); g.fill();
      g.restore();
    }
    return c;
  }

  function spriteHandDown() {
    // axe swing overlay (just axe blade near trunk side)
    var c = makeCanvas(59, 9);
    var g = c.getContext('2d');
    g.strokeStyle = PAL.axeWood;
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(2, 4); g.lineTo(34, 4); g.stroke();
    g.fillStyle = PAL.axe;
    g.fillRect(30, 0, 16, 9);
    return c;
  }

  function spriteBgTrees() {
    var c = makeCanvas(750, 260);
    var g = c.getContext('2d');
    g.fillStyle = PAL.bgTrees;
    g.fillRect(0, 0, 750, 260);
    // soft tree silhouettes
    var rows = [
      { y: 200, h: 60, col: '#BCE7F2' },
      { y: 158, h: 102, col: '#AFE0EE' },
      { y: 110, h: 150, col: '#9ED8E8' }
    ];
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      g.fillStyle = row.col;
      for (var x = -40; x < 790; x += 120) {
        g.beginPath();
        g.moveTo(x + 10, row.y);
        g.lineTo(x + 60, row.y - row.h);
        g.lineTo(x + 110, row.y);
        g.fill();
      }
      // ground line at rows base
      g.fillRect(0, row.y, 750, 4);
    }
    return c;
  }

  function spriteCloud() {
    var c = makeCanvas(140, 128);
    var g = c.getContext('2d');
    g.fillStyle = PAL.clouds;
    g.beginPath();
    g.arc(40, 90, 22, 0, 7);
    g.arc(70, 72, 30, 0, 7);
    g.arc(104, 88, 24, 0, 7);
    g.arc(72, 96, 28, 0, 7);
    g.fill();
    return c;
  }

  function spriteGround() {
    var c = makeCanvas(750, 212);
    var g = c.getContext('2d');
    // dirt base
    g.fillStyle = PAL.dirt;
    g.fillRect(0, 0, 750, 212);
    // dirt lite patches
    g.fillStyle = PAL.dirtLite;
    g.fillRect(0, 0, 180, 212);
    g.fillRect(430, 0, 320, 212);
    // grass top strip
    g.fillStyle = PAL.grass;
    g.fillRect(0, 0, 750, 34);
    g.fillStyle = '#C5E89B';
    g.fillRect(0, 0, 750, 10);
    // grass tufts
    g.fillStyle = PAL.grassDark;
    for (var x = 6; x < 750; x += 34) {
      g.beginPath();
      g.moveTo(x, 14); g.lineTo(x + 3, 2); g.lineTo(x + 6, 14);
      g.fill();
    }
    return c;
  }

  // cache sprites (generated fallbacks, swapped after image load)
  var sprites = {
    trunk: spriteTrunk(),
    log: spriteLog(),
    branchL: spriteBranch(-1),
    branchR: spriteBranch(1),
    stump: spriteStump(),
    stone: spriteStone(),
    playerL: spritePlayer(false),
    playerR: spritePlayer(false),
    deadL: spritePlayer(true),
    deadR: spritePlayer(true),
    handDown: spriteHandDown(),
    bg: spriteBgTrees(),
    cloud: spriteCloud(),
    ground: spriteGround()
  };

  var IMG = {
    trunk: 'assets/tree-trunk.jpg',
    log: 'assets/log.jpg',
    branch: 'assets/branch.jpg',
    stump: 'assets/stump.jpg',
    stone: 'assets/stones.jpg',
    player: 'assets/lumberjack-body.jpg',
    dead: 'assets/lumberjack-dead.jpg',
    hand: 'assets/axe-swing.jpg',
    bg: 'assets/bg-tree.jpg',
    cloud: 'assets/cloudes.jpg',
    ground: 'assets/ground.jpg',
    btnL: 'assets/btn-left.jpg',
    btnR: 'assets/btn-right.jpg',
    btnPlay: 'assets/btn-play.jpg',
    btnRefresh: 'assets/btn-refresh.jpg'
  };

  function loadImg(src) {
    return new Promise(function (resolve) {
      var im = new Image();
      im.onload = function () { resolve(im); };
      im.onerror = function () { resolve(null); };
      im.src = src;
    });
  }

  function chromaKey(img, tw, th) {
    if (!img) return null;
    var c = makeCanvas(tw, th);
    var g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.drawImage(img, 0, 0, tw, th);
    var id = g.getImageData(0, 0, tw, th);
    var d = id.data;
    function samp(x, y) {
      var i = (y * tw + x) * 4;
      return [d[i], d[i + 1], d[i + 2]];
    }
    var c0 = samp(0, 0), c1 = samp(tw - 1, 0), c2 = samp(0, th - 1), c3 = samp(tw - 1, th - 1);
    var kr = (c0[0] + c1[0] + c2[0] + c3[0]) / 4;
    var kg = (c0[1] + c1[1] + c2[1] + c3[1]) / 4;
    var kb = (c0[2] + c1[2] + c2[2] + c3[2]) / 4;
    var thresh2 = 52 * 52;
    for (var i = 0; i < d.length; i += 4) {
      var dr = d[i] - kr, dg = d[i + 1] - kg, db = d[i + 2] - kb;
      if (dr * dr + dg * dg + db * db < thresh2) d[i + 3] = 0;
    }
    g.putImageData(id, 0, 0);
    return c;
  }

  function scaleCopy(img, tw, th) {
    if (!img) return null;
    var c = makeCanvas(tw, th);
    var g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.drawImage(img, 0, 0, tw, th);
    return c;
  }

  function flipH(src) {
    if (!src) return src;
    var c = makeCanvas(src.width, src.height);
    var g = c.getContext('2d');
    g.translate(src.width, 0);
    g.scale(-1, 1);
    g.drawImage(src, 0, 0);
    return c;
  }

  function applyBtn(sel, canvas) {
    if (!canvas) return;
    var el = document.querySelector(sel);
    if (!el) return;
    el.style.backgroundImage = 'url(' + canvas.toDataURL('image/png') + ')';
    el.style.backgroundSize = 'contain';
    el.style.backgroundRepeat = 'no-repeat';
    el.style.backgroundPosition = 'center';
  }

  function loadAssets(done) {
    var keys = Object.keys(IMG);
    Promise.all(keys.map(function (k) { return loadImg(IMG[k]); })).then(function (imgs) {
      var map = {};
      keys.forEach(function (k, i) { map[k] = imgs[i]; });
      var t;
      t = scaleCopy(map.trunk, TRUNK_W, TRUNK_H); if (t) sprites.trunk = t;
      t = chromaKey(map.log, 50, 50); if (t) sprites.log = t;
      t = chromaKey(map.branch, 125, 80);
      if (t) { sprites.branchR = t; sprites.branchL = flipH(t); }
      t = chromaKey(map.stump, 50, 60); if (t) sprites.stump = t;
      t = chromaKey(map.stone, 75, 36); if (t) sprites.stone = t;
      t = chromaKey(map.player, 50, 107);
      if (t) { sprites.playerR = t; sprites.playerL = flipH(t); }
      t = chromaKey(map.dead, 50, 107);
      if (t) { sprites.deadR = t; sprites.deadL = flipH(t); }
      t = chromaKey(map.hand, 59, 9); if (t) sprites.handDown = t;
      t = scaleCopy(map.bg, 750, 260); if (t) sprites.bg = t;
      t = chromaKey(map.cloud, 140, 128); if (t) sprites.cloud = t;
      t = scaleCopy(map.ground, 750, 95); if (t) sprites.ground = t;
      applyBtn('.button_left .icon', chromaKey(map.btnL, 60, 60));
      applyBtn('.button_right .icon', chromaKey(map.btnR, 60, 60));
      applyBtn('.button_left .icon_play', chromaKey(map.btnPlay, 60, 60));
      applyBtn('.button_left .icon_refresh', chromaKey(map.btnRefresh, 60, 60));
      done();
    });
  }

  // ------------------------------------------------------------------
  // Ground canvas rendering (result screen)
  // ------------------------------------------------------------------
  function renderGround() {
    g_ctx = makeCanvas(groundCanvas.width, groundCanvas.height);
    var g = g_ctx.getContext('2d');
    g.fillStyle = PAL.sky;
    g.fillRect(0, 0, 750, 212);
    if (sprites.bg) g.drawImage(sprites.bg, 0, 212 - 260);
    if (sprites.ground) g.drawImage(sprites.ground, 0, 212 - 95, 750, 95);
    if (sprites.stone) {
      g.drawImage(sprites.stone, 180, 110);
      g.drawImage(sprites.stone, 470, 110);
    }
    if (sprites.stump) g.drawImage(sprites.stump, 350, 96);
    gctx.clearRect(0, 0, groundCanvas.width, groundCanvas.height);
    gctx.drawImage(g_ctx, 0, 0);
  }

  // ------------------------------------------------------------------
  // Scene render
  // ------------------------------------------------------------------
  function treeX() { return W / 2; }

  function render() {
    var g = ctx;
    // sky
    g.fillStyle = PAL.sky;
    g.fillRect(0, 0, W, H);

    // background forest
    g.fillStyle = PAL.bgTrees;
    g.fillRect(0, 0, W, H);
    g.drawImage(sprites.bg, 0, 0, 750, 260, 0, 0, W, H - 90);

    // clouds drift
    var cx = ((cloudX % (W + 160)) + (W + 160)) % (W + 160) - 160;
    g.drawImage(sprites.cloud, cx, 26);
    g.drawImage(sprites.cloud, (cx + 0.55 * W) % (W + 160) - 160, 60);
    g.drawImage(sprites.cloud, (cx * 0.7 + 0.3 * W) % (W + 160) - 160, 14);

    // ground strip
    var gndY = H - 95;
    g.drawImage(sprites.ground, 0, gndY, W, 95);

    // stones
    g.drawImage(sprites.stone, treeX() - 146, H - 70);
    g.drawImage(sprites.stone, treeX() + 71, H - 70);

    // trunk tiled from stump up
    var sy = H - 105;
    var scroll = (S.drop % TRUNK_H);
    for (var ty = sy - TRUNK_H + scroll; ty > -TRUNK_H; ty -= TRUNK_H) {
      g.drawImage(sprites.trunk, treeX() - TRUNK_W / 2, ty, TRUNK_W, TRUNK_H);
    }

    // stump
    g.drawImage(sprites.stump, treeX() - 25, sy);

    // branches (stack descending with drop)
    for (var i = 0; i < branches.length; i++) {
      var br = branches[i];
      var by = br.y + S.drop;
      if (by > -40 && by < H + 40) {
        var spr = br.side < 0 ? sprites.branchL : sprites.branchR;
        if (br.side < 0) g.drawImage(spr, treeX() - TRUNK_W / 2 - 125 + 8, by - 80);
        else g.drawImage(spr, treeX() + TRUNK_W / 2 - 8, by - 80);
      }
    }

    // falling pieces
    for (var f = 0; f < fallers.length; f++) {
      var fl = fallers[f];
      g.save();
      g.globalAlpha = Math.max(0, fl.alpha);
      g.translate(fl.x, fl.y);
      g.rotate(fl.rot);
      g.scale(fl.scale, fl.scale);
      g.drawImage(fl.img, -fl.img.width / 2, -fl.img.height / 2);
      g.restore();
    }
    g.globalAlpha = 1;

    // player
    var px = treeX() + (S.side || 1) * PLAYER_DX;
    var playerImg = S.over ? (S.side < 0 ? sprites.deadL : sprites.deadR)
      : (S.side < 0 ? sprites.playerL : sprites.playerR);
    g.drawImage(playerImg, px - 25, PLAYER_FOOT_Y - 107);

    // hand down overlay (axe swing)
    if (handDown > 0) {
      var hx = S.side < 0 ? px - 33 : px + 25;
      g.drawImage(sprites.handDown, hx, PLAYER_FOOT_Y - 58);
    }

    // ---- HUD ----
    // timeline
    if (S.cdStarted && !S.over) {
      var frac = S.deadline ? Math.max(0, Math.min(1, (S.deadline - performance.now()) / S.qa)) : 1;
      drawTimeline(frac);
    }
    // score
    drawText(String(S.score), W / 2, 30, 'bold 20px Charter, Georgia, serif', '#FFFFFF', PAL.woodShadow);
    // level
    if (S.levelHold > 0) {
      var lvAlpha = S.levelHold > S.levelHoldTotal - 10 ? (S.levelHoldTotal - S.levelHold) / 10 : 1;
      g.globalAlpha = Math.min(1, lvAlpha);
      drawText('Level ' + S.level, W / 2, 56, 'bold 24px Charter, Georgia, serif', '#FFFFFF', PAL.woodShadow);
      g.globalAlpha = 1;
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

  function drawTimeline(frac) {
    var g = ctx;
    var bw = 100, bh = 21;
    var bx = W / 2 - bw - 60;
    var by = 10;
    // border
    g.fillStyle = PAL.white;
    g.beginPath();
    g.roundRect(bx - 2, by - 2, bw + 4, bh + 4, 8);
    g.fill();
    g.strokeStyle = PAL.woodShadow;
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(bx - 2, by - 2, bw + 4, bh + 4, 8);
    g.stroke();
    // bar fill
    var warn = frac < WARN_FRAC;
    g.fillStyle = warn ? PAL.axe : PAL.leaf;
    g.beginPath();
    g.roundRect(bx, by, bw * frac, 9, 4);
    g.fill();
    if (warn) {
      warnBlink++;
      if (warnBlink % 14 < 7) {
        g.fillStyle = 'rgba(255,255,255,0.6)';
        g.beginPath();
        g.roundRect(bx, by, 8, 9, 4);
        g.fill();
      }
    }
    // cap marker
    g.fillStyle = PAL.white;
    g.fillRect(bx + bw * frac - 1, by - 1, 3, 11);
  }

  // ------------------------------------------------------------------
  // Game logic
  // ------------------------------------------------------------------
  function chop(left) {
    if (!S.started || S.over) return;
    if (!S.inGame) return;

    if (!S.cdStarted) {
      S.cdStarted = true;
      S.deadline = performance.now() + START_MS + GA;
    }

    var b = S.queue[0];
    var wrong = false;
    if (b !== 0) {
      // b<0 = left obstacle; chopping left hits it
      wrong = left === (b < 0);
    }
    if (wrong) {
      doDeath(left);
      return;
    }

    // correct chop
    S.deadline += S.ga;
    var now = performance.now();
    if (S.deadline - now > S.qa) S.deadline = now + S.qa;

    S.score++;
    updateScoreDOM();

    // level up every 20 chops
    if (S.score % LEVEL_EVERY === 0) {
      S.level++;
      S.qa *= LEVEL_FACTOR;
      S.ga *= LEVEL_FACTOR;
      S.levelHold = S.levelHoldTotal = 2200;
    }

    // advance queue — keep tree filled
    if (S.queue.length < 12) {
      var s = Math.random() < 0.5 ? -1 : 1;
      S.queue.push(s, 2 * s);
      var lastY = branches.length ? branches[branches.length - 1].y : (H - 155);
      branches.push({ side: s, y: lastY - 50, kind: 1 });
      branches.push({ side: s, y: lastY - 100, kind: 2 });
    }
    var d = S.queue.shift();
    spawnFalling(left, d);
    if (d !== 0 && branches.length) branches.shift();

    S.side = left ? -1 : 1;
    S.drop += DROP_PER_CHOP;

    // player drop + trunk scroll tween (visual)
    sfx(d === 0 ? 'chop' : (Math.abs(d) === 2 ? 'branch' : 'chop'));
    handDown = 3;
  }

  function spawnFalling(left, d) {
    if (d === 0) return;
    var isBranch = Math.abs(d) === 2;
    var img = isBranch ? (d > 0 ? sprites.branchR : sprites.branchL) : sprites.log;
    var startX = treeX() + (left ? -40 : 40);
    var startY = H - 155;
    var obj = {
      img: img,
      x: startX,
      y: startY,
      rot: 0,
      scale: 1,
      alpha: 1
    };
    fallers.push(obj);
    tween(obj, {
      x: startX + (left ? -110 : 110),
      y: startY - (isBranch ? 30 : 10),
      rot: (left ? -1 : 1) * 1.05,
      scale: 1.2
    }, 24, easeOut, function () {
      var idx = fallers.indexOf(obj);
      if (idx >= 0) fallers.splice(idx, 1);
    }, 0);
    tween(obj, { alpha: 0 }, 12, function (x) { return x; }, null, 12);
  }

  function seedTree() {
    branches.length = 0;
    S.queue = [0, 0];
    S.pa = PA_INIT;
    var y0 = H - 155;
    // two free chops at player height; branches start 100px above
    for (var i = 0; i < 6; i++) {
      var s = Math.random() < 0.5 ? -1 : 1;
      S.queue.push(s, 2 * s);
      branches.push({ side: s, y: y0 - (2 + i * 2) * 50, kind: 1 });
      branches.push({ side: s, y: y0 - (3 + i * 2) * 50, kind: 2 });
      S.pa += 100;
    }
  }

  function doDeath(left) {
    S.inGame = false;
    S.over = true;
    S.side = left ? -1 : 1;
    sfx('death');
    deathT = 26; // ~400ms at 60fps
  }

  function finishDeath() {
    // result screen
    S.over = false;
    wrap.className = 'page_wrap in_result ready';
    showResult();
  }

  // ------------------------------------------------------------------
  // UI / result
  // ------------------------------------------------------------------
  var BEST_KEY = 'lumberjack.best';

  function updateScoreDOM() {
    scoreEl.textContent = String(S.score);
  }

  function showResult() {
    // insert into local highscore
    var best = loadBest();
    best.push({ name: 'You', score: S.score });
    best.sort(function (a, b3) { return b3.score - a.score; });
    best = best.slice(0, 5);
    saveBest(best);
    renderTable(best);
    tableWrapEl.classList.add('opened');
    setTimeout(function () { shareBtn.classList.add('shown'); }, 300);
  }

  function renderTable(best) {
    tableEl.innerHTML = '';
    for (var i = 0; i < best.length; i++) {
      var row = document.createElement('li');
      row.className = 'row' + (best[i].name === 'You' ? ' you' : '');
      var place = document.createElement('span');
      place.className = 'place';
      place.textContent = String(i + 1);
      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = best[i].name;
      var sc = document.createElement('span');
      sc.className = 'score';
      sc.textContent = String(best[i].score);
      row.appendChild(place);
      row.appendChild(name);
      row.appendChild(sc);
      tableEl.appendChild(row);
    }
  }

  function loadBest() {
    try {
      return JSON.parse(localStorage.getItem(BEST_KEY) || '[]');
    } catch (e) { return []; }
  }

  function saveBest(b) {
    try { localStorage.setItem(BEST_KEY, JSON.stringify(b)); } catch (e) {}
  }

  // ------------------------------------------------------------------
  // Start / restart
  // ------------------------------------------------------------------
  function startGame() {
    S.score = 0;
    S.level = 1;
    S.qa = QA;
    S.ga = GA;
    S.drop = 0;
    S.side = 1;
    S.started = true;
    S.inGame = true;
    S.cdStarted = false;
    S.deadline = 0;
    S.levelHold = 0;
    fallers.length = 0;
    seedTree();
    tweens.length = 0;
    deathT = 0;
    updateScoreDOM();
    shareBtn.classList.remove('shown');
    tableWrapEl.classList.remove('opened');
    wrap.className = 'page_wrap ready in_game';
  }

  function setGreet() {
    S.started = false;
    S.inGame = false;
    S.cdStarted = false;
    wrap.className = 'page_wrap in_result in_greet ready';
  }

  function shareScore() {
    var txt = 'I scored ' + S.score + ' in LumberJack!';
    if (navigator.share) {
      navigator.share({ text: txt }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(txt).catch(function () {});
    }
  }

  // ------------------------------------------------------------------
  // Input
  // ------------------------------------------------------------------
  btnLeft.addEventListener('click', function () {
    if (!S.inGame || S.over) startGame();
    else chop(true);
  });
  btnRight.addEventListener('click', function () {
    chop(false);
  });
  shareBtn.addEventListener('click', shareScore);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { chop(true); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { chop(false); e.preventDefault(); }
    else if (e.key === ' ' || e.key === 'Enter') {
      if (!S.inGame) startGame();
      e.preventDefault();
    }
  });

  // ------------------------------------------------------------------
  // Main loop
  // ------------------------------------------------------------------
  S.levelHoldTotal = 0;

  function tick() {
    S.frame++;
    var now = performance.now();

    // countdown
    if (S.inGame && S.cdStarted) {
      if (now >= S.deadline) {
        doDeath(S.side < 0); // died by timeout — fall same facing
      }
    }

    // death sequence
    if (deathT > 0) {
      deathT--;
      if (deathT === 0) finishDeath();
    }

    // level banner
    if (S.levelHold > 0) S.levelHold -= 16.67;

    // clouds drift (0.25 px/frame)
    cloudX -= 0.25;
    if (cloudX < -(W + 160)) cloudX += (W + 160);

    // hand swing
    if (handDown > 0) handDown--;

    updateTweens();
    render();

    requestAnimationFrame(tick);
  }

  // ------------------------------------------------------------------
  // Resize (scale canvas to container, keep logical coords)
  // ------------------------------------------------------------------
  function resize() {
    var displayW = Math.min(600, window.innerWidth);
    var footerH = window.innerHeight <= 480 ? 128 : (window.innerHeight <= 570 ? 188 : 228);
    var gameH = Math.max(220, window.innerHeight - footerH);
    var groundH = Math.round(212 * (displayW / 750));
    canvas.style.width = displayW + 'px';
    canvas.style.height = gameH + 'px';
    groundCanvas.style.width = displayW + 'px';
    groundCanvas.style.height = groundH + 'px';
  }

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------
  renderTable(loadBest());
  resize();
  loadAssets(function () {
    seedTree();
    renderGround();
    requestAnimationFrame(tick);
  });
})();