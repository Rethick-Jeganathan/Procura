/**
 * Shared E2E test helpers for Procura.
 *
 * Environment variables:
 *   E2E_USER_EMAIL    — test user email
 *   E2E_USER_PASSWORD — test user password
 *   E2E_ADMIN_EMAIL   — test admin email
 *   E2E_ADMIN_PASSWORD — test admin password
 */
import { Page, expect } from '@playwright/test';

export const TEST_USER = {
  email: process.env.E2E_USER_EMAIL || 'e2e-user@procura-test.local',
  password: process.env.E2E_USER_PASSWORD || 'TestPassword123!',
};

export const TEST_ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL || 'e2e-admin@procura-test.local',
  password: process.env.E2E_ADMIN_PASSWORD || 'AdminPassword123!',
};

/**
 * Log in through the landing page form.
 * Waits until the dashboard sidebar is visible before returning.
 */
export async function login(page: Page, email: string, password: string) {
  await page.goto('/');
  await page.getByPlaceholder(/email/i).fill(email);
  await page.getByPlaceholder(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  // Wait for navigation to protected area — sidebar should appear
  await page.waitForURL(/\/(dashboard|submissions|workspace)/, { timeout: 15_000 });
}

/**
 * Log in as the default test user.
 */
export async function loginAsUser(page: Page) {
  await login(page, TEST_USER.email, TEST_USER.password);
}

/**
 * Log in as the admin test user.
 */
export async function loginAsAdmin(page: Page) {
  await login(page, TEST_ADMIN.email, TEST_ADMIN.password);
}

/**
 * Navigate to a sidebar page and wait for it to settle.
 */
export async function navigateTo(page: Page, path: string) {
  // The app uses HashRouter, so routes are /#/path
  await page.goto(`/#${path}`);
  await page.waitForLoadState('networkidle');
}
