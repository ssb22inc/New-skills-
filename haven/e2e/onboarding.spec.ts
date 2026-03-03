import { test, expect } from '@playwright/test';

test.describe('Seeker Onboarding', () => {
  test.beforeEach(async ({ page }) => {
    // Signup and redirect to onboarding
    await page.goto('/signup');
    await page.click('text=Looking for housing');
    await page.fill('input[name="fullName"]', 'Test Seeker');
    await page.fill('input[type="email"]', `seeker${Date.now()}@example.com`);
    await page.fill('input[name="password"]', 'Password123');
    await page.fill('input[name="confirmPassword"]', 'Password123');
    await page.click('button[type="submit"]');
    
    await expect(page).toHaveURL(/\/onboarding\/seeker/, { timeout: 15000 });
  });

  test('should display chat interface', async ({ page }) => {
    await expect(page.locator('text=/find your perfect home/i')).toBeVisible();
    await expect(page.locator('input[placeholder*="message" i]')).toBeVisible();
  });

  test('should show progress tracker', async ({ page }) => {
    await expect(page.locator('text=Introduction')).toBeVisible();
    await expect(page.locator('text=Housing Preferences')).toBeVisible();
    await expect(page.locator('text=Lifestyle')).toBeVisible();
  });

  test('should receive AI response', async ({ page }) => {
    const input = page.locator('input[placeholder*="message" i]');
    await input.fill('I am a travel nurse looking for housing in Houston');
    await page.click('button[type="submit"]');

    // Wait for AI response
    await expect(page.locator('[class*="bg-gray-100"]').last()).toBeVisible({ timeout: 10000 });
  });

  test('should update progress as conversation continues', async ({ page }) => {
    const input = page.locator('input[placeholder*="message" i]');
    
    // Answer questions
    await input.fill('I am a travel nurse');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    await input.fill('My budget is $2000-2500 per month');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    // Progress should increase
    const progressBar = page.locator('[class*="bg-blue-500"][style*="width"]');
    const width = await progressBar.evaluate(el => getComputedStyle(el).width);
    expect(parseInt(width)).toBeGreaterThan(0);
  });

  test('should allow skipping onboarding', async ({ page }) => {
    await page.click('text=Skip for now');
    await expect(page).toHaveURL('/dashboard');
  });

  test('should complete onboarding', async ({ page }) => {
    const input = page.locator('input[placeholder*="message" i]');
    
    const responses = [
      'I am a travel nurse at Houston Medical Center',
      'My budget is $2000-2500 per month',
      'I need to move in next month for a 3-month assignment',
      'I prefer a quiet neighborhood, I work night shifts',
      'Must have wifi and parking, nice to have gym',
    ];

    for (const response of responses) {
      await input.fill(response);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(3000);
    }

    await page.click('text=/complete|find matches/i');
    await expect(page).toHaveURL('/dashboard', { timeout: 10000 });
  });
});
