import { chromium } from 'playwright';

const url = 'file:///D:/vibe_code/Goldutya/goldutya-games/lumberjack.html';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 600, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(url);
await page.waitForFunction(() => window.__lj && window.__lj.state().ready);
await page.evaluate(() => window.__lj.start());

// Chop until queue head is obstacle AND branch NOT below axe, then chop toward → must die
let died = false;
let tested = 0;
for (let i = 0; i < 80; i++) {
  const s = await page.evaluate(() => window.__lj.state());
  if (s.over) break;
  const q0 = s.queue[0] || 0;
  const below = await page.evaluate(() => {
    const s = window.__lj.state();
    if (!s.branches || !s.branches.length) return false;
    const H = document.querySelector('canvas').height;
    const feetY = H - 55;
    const by = feetY + s.dropW + s.branches[0].yRel + (s.branches[0].ox || 0);
    return (by - 40) > (feetY - 58);
  });
  if (q0 !== 0 && !below) {
    // chop toward obstacle — must die
    await page.evaluate((l) => window.__lj.chop(l), q0 < 0);
    tested++;
    const s2 = await page.evaluate(() => window.__lj.state());
    died = s2.over;
    break;
  }
  // free path: chop away or either if clear
  const useLeft = q0 > 0 ? true : q0 < 0 ? false : (i % 2 === 0);
  await page.evaluate((l) => window.__lj.chop(l), useLeft);
}

console.log(JSON.stringify({ died, tested, errors }, null, 2));
await browser.close();
process.exit(died ? 0 : 1);
