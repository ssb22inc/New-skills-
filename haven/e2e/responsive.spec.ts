import { test, expect } from '@playwright/test';

test.describe('Responsive Design', () => {
  test('landing page on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Hero should be visible
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('text=Get Started')).toBeVisible();
  });

  test('mobile navigation', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Check if mobile menu button exists (hamburger)
    const menuButton = page.locator('button:has(svg)').first();
    if (await menuButton.isVisible()) {
      await menuButton.click();
      // Navigation should appear
      await expect(page.locator('nav, [role="navigation"]')).toBeVisible();
    }
  });

  test('dashboard on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');

    // Content should adapt to tablet size
    await expect(page.locator('main, [role="main"]')).toBeVisible();
  });

  test('desktop layout', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');

    // Should show full desktop layout
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('footer')).toBeVisible();
  });

  test('content adapts to viewport', async ({ page }) => {
    const viewports = [
      { width: 375, height: 667 }, // Mobile
      { width: 768, height: 1024 }, // Tablet
      { width: 1920, height: 1080 }, // Desktop
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await expect(page.locator('h1')).toBeVisible();
    }
  });
});
