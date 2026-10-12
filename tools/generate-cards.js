const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const GAMES = [
  {
    name: 'card-fly',
    title: 'DUCK FLY',
    cat: 'ARCADE',
    draw: (ctx, w, h) => {
      // Sky Gradient
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#0a1526');
      grad.addColorStop(0.6, '#0d1f3c');
      grad.addColorStop(1, '#14406b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Grid Pattern
      ctx.strokeStyle = 'rgba(86,217,255,0.08)';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); strokeCtx(ctx); }
      for (let y = 0; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); strokeCtx(ctx); }

      // Gold Pipes
      drawPipe(ctx, 140, 0, 75, 150, true);
      drawPipe(ctx, 140, 310, 75, 230, false);

      drawPipe(ctx, 660, 0, 75, 210, true);
      drawPipe(ctx, 660, 370, 75, 170, false);

      // Duck
      drawDuck(ctx, 390, 230, 70, -12);

      // Flying trail
      ctx.strokeStyle = 'rgba(86,217,255,0.6)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(320, 245);
      ctx.quadraticCurveTo(280, 260, 220, 240);
      ctx.stroke();

      // Coins
      drawCoin(ctx, 510, 150, 20);
      drawCoin(ctx, 550, 220, 16);
    }
  },
  {
    name: 'card-jump',
    title: 'DUCK JUMP',
    cat: 'RUNNER',
    draw: (ctx, w, h) => {
      // Background
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#0b121e');
      grad.addColorStop(0.7, '#121d33');
      grad.addColorStop(1, '#1d2d4d');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Mountains
      ctx.fillStyle = '#0A101C';
      ctx.beginPath();
      ctx.moveTo(0, 380); ctx.lineTo(120, 290); ctx.lineTo(280, 380); ctx.lineTo(440, 250); ctx.lineTo(640, 380); ctx.lineTo(800, 270); ctx.lineTo(960, 380); ctx.lineTo(960, 540); ctx.lineTo(0, 540);
      ctx.fill();

      // Ground
      ctx.fillStyle = '#0B0B0D';
      ctx.fillRect(0, 430, w, 110);
      ctx.strokeStyle = '#F5C518';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(0, 430); ctx.lineTo(w, 430); ctx.stroke();

      // Obstacle Spikes
      ctx.fillStyle = '#D42B2B';
      ctx.beginPath();
      ctx.moveTo(600, 430); ctx.lineTo(630, 370); ctx.lineTo(660, 430);
      ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#0B0B0D'; ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(820, 430); ctx.lineTo(845, 385); ctx.lineTo(870, 430);
      ctx.fill(); ctx.stroke();

      // Duck Jumping
      drawDuck(ctx, 360, 220, 75, -20);

      // Jump Arc
      ctx.strokeStyle = 'rgba(86,217,255,0.7)';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 8]);
      ctx.beginPath(); ctx.moveTo(180, 420); ctx.quadraticCurveTo(300, 160, 400, 280); ctx.stroke();
      ctx.setLineDash([]);

      // Star Pickup
      drawStar(ctx, 420, 140, 22, '#FFDF59');
    }
  },
  {
    name: 'card-clicker',
    title: 'GOLD RUSH',
    cat: 'TAP-TO-EARN',
    draw: (ctx, w, h) => {
      // Dark gradient
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#090d16');
      grad.addColorStop(0.5, '#141824');
      grad.addColorStop(1, '#1c1208');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Coins falling
      drawCoin(ctx, 180, 110, 32);
      drawCoin(ctx, 480, 170, 48); // Main tap target
      drawCoin(ctx, 780, 130, 28);
      drawCoin(ctx, 320, 260, 24);

      // Tap ripple
      ctx.strokeStyle = '#56D9FF';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(480, 170, 68, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(86,217,255,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(480, 170, 88, 0, Math.PI * 2); ctx.stroke();

      // Score Popups
      ctx.font = '700 42px "Bebas Neue", sans-serif';
      ctx.fillStyle = '#FFDF59';
      ctx.fillText('+500', 570, 130);

      ctx.font = '700 32px "Bebas Neue", sans-serif';
      ctx.fillStyle = '#56D9FF';
      ctx.fillText('10x COMBO!', 120, 220);

      // Duck with Shield at bottom
      ctx.strokeStyle = '#56D9FF';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(480, 430, 75, 0, Math.PI * 2); ctx.stroke();

      drawDuck(ctx, 480, 420, 75, 0);
    }
  },
  {
    name: 'card-memory',
    title: 'MEMORY MATCH',
    cat: 'PUZZLE',
    draw: (ctx, w, h) => {
      // Dark Gradient
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#0d0b18');
      grad.addColorStop(1, '#18122B');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // 4 Cards Array
      const cards = [
        { x: 180, y: 150, face: '🦆', matched: true },
        { x: 370, y: 150, face: '🪙', matched: false },
        { x: 560, y: 150, face: '🦆', matched: true },
        { x: 750, y: 150, face: '👑', matched: false },
        { x: 275, y: 350, face: '👑', matched: false },
        { x: 465, y: 350, face: '⭐', matched: false },
        { x: 655, y: 350, face: '🪙', matched: false },
      ];

      for (const c of cards) {
        ctx.fillStyle = c.matched ? '#181B28' : '#F5C518';
        ctx.strokeStyle = '#F5C518';
        ctx.lineWidth = 3;
        ctx.beginPath();
        roundRect(ctx, c.x - 65, c.y - 80, 130, 160, 16);
        ctx.fill(); ctx.stroke();

        if (c.matched) {
          ctx.font = '64px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(c.face, c.x, c.y);

          // Glowing border
          ctx.strokeStyle = '#56D9FF';
          ctx.lineWidth = 4;
          ctx.stroke();
        } else {
          // Card back pattern
          ctx.font = '48px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🦆', c.x, c.y);
        }
      }

      // Star rating banner
      ctx.font = '42px sans-serif';
      ctx.fillText('⭐⭐⭐', 480, 50);
    }
  },
  {
    name: 'card-snake',
    title: 'DUCK SNAKE',
    cat: 'CLASSIC',
    draw: (ctx, w, h) => {
      // Dark grid
      ctx.fillStyle = '#080c14';
      ctx.fillRect(0, 0, w, h);

      const cs = 45;
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += cs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); strokeCtx(ctx); }
      for (let y = 0; y < h; y += cs) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); strokeCtx(ctx); }

      // Snake body (gold blocks trailing)
      const snake = [
        { x: 12, y: 5 },
        { x: 11, y: 5 },
        { x: 10, y: 5 },
        { x: 9, y: 5 },
        { x: 9, y: 6 },
        { x: 9, y: 7 },
        { x: 8, y: 7 },
        { x: 7, y: 7 },
      ];

      for (let i = snake.length - 1; i >= 1; i--) {
        const s = snake[i];
        const px = s.x * cs + 4;
        const py = s.y * cs + 4;
        const alpha = 1 - (i / snake.length) * 0.5;
        ctx.fillStyle = '#F5C518';
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        roundRect(ctx, px, py, cs - 8, cs - 8, 8);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Snake head (Duck)
      drawDuck(ctx, snake[0].x * cs + cs/2, snake[0].y * cs + cs/2, 40, 0);

      // Food
      drawStar(ctx, 16 * cs + cs/2, 5 * cs + cs/2, 18, '#56D9FF');
      drawCoin(ctx, 12 * cs + cs/2, 8 * cs + cs/2, 16);
    }
  },
  {
    name: 'card-breakout',
    title: 'BREAKOUT',
    cat: 'ACTION',
    draw: (ctx, w, h) => {
      // Dark background
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#0a101d');
      grad.addColorStop(1, '#151c2e');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Bricks grid
      const cols = 10, rows = 5;
      const bw = 84, bh = 28, gap = 8, startY = 70, startX = 22;
      const colors = ['#D42B2B', '#F5C518', '#FFDF59', '#22C55E', '#56D9FF'];

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (r === 2 && c === 4) continue; // broken brick
          if (r === 1 && c === 5) continue;
          const px = startX + c * (bw + gap);
          const py = startY + r * (bh + gap);
          ctx.fillStyle = colors[r % colors.length];
          ctx.beginPath();
          roundRect(ctx, px, py, bw, bh, 6);
          ctx.fill();
        }
      }

      // Ball with trail
      ctx.strokeStyle = 'rgba(245,197,24,0.5)';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(420, 360); ctx.lineTo(390, 410); ctx.stroke();

      drawCoin(ctx, 420, 360, 14);

      // Paddle
      ctx.fillStyle = '#F5C518';
      ctx.beginPath();
      roundRect(ctx, 330, 450, 180, 24, 12);
      ctx.fill();

      // Laser glow on paddle
      ctx.strokeStyle = '#56D9FF';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }
];

// Helper functions
function strokeCtx(ctx) { ctx.stroke(); }

function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
}

function drawDuck(ctx, x, y, size, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((angle * Math.PI) / 180);

  // Body
  ctx.fillStyle = '#F5C518';
  ctx.strokeStyle = '#0B0B0D';
  ctx.lineWidth = size * 0.07;
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.5, size * 0.38, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // Head
  ctx.beginPath();
  ctx.arc(size * 0.28, -size * 0.2, size * 0.28, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // Eye
  ctx.fillStyle = '#0B0B0D';
  ctx.beginPath();
  ctx.arc(size * 0.36, -size * 0.26, size * 0.07, 0, Math.PI * 2);
  ctx.fill();

  // Beak
  ctx.fillStyle = '#D42B2B';
  ctx.beginPath();
  ctx.moveTo(size * 0.5, -size * 0.16);
  ctx.quadraticCurveTo(size * 0.75, -size * 0.12, size * 0.65, 0);
  ctx.quadraticCurveTo(size * 0.5, -size * 0.04, size * 0.5, -size * 0.16);
  ctx.fill(); ctx.stroke();

  ctx.restore();
}

function drawCoin(ctx, x, y, r) {
  ctx.save();
  ctx.fillStyle = '#F5C518';
  ctx.strokeStyle = '#0B0B0D';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  ctx.fillStyle = '#FFDF59';
  ctx.beginPath(); ctx.arc(x, y, r * 0.65, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawStar(ctx, cx, cy, r, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });

  for (const g of GAMES) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Mono:wght@700&display=swap" rel="stylesheet">
        <style>
          body { margin: 0; padding: 0; background: #0B0B0D; overflow: hidden; font-family: 'Space Mono', monospace; }
          canvas { width: 960px; height: 540px; display: block; }
        </style>
      </head>
      <body>
        <canvas id="c" width="960" height="540"></canvas>
      </body>
      </html>
    `;
    await page.setContent(html);

    await page.evaluate((gameData) => {
      const canvas = document.getElementById('c');
      const ctx = canvas.getContext('2d');

      // Reconstruct draw
      const fn = new Function('ctx', 'w', 'h', 'drawDuck', 'drawCoin', 'drawStar', 'roundRect', 'strokeCtx', gameData.drawBody);
      fn(ctx, 960, 540, drawDuck, drawCoin, drawStar, roundRect, strokeCtx);

      // Render Badge Top Left
      ctx.fillStyle = 'rgba(11,11,13,0.82)';
      ctx.strokeStyle = '#F5C518';
      ctx.lineWidth = 3;
      ctx.beginPath();
      roundRect(ctx, 30, 30, 160, 44, 22);
      ctx.fill(); ctx.stroke();

      ctx.font = '700 18px "Space Mono", monospace';
      ctx.fillStyle = '#F5C518';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(gameData.cat, 110, 52);

    }, {
      cat: g.cat,
      drawBody: g.draw.toString().replace(/^function\s*\([^\)]*\)\s*\{/, '').replace(/\}$/, '')
    });

    const outPath = path.join('D:\\vibe_code\\Goldutya\\goldutya-games\\assets', g.name + '.png');
    await page.screenshot({ path: outPath, type: 'png' });
    console.log('Generated PNG card:', g.name + '.png');
  }

  await browser.close();
  console.log('ALL_CARDS_GENERATED_SUCCESSFULLY');
})();
