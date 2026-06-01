import { test, expect } from '@playwright/test';

test.describe('Listings', () => {
  test.beforeEach(async ({ page }) => {
    // Login as landlord
    await page.goto('/login');
    await page.fill('input[type="email"]', 'landlord@example.com');
    await page.fill('input[type="password"]', 'Password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');
  });

  test('should display listings page', async ({ page }) => {
    await page.click('text=My Listings');
    await expect(page).toHaveURL('/listings');
  });

  test('should navigate to create listing page', async ({ page }) => {
    await page.click('text=Add Listing');
    await expect(page).toHaveURL('/listings/new');
    await expect(page.locator('h1')).toContainText(/create new listing/i);
  });

  test('should show all creation methods', async ({ page }) => {
    await page.goto('/listings/new');
    
    await expect(page.locator('text=Photos')).toBeVisible();
    await expect(page.locator('text=Voice')).toBeVisible();
    await expect(page.locator('text=Details')).toBeVisible();
  });

  test('should upload photos', async ({ page }) => {
    await page.goto('/listings/new');
    
    // Upload test image
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test-photo.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('fake-image-data'),
    });

    // Should show uploaded photo
    await expect(page.locator('img[src*="blob:"], img[src*="test"]')).toBeVisible({ timeout: 5000 });
  });

  test('should fill listing details form', async ({ page }) => {
    await page.goto('/listings/new');
    await page.click('text=Details');

    await page.fill('input[name="title"], input[placeholder*="title" i]', 'Beautiful 2BR Apartment');
    await page.fill('textarea', 'A wonderful apartment with great views and modern amenities. Perfect for travel nurses. Fully furnished.');
    
    await page.selectOption('select', 'apartment');
    await page.fill('input[name="bedrooms"], input[placeholder*="bed" i]', '2');
    await page.fill('input[name="bathrooms"], input[placeholder*="bath" i]', '1');
    
    await page.fill('input[name="address_line1"], input[placeholder*="address" i]', '123 Main St');
    await page.fill('input[name="city"], input[placeholder*="city" i]', 'Houston');
    await page.fill('input[name="state"], input[placeholder*="state" i]', 'TX');
    await page.fill('input[name="zip_code"], input[placeholder*="zip" i]', '77001');
    await page.fill('input[name="price_monthly"], input[placeholder*="rent" i]', '2000');

    // Save as draft
    await page.click('text=Save as Draft');
    
    // Should redirect to listing page or show success
    await expect(page.locator('text=/saved|created|success/i')).toBeVisible({ timeout: 5000 });
  });

  test('should view listing details', async ({ page }) => {
    await page.goto('/listings');
    
    // Click on first listing
    await page.click('[class*="listing-card"], [class*="ListingCard"], a[href*="/listings/"]');
    
    await expect(page).toHaveURL(/\/listings\/[a-zA-Z0-9-]+/);
    await expect(page.locator('h1, h2')).toBeVisible();
  });

  test('should edit existing listing', async ({ page }) => {
    await page.goto('/listings');
    await page.click('a[href*="/listings/"]');
    
    // Find and click edit button
    await page.click('text=Edit');
    
    // Should show edit form
    await expect(page.locator('input, textarea')).toBeVisible();
  });
});
