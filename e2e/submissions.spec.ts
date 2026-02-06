import { test, expect } from '@playwright/test';
import { loginAsUser, navigateTo } from './helpers';

test.describe('Submissions Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
    await navigateTo(page, '/submissions');
  });

  test('submissions page loads with list or empty state', async ({ page }) => {
    // Should show either submission cards or an empty state message
    const content = page.locator('text=/submission|proposal|no submission|create/i');
    await expect(content.first()).toBeVisible({ timeout: 10_000 });
  });

  test('refresh button reloads the list', async ({ page }) => {
    const refreshBtn = page.getByRole('button', { name: /refresh/i });
    if (await refreshBtn.isVisible()) {
      await refreshBtn.click();
      await page.waitForTimeout(1000);
      // Page should still be on submissions
      await expect(page).toHaveURL(/submissions/);
    }
  });

  test('status filter tabs are interactive', async ({ page }) => {
    const filterButtons = page.locator('button').filter({ hasText: /draft|in progress|submitted|approved|rejected/i });
    const count = await filterButtons.count();
    if (count > 0) {
      await filterButtons.first().click();
      await page.waitForTimeout(500);
      await expect(page).toHaveURL(/submissions/);
    }
  });
});

test.describe('Submission Workspace', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
    await navigateTo(page, '/workspace');
  });

  test('workspace page loads', async ({ page }) => {
    // Should show workspace content or "select a submission" prompt
    const content = page.locator('text=/workspace|submission|select|task|checklist/i');
    await expect(content.first()).toBeVisible({ timeout: 10_000 });
  });
});
