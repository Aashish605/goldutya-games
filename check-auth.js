const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.newPage();

  console.log('--- Checking ChatGPT ---');
  await page.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const cgContent = await page.content();
  const cgLoggedIn = !cgContent.includes('Log in to get answers') && !cgContent.includes('Sign up for free');
  console.log('ChatGPT Logged In:', cgLoggedIn ? 'YES' : 'NO');

  console.log('--- Checking Gemini ---');
  await page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const gmUrl = page.url();
  const gmLoggedIn = gmUrl.includes('/app');
  console.log('Gemini Logged In:', gmLoggedIn ? 'YES' : 'NO');

  browser.close();
})();
