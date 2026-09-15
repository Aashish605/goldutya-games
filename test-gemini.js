const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const userDataDir = 'C:\\Users\\Ashish\\.config\\opencode\\playwright-edge-profile';
  console.log('Launching Edge persistent context...');

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'msedge',
    headless: false
  });

  const page = context.pages()[0] || await context.newPage();
  console.log('Navigating to Gemini...');
  await page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  const inputSelector = 'rich-textarea div[contenteditable="true"], div[contenteditable="true"]';
  await page.waitForSelector(inputSelector, { timeout: 15000 });

  const promptText = 'Create a 16:9 pixel art image of a yellow duck flying between golden pipes for an arcade game banner';

  await page.click(inputSelector);
  await page.fill(inputSelector, promptText);

  // Click send button
  const sendBtn = await page.$('button[aria-label*="Send"], button.send-button, .send-button');
  if (sendBtn) {
    await sendBtn.click();
  } else {
    await page.keyboard.press('Enter');
  }

  console.log('Prompt sent. Waiting 15s...');
  await page.waitForTimeout(15000);

  // Save screenshot of Gemini response
  await page.screenshot({ path: 'gemini-response.png' });
  console.log('Saved page screenshot gemini-response.png');

  // Print text content of latest message
  const textContent = await page.evaluate(() => {
    const msgs = document.querySelectorAll('message-content, .model-response-text');
    return Array.from(msgs).map(m => m.innerText).join('\n---\n');
  });

  console.log('Gemini text response snippet:\n', textContent.substring(0, 500));

  await context.close();
})();
