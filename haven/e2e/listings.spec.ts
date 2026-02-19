import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Listings', () => {
  test('should display landing page', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText(/Find Your Perfect/i);
    await expect(page.locator('text=Get Started')).toBeVisible();
  });

  test('should navigate to listings page', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Browse Listings');
    await expect(page).toHaveURL('/listings');
  });

  test('should show photo upload interface', async ({ page }) => {
    await page.goto('/listings/new');

    // Should show upload area
    await expect(page.locator('text=/upload|drag.*drop/i')).toBeVisible();
    await expect(page.locator('input[type="file"]')).toBeAttached();
  });

  test('should navigate between tabs', async ({ page }) => {
    await page.goto('/listings/new');

    // Click through tabs
    await page.click('text=Photos');
    await expect(page.locator('[role="tabpanel"]:visible')).toContainText(/upload|photos/i);

    await page.click('text=Voice');
    await expect(page.locator('[role="tabpanel"]:visible')).toContainText(/voice|describe/i);

    await page.click('text=Details');
    await expect(page.locator('[role="tabpanel"]:visible')).toContainText(/title|description/i);
  });

  test('should validate required fields', async ({ page }) => {
    await page.goto('/listings/new');
    await page.click('text=Details');

    // Try to submit without required fields
    await page.click('button:has-text("Publish")');

    // Should show validation errors
    const titleInput = page.locator('input[name="title"], input[placeholder*="title"]').first();
    await expect(titleInput).toHaveAttribute('required', '');
  });

  test('listings page should be accessible', async ({ page }) => {
    await page.goto('/listings');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('new listing page should be accessible', async ({ page }) => {
    await page.goto('/listings/new');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
