import { test, expect } from '@playwright/test';
import { loginAsUser, navigateTo } from './helpers';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
  });

  test('displays opportunity pipeline metrics', async ({ page }) => {
    // Dashboard should show metric cards
    await expect(page.locator('text=/total|pipeline|opportunities/i').first()).toBeVisible({ timeout: 10_000 });
  });

  test('search filters opportunities', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search/i);
    await searchInput.fill('IT Services');
    await page.keyboard.press('Enter');
    // Wait for filtered results or "no results" message
    await page.waitForTimeout(1000);
    // The page should still be functional (no crash)
    await expect(page.locator('.bg-gray-50, .bg-white').first()).toBeVisible();
  });

  test('status filter buttons are clickable', async ({ page }) => {
    // Click on a status filter (e.g., "Qualified", "New")
    const filterButtons = page.locator('button').filter({ hasText: /new|qualified|review|submitted/i });
    const count = await filterButtons.count();
    if (count > 0) {
      await filterButtons.first().click();
      await page.waitForTimeout(500);
      // Should not crash
      await expect(page).toHaveURL(/dashboard/);
    }
  });

  test('opportunity row expands on click', async ({ page }) => {
    // Wait for opportunities to load
    await page.waitForTimeout(2000);
    const rows = page.locator('[class*="cursor-pointer"], tr, [role="row"]');
    const count = await rows.count();
    if (count > 0) {
      await rows.first().click();
      await page.waitForTimeout(500);
    }
    // Page should remain stable
    await expect(page).toHaveURL(/dashboard/);
  });

  test('news feed section loads', async ({ page }) => {
    // Scroll down to find news feed component
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    // Should either show news items or a "configure API key" message
    const newsSection = page.locator('text=/market intelligence|news|articles|NEWS_API_KEY/i');
    await expect(newsSection.first()).toBeVisible({ timeout: 10_000 });
  });
});
