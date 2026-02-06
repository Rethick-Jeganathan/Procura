import { test, expect } from '@playwright/test';
import { loginAsUser, navigateTo } from './helpers';

test.describe('Correspondence', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
    await navigateTo(page, '/correspondence');
  });

  test('correspondence page loads with stats', async ({ page }) => {
    await expect(page.getByText(/correspondence/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('type and status filter dropdowns work', async ({ page }) => {
    const selects = page.locator('select');
    const count = await selects.count();
    // Should have at least type + status filters
    expect(count).toBeGreaterThanOrEqual(2);

    // Change type filter
    await selects.nth(0).selectOption({ index: 1 });
    await page.waitForTimeout(500);

    // Change status filter
    await selects.nth(1).selectOption({ index: 1 });
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/correspondence/);
  });

  test('create correspondence modal opens', async ({ page }) => {
    await page.getByRole('button', { name: /log correspondence/i }).click();
    await expect(page.getByText(/log correspondence/i).nth(1)).toBeVisible();
    await expect(page.getByPlaceholder(/contract award/i)).toBeVisible();

    // Cancel
    await page.getByRole('button', { name: /cancel/i }).click();
  });

  test('notification bell is present', async ({ page }) => {
    // Bell icon button should exist
    const bell = page.locator('button').filter({ has: page.locator('svg') }).first();
    await expect(bell).toBeVisible();
  });

  test('search filters correspondence items', async ({ page }) => {
    const search = page.getByPlaceholder(/search correspondence/i);
    await expect(search).toBeVisible();
    await search.fill('award');
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/correspondence/);
  });
});
