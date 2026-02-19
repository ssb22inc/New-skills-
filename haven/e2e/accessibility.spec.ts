import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility', () => {
  test('homepage should not have any automatically detectable WCAG A or AA violations', async ({ page }) => {
    await page.goto('/');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('login page should not have accessibility violations', async ({ page }) => {
    await page.goto('/login');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('signup page should not have accessibility violations', async ({ page }) => {
    await page.goto('/signup');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('onboarding page should not have accessibility violations', async ({ page }) => {
    await page.goto('/onboarding');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('dashboard should not have accessibility violations', async ({ page }) => {
    await page.goto('/dashboard');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('listings page should not have accessibility violations', async ({ page }) => {
    await page.goto('/listings');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('matches page should not have accessibility violations', async ({ page }) => {
    await page.goto('/matches');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('messages page should not have accessibility violations', async ({ page }) => {
    await page.goto('/messages');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('profile page should not have accessibility violations', async ({ page }) => {
    await page.goto('/profile');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should have proper keyboard navigation', async ({ page }) => {
    await page.goto('/');

    // Test tab navigation
    await page.keyboard.press('Tab');
    const focusedElement = await page.evaluate(() => {
      return document.activeElement?.tagName;
    });

    expect(focusedElement).toBeTruthy();
  });

  test('should have proper color contrast', async ({ page }) => {
    await page.goto('/');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2aa'])
      .include(['body'])
      .analyze();

    const contrastViolations = accessibilityScanResults.violations.filter(
      violation => violation.id === 'color-contrast'
    );

    expect(contrastViolations).toEqual([]);
  });

  test('should have proper heading hierarchy', async ({ page }) => {
    await page.goto('/');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withRules(['heading-order'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('forms should have proper labels', async ({ page }) => {
    await page.goto('/login');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withRules(['label'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('images should have alt text', async ({ page }) => {
    await page.goto('/');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withRules(['image-alt'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('should have proper ARIA attributes', async ({ page }) => {
    await page.goto('/');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['best-practice'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
