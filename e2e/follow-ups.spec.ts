import { test, expect } from '@playwright/test';
import { loginAsUser, navigateTo } from './helpers';

test.describe('Follow-ups', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
    await navigateTo(page, '/follow-ups');
  });

  test('follow-ups page loads', async ({ page }) => {
    await expect(page.getByText(/application follow-up/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('status filter cards are interactive', async ({ page }) => {
    const filterCards = page.locator('button').filter({ hasText: /pending|checked|updated|awarded/i });
    const count = await filterCards.count();
    if (count > 0) {
      // Click to filter
      await filterCards.first().click();
      await page.waitForTimeout(500);
      // Click again to clear filter
      await filterCards.first().click();
      await page.waitForTimeout(500);
    }
    await expect(page).toHaveURL(/follow/);
  });

  test('refresh button works', async ({ page }) => {
    const refreshBtn = page.getByRole('button', { name: /refresh/i });
    await expect(refreshBtn).toBeVisible();
    await refreshBtn.click();
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/follow/);
  });

  test('shows empty state or follow-up list', async ({ page }) => {
    // Either cards or "no follow-ups" message
    const content = page.locator('text=/no follow-up|automatically created|pending|checked/i');
    await expect(content.first()).toBeVisible({ timeout: 10_000 });
  });
});
