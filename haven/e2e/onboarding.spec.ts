import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Seeker Onboarding', () => {
  test('should display onboarding page', async ({ page }) => {
    await page.goto('/onboarding/seeker');

    await expect(page.locator('text=/find.*perfect.*home|onboarding/i')).toBeVisible();
  });

  test('should show chat interface', async ({ page }) => {
    await page.goto('/onboarding/seeker');

    // Chat input should be visible
    const chatInput = page.locator('input[placeholder*="message"], textarea[placeholder*="message"]');
    await expect(chatInput).toBeVisible();
  });

  test('should display progress tracker', async ({ page }) => {
    await page.goto('/onboarding/seeker');

    // Progress steps should be visible
    await expect(
      page.locator('text=Introduction, text=Preferences, text=Lifestyle').first()
    ).toBeVisible();
  });

  test('should allow skipping onboarding', async ({ page }) => {
    await page.goto('/onboarding/seeker');

    const skipButton = page.locator('button:has-text("Skip"), a:has-text("Skip")');
    if (await skipButton.isVisible()) {
      await skipButton.click();
      await expect(page).toHaveURL('/dashboard', { timeout: 5000 });
    }
  });

  test('should handle user input', async ({ page }) => {
    await page.goto('/onboarding/seeker');

    const input = page.locator('input[placeholder*="message"], textarea[placeholder*="message"]');
    await input.fill('I am looking for housing in Houston');

    const sendButton = page.locator('button[type="submit"]');
    await sendButton.click();

    // Message should appear in chat
    await expect(page.locator('text=Houston')).toBeVisible({ timeout: 3000 });
  });

  test('onboarding page should be accessible', async ({ page }) => {
    await page.goto('/onboarding/seeker');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
