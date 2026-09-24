import { chromium } from 'playwright';

const base = 'file:///D:/vibe_code/Goldutya/goldutya-games';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 400, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(base + '/lumberjack.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(700);

const greet = await page.evaluate(() => ({
  best: document.getElementById('best')?.textContent,
  label: document.getElementById('score_label')?.textContent,
  hasLb: !!document.getElementById('leaderboard'),
  tg: typeof TG !== 'undefined',
  lb: typeof Leaderboard !== 'undefined',
  ready: document.getElementById('page_wrap')?.className,
}));

await page.evaluate(() => {
  localStorage.setItem('goldutya-lumberjack-best', '42');
  localStorage.setItem('goldutya-player-name', 'TestUser');
  localStorage.setItem('goldutya-leaderboard', JSON.stringify({
    lumberjack: [{ score: 42, name: 'TestUser', userId: 0, avatar: '', date: Date.now() }],
  }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(500);

const afterReload = await page.evaluate(() => ({
  best: document.getElementById('best')?.textContent,
  storedBest: localStorage.getItem('goldutya-lumberjack-best'),
}));

// start + force death path via chopping into obstacle is hard; call internals by simulating result state
// Use __lj.start then evaluate death by triggering submitScore path through public API:
// Start game, set score via repeated safe chops is flaky — instead call doDeath via keyboard after start
await page.evaluate(() => { window.__lj.start(); });
await page.waitForTimeout(200);
// Force result: flip started/over via private is not exposed; drive via synthetic death:
// chop into known obstacle using state queue
const deathAttempt = await page.evaluate(async () => {
  const st = window.__lj.state();
  // queue head toward which side?
  const head = st.queue[0] || 0;
  // chop opposite of head to survive, or toward to die — aim death: chop toward head if nonzero
  if (head !== 0) {
    window.__lj.chop(head < 0);
  } else {
    // free chops until nonzero head
    for (let i = 0; i < 50 && window.__lj.state().queue[0] === 0; i++) {
      window.__lj.chop(false);
    }
    const h = window.__lj.state().queue[0] || 0;
    if (h !== 0) window.__lj.chop(h < 0);
  }
  await new Promise((r) => setTimeout(r, 600));
  const s = window.__lj.state();
  return { over: s.over, score: s.score };
});

const result = await page.evaluate(() => ({
  label: document.getElementById('score_label')?.textContent,
  best: document.getElementById('best')?.textContent,
  wrapOpened: document.getElementById('table_wrap')?.classList.contains('opened'),
  lbHtml: document.getElementById('leaderboard')?.innerHTML?.slice(0, 300),
  inResult: document.getElementById('page_wrap')?.classList.contains('in_result'),
  scoreValue: document.getElementById('score_value')?.textContent,
}));

// hub
const p2 = await browser.newPage();
const hubErrors = [];
p2.on('pageerror', (e) => hubErrors.push(String(e)));
await p2.goto(base + '/index.html', { waitUntil: 'networkidle' });
await p2.waitForTimeout(300);
const cards = await p2.evaluate(() =>
  Array.from(document.querySelectorAll('a.game-card')).map((a) => a.getAttribute('href'))
);
const lj = await p2.evaluate(() => {
  const a = document.querySelector('a[href="lumberjack.html"]');
  if (!a) return null;
  const img = a.querySelector('img');
  return {
    name: a.querySelector('.card-name')?.textContent,
    best: a.querySelector('.card-best b')?.textContent,
    badge: a.querySelector('.card-badge')?.textContent,
    img: img?.getAttribute('src'),
    imgOk: img ? img.complete && img.naturalWidth > 0 : false,
    cat: a.querySelector('.card-cat')?.textContent,
  };
});

console.log(JSON.stringify({ greet, afterReload, deathAttempt, result, cards, lj, errors, hubErrors }, null, 2));
await browser.close();
