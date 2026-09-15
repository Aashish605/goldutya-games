const { chromium } = require('playwright');
const path = require('path');

const GAMES = [
  {
    name: 'card-fly',
    prompt: 'A 16:9 widescreen game thumbnail image. Dark navy blue gradient sky background (#0a1526 top to #14406b bottom). Faint cyan grid lines overlay. Two pairs of green gradient pipes with gold caps (top and bottom, creating a gap in the middle). A yellow duck PNG sprite flying between the pipes. A cyan (#56D9FF) curved motion trail behind the duck. Two gold coins floating. Pixel art style. No text.'
  },
  {
    name: 'card-jump',
    prompt: 'A 16:9 widescreen game thumbnail image. Dark blue gradient background (#0b121e to #1d2d4d). Dark mountain silhouettes at bottom (#0A101C). Black ground strip (#0B0B0D) with a thin gold (#F5C518) horizontal line on top. Red triangle spike obstacles (#D42B2B). A yellow duck sprite jumping mid-air. A dashed cyan (#56D9FF) arc trail showing the jump path. A gold star pickup. Pixel art style. No text.'
  },
  {
    name: 'card-clicker',
    prompt: 'A 16:9 widescreen game thumbnail image. Very dark gradient background (#090d16 to #1c1208). Multiple gold coins falling from above. A large gold coin with cyan (#56D9FF) concentric tap ripple circles around it. Gold text "+500" floating. Cyan text "10x COMBO!" floating. A yellow duck with a cyan shield circle around it at the bottom. Pixel art style. No title text.'
  },
  {
    name: 'card-memory',
    prompt: 'A 16:9 widescreen game thumbnail image. Dark purple gradient background (#0d0b18 to #18122B). A grid of glowing square cards with gold (#F5C518) borders. Some cards show emoji faces (duck, coin, crown, star) on dark background. Some cards are face-down with gold border. Matched cards have cyan (#56D9FF) glowing borders. Three gold star rating at top. Pixel art style. No title text.'
  },
  {
    name: 'card-snake',
    prompt: 'A 16:9 widescreen game thumbnail image. Very dark background (#080c14) with faint white grid lines. A snake made of connected gold (#F5C518) rounded square blocks trailing across the grid, each block slightly more transparent toward the tail. A yellow duck head as the snake head. A cyan (#56D9FF) star food item. A gold coin food item. Pixel art retro style. No text.'
  },
  {
    name: 'card-breakout',
    prompt: 'A 16:9 widescreen game thumbnail image. Dark blue gradient background (#0a101d to #151c2e). Rows of colorful bricks at top (red #D42B2B, gold #F5C518, yellow #FFDF59, green #22C55E, cyan #56D9FF). A gold ball bouncing with a gold trail line. A gold rounded paddle at the bottom with cyan (#56D9FF) glow border. Some bricks broken with gaps. Pixel art arcade style. No text.'
  }
];

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.newPage();

  console.log('Navigating to Gemini...');
  await page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  const inputSelector = 'rich-textarea div[contenteditable="true"], div[contenteditable="true"]';

  for (const game of GAMES) {
    console.log('\n========================================');
    console.log('Generating:', game.name);

    try {
      await page.waitForSelector(inputSelector, { timeout: 10000 });
      await page.click(inputSelector);
      await page.fill(inputSelector, game.prompt);
      await page.waitForTimeout(500);
      await page.keyboard.press('Enter');
      console.log('Prompt sent. Waiting 30s for image...');
      await page.waitForTimeout(30000);

      const imgInfo = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img'));
        const candidates = imgs.filter(i =>
          i.width > 200 &&
          i.height > 150 &&
          !i.src.includes('googleusercontent.com/a/') &&
          !i.src.includes('gstatic.com') &&
          !i.src.includes('lh3.googleusercontent.com')
        );
        if (candidates.length === 0) return null;
        const last = candidates[candidates.length - 1];
        return { src: last.src, w: last.width, h: last.height };
      });

      if (imgInfo) {
        console.log('Found image (' + imgInfo.w + 'x' + imgInfo.h + ')');
        const el = await page.$('img[src="' + imgInfo.src + '"]');
        if (el) {
          const outPath = path.join('D:\\vibe_code\\Goldutya\\goldutya-games\\assets', game.name + '.png');
          await el.screenshot({ path: outPath, type: 'png' });
          console.log('SAVED:', outPath);
        }
      } else {
        console.log('No image found for', game.name);
      }

      await page.waitForTimeout(2000);
    } catch (err) {
      console.log('Error:', err.message);
    }
  }

  console.log('\nALL 6 CARD IMAGES PROCESSED!');
  browser.close();
})();
