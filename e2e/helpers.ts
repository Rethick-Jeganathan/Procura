/**
 * Shared E2E test helpers for Procura.
 *
 * REQUIRED Environment variables:
 *   E2E_USER_EMAIL    — test user email
 *   E2E_USER_PASSWORD — test user password
 *   E2E_ADMIN_EMAIL   — test admin email
 *   E2E_ADMIN_PASSWORD — test admin password
 *
 * Security: No default credentials are provided. Tests will fail if environment
 * variables are not properly configured. This prevents accidental credential exposure.
 */
import { Page, expect } from '@playwright/test';

// Validate that all required E2E credentials are configured
function validateE2ECredentials() {
  const missing: string[] = [];

  if (!process.env.E2E_USER_EMAIL) missing.push('E2E_USER_EMAIL');
  if (!process.env.E2E_USER_PASSWORD) missing.push('E2E_USER_PASSWORD');
  if (!process.env.E2E_ADMIN_EMAIL) missing.push('E2E_ADMIN_EMAIL');
  if (!process.env.E2E_ADMIN_PASSWORD) missing.push('E2E_ADMIN_PASSWORD');

  if (missing.length > 0) {
    throw new Error(
      `E2E credentials not configured. Missing environment variables: ${missing.join(', ')}\n` +
      'Set these in your .env file or CI environment before running tests.'
    );
  }
}

// Validate on module load
validateE2ECredentials();

export const TEST_USER = {
  email: process.env.E2E_USER_EMAIL!,
  password: process.env.E2E_USER_PASSWORD!,
};

export const TEST_ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL!,
  password: process.env.E2E_ADMIN_PASSWORD!,
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
