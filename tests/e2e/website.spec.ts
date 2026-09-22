import { test, expect } from '@playwright/test';

test.describe('Goldutya Game Hub & Site Navigation', () => {
  test('landing page loads and renders game cards', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Goldutya Games/i);
    const cards = page.locator('.game-card');
    await expect(cards).toHaveCount(6);

    // Verify header title and filter bar
    await expect(page.locator('.hub-title')).toBeVisible();
    await expect(page.locator('#filterBar')).toBeVisible();
  });

  test('category filter buttons filter cards', async ({ page }) => {
    await page.goto('/');
    await page.click('button[data-cat="arcade"]');
    const cards = page.locator('.game-card');
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toHaveAttribute('href', 'fly.html');

    // Click ALL back
    await page.click('button[data-cat="all"]');
    await expect(cards).toHaveCount(6);
  });

  test('navigates from hub to snake game and back', async ({ page }) => {
    await page.goto('/');
    await page.click('a[href="snake.html"]');
    await expect(page).toHaveURL(/snake/);
    await expect(page.locator('h1.title')).toContainText('SNAKE');

    // Click ALL GAMES button to navigate back
    await page.click('a.btn-back');
    await expect(page).toHaveURL(/\/index\.html|\/$/);
  });
});

test.describe('Universal Difficulty System', () => {
  test('persists difficulty selection per game in localStorage', async ({ page }) => {
    await page.goto('/snake.html');
    await expect(page.locator('.difficulty-picker')).toBeVisible();

    // Select HARD
    await page.click('.difficulty-btn[data-diff="hard"]');

    // Check localStorage
    const savedDiff = await page.evaluate(() => localStorage.getItem('goldutya-snake-diff'));
    expect(savedDiff).toBe('hard');

    // Reload page and verify HARD remains active
    await page.reload();
    const activeBtn = page.locator('.difficulty-btn.active');
    await expect(activeBtn).toHaveText('HARD');
  });

  test('hub displays active difficulty badge on game card', async ({ page }) => {
    await page.goto('/fly.html');
    await page.click('.difficulty-btn[data-diff="easy"]');

    // Return to hub
    await page.goto('/');
    const flyCard = page.locator('a[href="fly.html"]');
    await expect(flyCard.locator('.card-diff-chip')).toHaveText('EASY');
  });
});

test.describe('Snake Game Mechanics & Controls', () => {
  test('starts game, responds to arrow keys, and handles game over', async ({ page }) => {
    await page.goto('/snake.html');
    
    // Select Medium (solid walls)
    await page.click('.difficulty-btn[data-diff="medium"]');

    // Click START
    await page.click('#startBtn');
    await expect(page.locator('#overlay')).toHaveClass(/hidden/);

    // Send arrow keys
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(500);

    // Snake will eventually crash into top boundary wall on Medium
    await page.waitForTimeout(3000);
    await expect(page.locator('#overlay')).not.toHaveClass(/hidden/);
    await expect(page.locator('#overlayTitle')).toContainText(/GAME OVER|NEW BEST/);
  });
});

test.describe('Responsive Layout', () => {
  test('maintains layout integrity on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 740 });
    await page.goto('/');
    await expect(page.locator('.hub-title')).toBeVisible();
    await expect(page.locator('.game-card').first()).toBeVisible();

    // Navigate to game page
    await page.goto('/fly.html');
    await expect(page.locator('#game')).toBeVisible();
    await expect(page.locator('.topbar')).toBeVisible();
  });
});
