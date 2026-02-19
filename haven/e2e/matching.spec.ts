import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Matching', () => {
  test('should display matches page structure', async ({ page }) => {
    await page.goto('/matches');
    await expect(page.locator('h1, h2').filter({ hasText: /matches/i })).toBeVisible();
  });

  test('should show swipe interface elements', async ({ page }) => {
    await page.goto('/matches');

    // Should have action buttons (even if no matches)
    await expect(page.locator('button')).toHaveCount.greaterThan(0);
  });

  test('should handle empty matches state', async ({ page }) => {
    // Mock empty matches
    await page.route('**/api/matches*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ matches: [] }),
      });
    });

    await page.goto('/matches');
    await expect(page.locator('text=/no.*matches|check back/i')).toBeVisible({ timeout: 5000 });
  });

  test('should display match information when available', async ({ page }) => {
    // Mock matches data
    await page.route('**/api/matches*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          matches: [
            {
              id: 'match-1',
              match_score: 85,
              listing: {
                id: 'listing-1',
                title: 'Cozy 2BR Apartment',
                address_city: 'Houston',
                address_state: 'TX',
                price: 2000,
                bedrooms: 2,
                bathrooms: 1,
                photos: [{ url: 'https://placehold.co/600x400', is_primary: true }],
              },
            },
          ],
        }),
      });
    });

    await page.goto('/matches');
    await expect(page.locator('text=/85.*match|match.*85/i')).toBeVisible({ timeout: 5000 });
  });

  test('matches page should be accessible', async ({ page }) => {
    await page.goto('/matches');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
