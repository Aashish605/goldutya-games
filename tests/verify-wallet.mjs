import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.md': 'text/plain',
};

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const data = await readFile(join(root, p));
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

// 1. manifest static check
let manifest = null;
let manifestErr = null;
try {
  manifest = JSON.parse(readFileSync(join(root, 'tonconnect-manifest.json'), 'utf8'));
} catch (e) {
  manifestErr = String(e);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 400, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

// manifest served over http?
const manifestHttp = await fetch(origin + '/tonconnect-manifest.json')
  .then((r) => r.json())
  .catch((e) => ({ err: String(e) }));

await page.goto(origin + '/', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(1200);

const init = await page.evaluate(() => ({
  cdn: typeof TON_CONNECT_UI !== 'undefined',
  cls: typeof (window.TON_CONNECT_UI || {}).TonConnectUI,
  wallet: typeof Wallet !== 'undefined',
  connected: Wallet && Wallet.isConnected(),
  btn: !!document.getElementById('walletBtn'),
  label: document.getElementById('walletBtnLabel')?.textContent,
  menuHidden: document.getElementById('walletMenu')?.hidden,
  iconOk: (() => {
    const u = document.querySelector('#walletBtn use');
    return !!u && u.getAttribute('href') === 'assets/icons.svg#wallet';
  })(),
  iconRendered: (() => {
    const svg = document.querySelector('#walletBtn svg');
    return !!svg && svg.getBoundingClientRect().width > 0;
  })(),
}));

// 2. persisted address renders (mock stored wallet, no real connect)
const fake = 'EQ' + 'A'.repeat(46);
await page.evaluate((addr) => {
  localStorage.setItem('goldutya-wallet', addr);
}, fake);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(800);

const afterReload = await page.evaluate(() => ({
  label: document.getElementById('walletBtnLabel')?.textContent,
  connected: document.getElementById('walletBtn').classList.contains('connected'),
  stored: localStorage.getItem('goldutya-wallet'),
  walletConnected: Wallet.isConnected(),
  addr: Wallet.getAddress(),
}));

// 3. menu opens, disconnect clears
await page.click('#walletBtn');
await page.waitForTimeout(200);
const menuOpen = await page.evaluate(() => !document.getElementById('walletMenu').hidden);
await page.click('#walletDisconnect');
await page.waitForTimeout(400);
const afterDisconnect = await page.evaluate(() => ({
  label: document.getElementById('walletBtnLabel')?.textContent,
  stored: localStorage.getItem('goldutya-wallet'),
  connected: document.getElementById('walletBtn').classList.contains('connected'),
  menuHidden: document.getElementById('walletMenu').hidden,
  walletConnected: Wallet.isConnected(),
}));

console.log(JSON.stringify({
  manifest, manifestErr, manifestHttp, init, afterReload, menuOpen, afterDisconnect, errors,
}, null, 2));

const pass =
  manifest && manifest.url && manifest.name && manifest.iconUrl &&
  manifestHttp && manifestHttp.name === 'Goldutya Games' &&
  init.cdn && init.cls === 'function' && init.wallet && init.btn && init.iconOk && init.iconRendered &&
  init.label === 'CONNECT WALLET' && init.menuHidden === true &&
  afterReload.label === 'EQAA…AAAA' && afterReload.connected && afterReload.stored === fake &&
  menuOpen === true &&
  afterDisconnect.label === 'CONNECT WALLET' && afterDisconnect.stored === null &&
  afterDisconnect.connected === false && afterDisconnect.menuHidden === true &&
  errors.length === 0;

console.log(pass ? 'PASS' : 'FAIL');
await browser.close();
server.close();
process.exit(pass ? 0 : 1);
