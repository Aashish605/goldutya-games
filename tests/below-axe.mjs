import { chromium } from 'playwright';

const url = 'file:///D:/vibe_code/Goldutya/goldutya-games/lumberjack.html';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 600, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(url);
await page.waitForFunction(() => window.__lj && window.__lj.state().ready);

// start
await page.evaluate(() => window.__lj.start());

// helper: read state
const st = () => page.evaluate(() => window.__lj.state());

// Force scenario: get to a point where branch is below axe and queue head is obstacle on one side.
// Simpler unit-ish test: inject state via repeated chops until branch below, then chop toward obstacle side.

// Direct test of branchBelowAxe path: manipulate via many free chops scrolling dropW up
// until branches[0] center below cut, then chop the obstacle side and expect no death.

let died = false;
let choppedTowardObstacle = 0;

for (let i = 0; i < 200; i++) {
  const s = await st();
  if (s.over) { died = true; break; }
  const q0 = s.queue[0] || 0;
  // compute if branch below axe from state
  const feet = 672 - 55; // H may differ - use state dropW/pa via branches
  // Prefer: if queue has obstacle, try chopping TOWARD it once when we believe branch is low
  // Get branch world Y from state if exposed
  const below = await page.evaluate(() => {
    const s = window.__lj.state();
    if (!s.branches || !s.branches.length) return false;
    // recompute like game: need playerFeetY - expose via debug? use canvas height - 55
    const H = document.querySelector('canvas').height;
    const feetY = H - 55;
    const by = feetY + s.dropW + s.branches[0].yRel + (s.branches[0].ox || 0);
    const cutY = feetY - 58;
    return (by - 40) > cutY;
  });

  if (q0 !== 0 && below) {
    // chop toward obstacle — should NOT die
    const towardLeft = q0 < 0;
    choppedTowardObstacle++;
    await page.evaluate((l) => window.__lj.chop(l), towardLeft);
    const s2 = await st();
    if (s2.over) { died = true; break; }
    // continue after successful safe chop
    continue;
  }

  // normal: chop away from obstacle or either side if clear
  const awayLeft = q0 > 0; // if obstacle right, chop left
  const useLeft = q0 !== 0 ? awayLeft : (i % 2 === 0);
  await page.evaluate((l) => window.__lj.chop(l), useLeft);
}

const final = await st();
console.log(JSON.stringify({
  died,
  choppedTowardObstacle,
  score: final.score,
  over: final.over,
  dropW: final.dropW,
  queueHead: final.queue[0],
  branchCount: final.branches ? final.branches.length : -1,
  errors,
}, null, 2));

// screenshot
await page.screenshot({ path: 'tests/below-axe-fix.png' });

await browser.close();
process.exit(died ? 1 : 0);
