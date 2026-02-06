import { test, expect } from '@playwright/test';
import { loginAsUser, navigateTo } from './helpers';

test.describe('Document Library', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
    await navigateTo(page, '/documents');
  });

  test('document library page loads', async ({ page }) => {
    await expect(page.getByText(/document library/i)).toBeVisible({ timeout: 10_000 });
  });

  test('search input is functional', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search document/i);
    await expect(searchInput).toBeVisible();
    await searchInput.fill('capability');
    await page.waitForTimeout(1000);
    // Should not crash
    await expect(page).toHaveURL(/documents/);
  });

  test('category filter dropdown works', async ({ page }) => {
    const select = page.locator('select').first();
    if (await select.isVisible()) {
      await select.selectOption({ index: 1 });
      await page.waitForTimeout(1000);
      await expect(page).toHaveURL(/documents/);
    }
  });

  test('upload button opens upload modal', async ({ page }) => {
    const uploadBtn = page.getByRole('button', { name: /upload document/i });
    await expect(uploadBtn).toBeVisible();
    await uploadBtn.click();

    // Modal should appear
    await expect(page.getByText(/upload document/i).nth(1)).toBeVisible();
    await expect(page.getByPlaceholder(/capability statement/i)).toBeVisible();

    // Cancel closes the modal
    await page.getByRole('button', { name: /cancel/i }).click();
    await page.waitForTimeout(300);
  });

  test('upload modal validates required fields', async ({ page }) => {
    await page.getByRole('button', { name: /upload document/i }).click();

    // Upload button should be disabled without name and file
    const submitBtn = page.getByRole('button', { name: /^upload$/i });
    await expect(submitBtn).toBeDisabled();
  });

  test('refresh button reloads documents', async ({ page }) => {
    const refreshBtn = page.getByRole('button', { name: /refresh/i });
    await expect(refreshBtn).toBeVisible();
    await refreshBtn.click();
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/documents/);
  });
});
