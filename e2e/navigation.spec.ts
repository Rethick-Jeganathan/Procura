import { test, expect } from '@playwright/test';
import { loginAsUser, navigateTo } from './helpers';

test.describe('Sidebar Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
  });

  test('sidebar shows all navigation items', async ({ page }) => {
    const sidebar = page.locator('nav, aside, [class*="sidebar"]').first();
    await expect(sidebar).toBeVisible();

    // All main nav items should be present
    for (const label of ['Dashboard', 'Submissions', 'Documents', 'Follow', 'Correspondence', 'Audit', 'Settings']) {
      await expect(page.getByText(new RegExp(label, 'i')).first()).toBeVisible();
    }
  });

  test('navigate to Submissions page', async ({ page }) => {
    await page.getByText(/submissions/i).first().click();
    await page.waitForURL(/submissions/);
    await expect(page.getByText(/submission|queue|proposals/i).first()).toBeVisible();
  });

  test('navigate to Document Library page', async ({ page }) => {
    await page.getByText(/document/i).first().click();
    await page.waitForURL(/documents/);
    await expect(page.getByText(/document library|upload/i).first()).toBeVisible();
  });

  test('navigate to Follow-ups page', async ({ page }) => {
    await page.getByText(/follow/i).first().click();
    await page.waitForURL(/follow/);
    await expect(page.getByText(/follow-up|application/i).first()).toBeVisible();
  });

  test('navigate to Correspondence page', async ({ page }) => {
    await page.getByText(/correspondence/i).first().click();
    await page.waitForURL(/correspondence/);
    await expect(page.getByText(/correspondence|award/i).first()).toBeVisible();
  });

  test('navigate to Audit Vault page', async ({ page }) => {
    await page.getByText(/audit/i).first().click();
    await page.waitForURL(/audit/);
    await expect(page.getByText(/audit|security/i).first()).toBeVisible();
  });

  test('navigate to Settings page', async ({ page }) => {
    await page.getByText(/settings/i).first().click();
    await page.waitForURL(/settings/);
    await expect(page.getByText(/settings|configuration|api key/i).first()).toBeVisible();
  });

  test('sidebar shows user info and logout button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /log\s*out|sign\s*out/i })).toBeVisible();
  });
});
