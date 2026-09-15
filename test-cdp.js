const { chromium } = require('playwright');

(async () => {
  console.log('Connecting Playwright to Edge via CDP port 9222...');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.newPage();

  console.log('Navigating to ChatGPT...');
  await page.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  console.log('Page Title:', await page.title());
  console.log('Page URL:', page.url());

  // Keep browser open, do not close!
})();
