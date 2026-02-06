import { test, expect } from '@playwright/test';
import { loginAsUser, navigateTo } from './helpers';

test.describe('Audit Vault', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
    await navigateTo(page, '/audit');
  });

  test('audit vault page loads', async ({ page }) => {
    await expect(page.getByText(/audit|security|log/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('audit log entries display or show empty state', async ({ page }) => {
    const content = page.locator('text=/no.*log|entry|action|event|timestamp/i');
    await expect(content.first()).toBeVisible({ timeout: 10_000 });
  });
});
