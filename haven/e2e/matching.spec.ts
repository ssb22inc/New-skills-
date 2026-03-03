import { test, expect } from '@playwright/test';

test.describe('Matching', () => {
  test.beforeEach(async ({ page }) => {
    // Login as seeker
    await page.goto('/login');
    await page.fill('input[type="email"]', 'seeker@example.com');
    await page.fill('input[type="password"]', 'Password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');
  });

  test('should display matches page', async ({ page }) => {
    await page.click('text=Matches');
    await expect(page).toHaveURL('/matches');
    await expect(page.locator('h1')).toContainText(/matches/i);
  });

  test('should show match cards with scores', async ({ page }) => {
    await page.goto('/matches');
    
    // Should show match percentage
    await expect(page.locator('text=/\\d+% match/i')).toBeVisible({ timeout: 10000 });
  });

  test('should show match breakdown', async ({ page }) => {
    await page.goto('/matches');
    
    // Click to show breakdown
    await page.click('text=Why this match?');
    
    await expect(page.locator('text=Location')).toBeVisible();
    await expect(page.locator('text=Budget')).toBeVisible();
    await expect(page.locator('text=Lifestyle')).toBeVisible();
  });

  test('should like a match', async ({ page }) => {
    await page.goto('/matches');
    
    // Get initial match count indicator
    const initialText = await page.locator('text=/\\d+ of \\d+ matches/i').textContent();
    
    // Click like button (heart)
    await page.click('button:has(svg[class*="heart" i]), button[class*="bg-red"]');
    
    // Should advance to next match
    await page.waitForTimeout(500);
    const newText = await page.locator('text=/\\d+ of \\d+ matches/i').textContent();
    
    // The index should have changed
    expect(newText).not.toBe(initialText);
  });

  test('should skip a match', async ({ page }) => {
    await page.goto('/matches');
    
    // Click skip button (X)
    await page.click('button:has(svg[class*="x" i]):not([class*="bg-red"])');
    
    // Should advance to next match
    await page.waitForTimeout(500);
  });

  test('should view listing details from match', async ({ page }) => {
    await page.goto('/matches');
    
    await page.click('text=View Details');
    
    await expect(page).toHaveURL(/\/listings\/[a-zA-Z0-9-]+/);
  });

  test('should show empty state when no matches', async ({ page }) => {
    // Mock API to return no matches
    await page.route('/api/matches*', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({ matches: [] }),
      });
    });
    
    await page.goto('/matches');
    
    await expect(page.locator('text=/no more matches|check back later/i')).toBeVisible();
  });
});
