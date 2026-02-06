import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('renders the login form by default', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /procura/i })).toBeVisible();
    await expect(page.getByPlaceholder(/email/i)).toBeVisible();
    await expect(page.getByPlaceholder(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in|log in/i })).toBeVisible();
  });

  test('can switch between login and signup modes', async ({ page }) => {
    // Switch to signup
    await page.getByText(/create.*account|sign up|register/i).click();
    await expect(page.getByPlaceholder(/full name|name/i)).toBeVisible();

    // Switch back to login
    await page.getByText(/already have.*account|sign in|log in/i).click();
    await expect(page.getByPlaceholder(/password/i)).toBeVisible();
  });

  test('shows validation error for empty login', async ({ page }) => {
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    // Should show some error feedback (Supabase will reject empty credentials)
    await expect(page.getByText(/error|invalid|required/i)).toBeVisible({ timeout: 5000 });
  });

  test('shows forgot password form', async ({ page }) => {
    await page.getByText(/forgot.*password/i).click();
    await expect(page.getByRole('button', { name: /reset|send/i })).toBeVisible();
  });

  test('password visibility toggle works', async ({ page }) => {
    const passwordInput = page.getByPlaceholder(/password/i);
    await passwordInput.fill('secret123');

    // Initially password type
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Toggle visibility
    await page.locator('button:near(:text("Password"))').filter({ has: page.locator('svg') }).first().click();
    await expect(passwordInput).toHaveAttribute('type', 'text');
  });
});
