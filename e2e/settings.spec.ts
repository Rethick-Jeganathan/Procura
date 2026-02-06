import { test, expect } from '@playwright/test';
import { loginAsUser, navigateTo } from './helpers';

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
    await navigateTo(page, '/settings');
  });

  test('settings page loads with sections', async ({ page }) => {
    await expect(page.getByText(/settings/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('API key management section is visible', async ({ page }) => {
    await expect(page.getByText(/api key|connector|integration/i).first()).toBeVisible();
  });

  test('MFA section is visible', async ({ page }) => {
    await expect(page.getByText(/multi-factor|mfa|two-factor|authenticator/i).first()).toBeVisible();
  });
});
