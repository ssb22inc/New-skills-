import { test, expect } from '@playwright/test';

test.describe('Responsive Design', () => {
  test('landing page on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Mobile menu should be visible
    await expect(page.locator('button:has(svg[class*="menu" i])')).toBeVisible();
    
    // Hero should be visible
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('text=Get Started')).toBeVisible();
  });

  test('mobile navigation works', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Open mobile menu
    await page.click('button:has(svg[class*="menu" i])');
    
    // Navigation links should appear
    await expect(page.locator('text=How it Works')).toBeVisible();
  });

  test('dashboard on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    
    // Login
    await page.goto('/login');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'Password123');
    await page.click('button[type="submit"]');
    
    await expect(page).toHaveURL('/dashboard');
    
    // Dashboard should adapt to tablet
    await expect(page.locator('main')).toBeVisible();
  });

  test('listing cards stack on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/listings');

    // Cards should be full width on mobile
    const cards = page.locator('[class*="listing-card"], [class*="ListingCard"]');
    if (await cards.count() > 0) {
      const box = await cards.first().boundingBox();
      expect(box?.width).toBeGreaterThan(300);
    }
  });

  test('match swipe interface on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Login as seeker
    await page.goto('/login');
    await page.fill('input[type="email"]', 'seeker@example.com');
    await page.fill('input[type="password"]', 'Password123');
    await page.click('button[type="submit"]');
    
    await page.goto('/matches');
    
    // Match card should fit screen
    await expect(page.locator('[class*="match-card"], [class*="MatchCard"]')).toBeVisible();
  });
});
