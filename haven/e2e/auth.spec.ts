import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display login page', async ({ page }) => {
    await page.click('text=Sign in');
    await expect(page).toHaveURL('/login');
    await expect(page.locator('h1, h2, h3').filter({ hasText: /welcome back/i })).toBeVisible();
  });

  test('should show validation errors for empty login', async ({ page }) => {
    await page.goto('/login');
    await page.click('button[type="submit"]');

    // Browser validation should prevent submission
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toHaveAttribute('required', '');
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'invalid@example.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');

    await expect(page.locator('.text-red-600, [class*="error"]')).toBeVisible({ timeout: 5000 });
  });

  test('should display signup page', async ({ page }) => {
    await page.click('text=Get Started');
    await expect(page).toHaveURL('/signup');
  });

  test('should validate password confirmation match', async ({ page }) => {
    await page.goto('/signup');
    await page.fill('input[name="fullName"]', 'Test User');
    await page.fill('input[type="email"]', 'newuser@example.com');
    await page.fill('input[name="password"]', 'Password123');
    await page.fill('input[name="confirmPassword"]', 'DifferentPassword123');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=/passwords do not match/i')).toBeVisible();
  });
});
