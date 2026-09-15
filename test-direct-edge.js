const { chromium } = require('playwright');

(async () => {
  const userDataDir = 'C:\\Users\\Ashish\\AppData\\Local\\Microsoft\\Edge\\User Data';
  console.log('Launching Edge directly from user profile:', userDataDir);

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'msedge',
    headless: false
  });

  const page = context.pages()[0] || await context.newPage();
  console.log('Navigating to Gemini...');
  await page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  const title = await page.title();
  const url = page.url();
  console.log('Gemini Title:', title);
  console.log('Gemini URL:', url);

  console.log('Navigating to ChatGPT...');
  await page.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  const cgTitle = await page.title();
  const cgUrl = page.url();
  const content = await page.content();
  const isLoggedInChatGPT = !content.includes('Log in to get answers') && !content.includes('Sign up for free');

  console.log('ChatGPT Title:', cgTitle);
  console.log('ChatGPT URL:', cgUrl);
  console.log('ChatGPT Logged In:', isLoggedInChatGPT);

  await context.close();
})();
