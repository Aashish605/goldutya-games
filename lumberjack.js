/* Goldutya LumberJack — matches original tbot layout (600×672 canvas + footer) */
(function () {
  'use strict';

  var W = 600, H = 672;
  var QA = 8500, GA = 250, START_MS = 4250;
  var WARN_FRAC = 0.25, LEVEL_EVERY = 20, LEVEL_FACTOR = 0.95;
  var TRUNK_W = 50, TRUNK_H = 375, BRANCH_W = 125, BRANCH_H = 80;

  var GROUND_Y = H - 95;
  var GROUND_BG_X = 139, GROUND_RIGHT_W = 195;
  var STUMP_X = W / 2 - 25, STUMP_Y = H - 105;
  var PLAYER_FEET_Y = H - 55, PLAYER_DX = 35;

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

  var ASSETS = {
    bg_clouds:  { src: 'assets/lumberjack/bg_clouds.svg',  w: 475, h: 128 },
    bg_trees:   { src: 'assets/lumberjack/bg_trees.svg',   w: 420, h: 140 },
    bg_bottom:  { src: 'assets/lumberjack/bg_bottom.svg',  w: 210, h: 90  },
    ground_left:{ src: 'assets/lumberjack/ground_left.svg',w: 140, h: 95  },
    ground_right:{src: 'assets/lumberjack/ground_right.svg',w: 195, h: 95 },
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

  var imgs = {}, loaded = 0, totalAssets = Object.keys(ASSETS).length;

  function loadAll(cb) {
    Object.keys(ASSETS).forEach(function (k) {
      var img = new Image();
      img.onload = function () { imgs[k] = img; loaded++; if (loaded >= totalAssets) cb(); };
      img.onerror = function () { loaded++; if (loaded >= totalAssets) cb(); };
      img.src = ASSETS[k].src;
    });
  }

  function spr(k, g, x, y, flip) {
    var a = ASSETS[k];
    if (!imgs[k]) return;
    if (flip) { g.save(); g.translate(x + a.w, y); g.scale(-1, 1); g.drawImage(imgs[k], 0, 0, a.w, a.h); g.restore(); }
    else { g.drawImage(imgs[k], 0, 0, a.w, a.h, x, y, a.w, a.h); }
  }

  var S = { queue:[0,0], pa:100, drop:0, side:-1, started:false, inGame:false,
    cdStarted:false, deadline:0, frame:0, score:0, level:1, qa:QA, ga:GA,
    levelHold:0, over:false, ready:false };

  var branches=[], fallers=[], deathT=0, levelHoldTotal=0, levelBanner=null,
      warnBlink=0, cloudX=0, lastFrame=0, handAnimAt=0;

  // Audio
  var aCtx=null;
  function audio(){ if(!aCtx)try{aCtx=new(window.AudioContext||window.webkitAudioContext)()}catch(e){} return aCtx; }
  function blip(f,d,type,v,s){var ac=audio();if(!ac)return;try{var o=ac.createOscillator(),g=ac.createGain(),t=ac.currentTime;o.type=type||'sine';o.frequency.setValueAtTime(f,t);if(s)o.frequency.exponentialRampToValueAtTime(s,t+d);g.gain.setValueAtTime(v||.2,t);g.gain.exponentialRampToValueAtTime(.001,t+d);o.connect(g);g.connect(ac.destination);o.start(t);o.stop(t+d)}catch(e){}}
  function noise(f,d,v){var ac=audio();if(!ac)return;try{var l=Math.floor(ac.sampleRate*d),b=ac.createBuffer(1,l,ac.sampleRate),c=b.getChannelData(0);for(var i=0;i<l;i++)c[i]=(Math.random()*2-1)*(1-i/l);var s=ac.createBufferSource();s.buffer=b;var fl=ac.createBiquadFilter();fl.type='bandpass';fl.frequency.value=f;fl.Q.value=1.2;var g=ac.createGain();g.gain.value=v||.18;s.connect(fl);fl.connect(g);g.connect(ac.destination);s.start()}catch(e){}}
  function sfxChop(){noise(2100,.08,.22);blip(150,.1,'sine',.25,65)}
  function sfxBranch(){blip(320,.12,'triangle',.2,90)}
  function sfxDeath(){blip(260,.4,'sawtooth',.2,40);noise(700,.3,.15)}
  function sfxThud(){blip(90,.12,'sine',.3,50)}

  // Leaderboard
  function loadBest(){try{return JSON.parse(localStorage.getItem(BEST_KEY)||'[]')}catch(e){return[]}}
  function saveBest(b){try{localStorage.setItem(BEST_KEY,JSON.stringify(b))}catch(e){}}
  function submitScore(){var b=loadBest();b.push({name:'You',score:S.score});b.sort(function(a,c){return c.score-a.score});b=b.slice(0,5);saveBest(b);renderLeaderboard(b)}
  function renderLeaderboard(b){if(!b)b=loadBest();if(!b.length){leaderboardEl.innerHTML='';return}var h='<div class="lb-title">LEADERBOARD</div><ul class="lb-list">';for(var i=0;i<b.length;i++)h+='<li class="lb-row'+(b[i].name==='You'?' you':'')+'"><span class="lb-place">'+(i+1)+'</span><span class="lb-name">'+esc(b[i].name)+'</span><span class="lb-score">'+b[i].score+'</span></li>';h+='</ul>';leaderboardEl.innerHTML=h}
  function esc(s){return String(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}

  // Countdown
  function startCountdown(){S.cdStarted=true;S.deadline=performance.now()+START_MS}
  function onChopCountdown(){if(!S.cdStarted){startCountdown();return}S.deadline=Math.min(S.deadline+S.ga,performance.now()+S.qa)}
  function updateCountdown(){if(!S.inGame||!S.cdStarted||S.over)return;if(performance.now()>=S.deadline)doDeath(S.side<0)}

  // Queue + branches
  function pushPair(){var s=Math.random()<.5?-1:1;S.queue.push(s,2*s);S.pa+=100;var y=branches.length?branches[branches.length-1].y:(STUMP_Y+80);branches.push({side:s,y:y-100})}
  function seedTree(){S.queue=[0,0];S.pa=100;branches=[];var y=STUMP_Y+80;for(var i=0;i<6;i++){var s=Math.random()<.5?-1:1;y-=100;branches.push({side:s,y:y});if(i%2===1){S.queue.push(s,2*s);S.pa+=100}}}

  // Chopping
  function chop(left){
    if(!S.inGame||S.over||!S.ready)return;
    S.side=left?-1:1;
    var d=S.queue.shift();
    if(S.queue.length%2===1)pushPair();
    if(d!==0){var obsLeft=d<0;if(obsLeft===left){spawnFalling(d);sfxBranch();doDeath(left,d);return}}
    S.score++;handAnimAt=S.frame;onChopCountdown();sfxChop();sfxThud();
    if(S.score%LEVEL_EVERY===0){S.level++;S.qa*=LEVEL_FACTOR;S.ga*=LEVEL_FACTOR;S.levelHold=levelHoldTotal=2000}
    if(branches.length&&d!==0)spawnFalling(d);
    if(branches.length)branches.shift();
    S.drop+=50;
  }
  function spawnFalling(d){var piece=Math.abs(d)==='2'?'branch':'log';var dir=d<0?-1:1;fallers.push({kind:piece,x:W/2+dir*45,y:STUMP_Y-60,vx:dir*130,rot:0,vr:dir<0?.12:-.12,alpha:1,t:0,T:24,side:dir})}
  function doDeath(left,d){if(S.over)return;S.over=true;S.inGame=false;sfxDeath();deathT=26}
  function finishDeath(){S.cdStarted=false;S.started=false;submitScore();overlayTitle.textContent='GAME OVER';overlaySub.innerHTML='You scored <b>'+S.score+'</b> chops!';startBtn.textContent='PLAY AGAIN';shareBtn.style.display='';showOverlay()}

  var levelBanner=null;

  // Overlay
  var overlayDuck=document.querySelector('.overlay-duck-img');
  function showOverlay(){overlay.classList.remove('hidden')}
  function hideOverlay(){overlay.classList.add('hidden')}
  function startGame(){if(!S.ready)return;S.score=0;S.level=1;S.qa=QA;S.ga=GA;S.drop=0;S.side=-1;S.started=true;S.inGame=true;S.cdStarted=false;S.deadline=0;S.over=false;S.levelHold=0;deathT=0;fallers.length=0;seedTree();hideOverlay()}
  function shareScore(){var t='I scored '+S.score+' in LumberJack on Goldutya!';if(navigator.share)navigator.share({text:t}).catch(function(){});else if(navigator.clipboard)navigator.clipboard.writeText(t).catch(function(){})}

  // Input
  function bindBtn(el,left){el.addEventListener('click',function(e){e.preventDefault();if(!S.inGame||S.over)return;chop(left)});el.addEventListener('touchstart',function(e){if(S.inGame&&!S.over)e.preventDefault()},{passive:false})}
  bindBtn(btnLeft,true);bindBtn(btnRight,false);
  document.addEventListener('keydown',function(e){if(e.key==='ArrowLeft'){if(S.inGame&&!S.over)chop(true);e.preventDefault()}else if(e.key==='ArrowRight'){if(S.inGame&&!S.over)chop(false);e.preventDefault()}else if(e.key===' '||e.key==='Enter'){if(!S.inGame||S.over){e.preventDefault();startGame()}}});
  startBtn.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();startGame()});
  shareBtn.addEventListener('click',shareScore);

  // Main loop
  function tick(now){
    if(!lastFrame)lastFrame=now;var dt=now-lastFrame;lastFrame=now;
    S.frame++;updateCountdown();
    if(deathT>0){deathT--;if(deathT===0)finishDeath()}
    if(S.levelHold>0)S.levelHold-=dt;
    if(levelBanner){levelBanner.t++;if(levelBanner.t>=levelBanner.T){levelBanner=null}else{levelBanner.a=levelBanner.t/levelBanner.T}}
    cloudX=(cloudX+dt*.02*(S.inGame&&!S.over?1.6:.7))%W;
    for(var i=fallers.length-1;i>=0;i--){var fl=fallers[i];fl.t++;if(fl.t>=fl.T){fallers.splice(i,1);continue}var k=fl.t/fl.T;fl.x+=fl.vx/60;fl.y+=(k<.5?-.4:.6)*3;fl.rot+=fl.vr;if(k>.5)fl.alpha=1-(k-.5)*2}
    render();requestAnimationFrame(tick);
  }

  // Render
  function render(){
    var g=ctx;
    // sky
    g.fillStyle='#C7F0F9';g.fillRect(0,0,W,H);
    // clouds
    var clw=ASSETS.bg_clouds.w;
    for(var cx=(-clw+(cloudX%clw));cx<W;cx+=clw)spr('bg_clouds',g,cx,15);
    // bg trees
    var btw=ASSETS.bg_trees.w;
    for(var bx=(-btw+(cloudX*.35%btw));bx<W;bx+=btw)spr('bg_trees',g,bx,H-140);
    // bg bottom
    var bbw=ASSETS.bg_bottom.w;
    for(var bb=(-bbw+(cloudX*.55%bbw));bb<W;bb+=bbw)spr('bg_bottom',g,bb,H-130);
    // ground: left slab + right slab + solid fill
    spr('ground_left',g,0,GROUND_Y);
    spr('ground_right',g,W-GROUND_RIGHT_W,GROUND_Y);
    var gapW=W-GROUND_BG_X-GROUND_RIGHT_W;
    g.fillStyle='#AEDD7F';g.fillRect(GROUND_BG_X,GROUND_Y,gapW,38);
    g.fillStyle='#91664A';g.fillRect(GROUND_BG_X,GROUND_Y+38,gapW,57);
    // trunk (static)
    var trunkTop=STUMP_Y-TRUNK_H;
    for(var ty=trunkTop;ty>-TRUNK_H;ty-=TRUNK_H)spr('trunk',g,W/2-TRUNK_W/2,ty);
    // stump
    spr('stumb',g,STUMP_X,STUMP_Y);
    // branches
    for(var i=0;i<branches.length;i++){var br=branches[i];var by=br.y+S.drop;if(by>-BRANCH_H&&by<STUMP_Y+20){if(br.side<0)spr('branch',g,W/2-TRUNK_W/2-BRANCH_W+15,by-BRANCH_H,true);else spr('branch',g,W/2+TRUNK_W/2-15,by-BRANCH_H)}}
    // falling pieces
    for(var f=0;f<fallers.length;f++){var fl=fallers[f];g.save();g.globalAlpha=Math.max(0,Math.min(1,fl.alpha));g.translate(fl.x,fl.y);g.rotate(fl.rot);g.scale(fl.side<0?-1:1,1);spr(fl.kind==='branch'?'branch':'log',g,-62,-40);g.restore()}
    // player
    if(S.ready&&!S.over){var px=W/2+(S.side<0?-PLAYER_DX:PLAYER_DX);var flip=S.side>0;var bodyX=px;var bodyY=PLAYER_FEET_Y-107;spr('lumber_body',g,bodyX,bodyY,flip);var recent=(S.frame-handAnimAt)<6&&S.started;if(recent)spr('hand_up',g,bodyX+(flip?6:26),bodyY-55,flip);else spr('hand_down',g,bodyX+(flip?8:28),bodyY-52,flip)}
    if(S.over)spr('lumber_died',g,W/2-35,PLAYER_FEET_Y-85,S.side>0);
    // HUD
    drawHud(g);
  }

  var handAnimAt=0;

  function drawHud(g){
    drawText(String(S.score),W/2,30,'bold 20px Charter, Georgia, serif','#FFFFFF','#886332');
    if(S.levelHold>0||levelBanner){var a=levelBanner?levelBanner.a:1;g.globalAlpha=Math.min(1,a);drawText('Level '+S.level,W/2,56,'bold 24px Charter, Georgia, serif','#FFFFFF','#886332');g.globalAlpha=1}
    if(S.cdStarted&&!S.over){var frac=S.deadline?Math.max(0,Math.min(1,(S.deadline-performance.now())/S.qa)):1;drawTimeline(frac)}
  }
  function drawTimeline(frac){var g=ctx;var bx=W/2-110,by=12;spr('timeline',g,bx-2,by-3);var warn=frac<WARN_FRAC;if(warn){warnBlink++;spr(warnBlink%14<7?'timeline_warn':'timeline_bar',g,bx+6,by+4)}else spr('timeline_bar',g,bx+6,by+4)}
  function drawText(txt,x,y,font,fill,shadow){var g=ctx;g.font=font;g.textAlign='center';g.textBaseline='top';g.fillStyle=shadow;g.fillText(txt,x+2,y+2);g.fillStyle=fill;g.fillText(txt,x,y)}

  // Resize — match reference: canvas fills above footer
  function resize(){
    var maxW=Math.min(600,window.innerWidth);
    var footerH=window.innerHeight<=570?188:228;
    var availH=window.innerHeight-footerH;
    var scale=Math.min(maxW/W,availH/H);
    canvas.style.width=Math.floor(W*scale)+'px';
    canvas.style.height=Math.floor(H*scale)+'px';
    canvas.width=W;canvas.height=H;
  }

  // Boot
  loadAll(function(){resize();window.addEventListener('resize',resize);window.addEventListener('orientationchange',resize);S.ready=true;seedTree();renderLeaderboard();if(typeof Difficulty!=='undefined')Difficulty.renderPicker(diffPicker,'lumberjack',function(){if(typeof TG!=='undefined')TG.haptic('light')});showOverlay();requestAnimationFrame(tick)});
})();
