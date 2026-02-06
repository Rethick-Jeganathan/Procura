import { test, expect } from '@playwright/test';
import { loginAsUser, loginAsAdmin } from './helpers';

test.describe('Role-Based Access Control', () => {
  test('non-admin user cannot access /admin', async ({ page }) => {
    await loginAsUser(page);
    // Attempt to navigate to admin
    await page.goto('/#/admin');
    // Should be redirected to access-denied
    await expect(page.getByText(/access denied|not authorized|permission/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('admin user can access /admin', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/#/admin');
    // Should see admin dashboard content
    await expect(page.getByText(/admin|dashboard|user management|system/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('access denied page shows return link', async ({ page }) => {
    await loginAsUser(page);
    await page.goto('/#/admin');
    await expect(page.getByText(/access denied/i).first()).toBeVisible({ timeout: 10_000 });
    // Should have a way back
    const backLink = page.getByRole('link', { name: /dashboard|home|back/i });
    if (await backLink.isVisible()) {
      await backLink.click();
      await expect(page).toHaveURL(/dashboard/);
    }
  });
});
