import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility', () => {
  test('landing page should have no accessibility violations', async ({ page }) => {
    await page.goto('/');
    
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('login page should have no accessibility violations', async ({ page }) => {
    await page.goto('/login');
    
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('signup page should have no accessibility violations', async ({ page }) => {
    await page.goto('/signup');
    
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('forms should have proper labels', async ({ page }) => {
    await page.goto('/login');
    
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    
    // Check for associated labels
    await expect(emailInput).toHaveAttribute('id');
    await expect(passwordInput).toHaveAttribute('id');
    
    const emailId = await emailInput.getAttribute('id');
    const passwordId = await passwordInput.getAttribute('id');
    
    await expect(page.locator(`label[for="${emailId}"]`)).toBeVisible();
    await expect(page.locator(`label[for="${passwordId}"]`)).toBeVisible();
  });

  test('buttons should be keyboard accessible', async ({ page }) => {
    await page.goto('/');
    
    // Tab to first interactive element
    await page.keyboard.press('Tab');
    
    // Focus should be visible
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });

  test('images should have alt text', async ({ page }) => {
    await page.goto('/');
    
    const images = page.locator('img');
    const count = await images.count();
    
    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      const alt = await img.getAttribute('alt');
      const ariaLabel = await img.getAttribute('aria-label');
      const role = await img.getAttribute('role');
      
      // Image should have alt text OR be decorative (role="presentation")
      expect(alt || ariaLabel || role === 'presentation').toBeTruthy();
    }
  });

  test('color contrast should be sufficient', async ({ page }) => {
    await page.goto('/');
    
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2aa'])
      .analyze();
    
    const contrastViolations = results.violations.filter(v => 
      v.id === 'color-contrast'
    );
    
    expect(contrastViolations).toEqual([]);
  });
});
