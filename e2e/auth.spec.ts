import { test, expect } from '@playwright/test';
import { loginAsUser, TEST_USER } from './helpers';

test.describe('Authentication Flow', () => {
  test('successful login redirects to dashboard', async ({ page }) => {
    await loginAsUser(page);
    await expect(page).toHaveURL(/dashboard/);
  });

  test('invalid credentials show error message', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder(/email/i).fill('nonexistent@example.com');
    await page.getByPlaceholder(/password/i).fill('WrongPassword!');
    await page.getByRole('button', { name: /sign in|log in/i }).click();

    await expect(page.getByText(/invalid|error|incorrect|not found/i)).toBeVisible({ timeout: 10_000 });
    // Should stay on landing page
    await expect(page).toHaveURL('/');
  });

  test('unauthenticated access redirects to landing page', async ({ page }) => {
    // Try accessing protected route directly
    await page.goto('/#/dashboard');
    // Should redirect back to landing since there's no session
    await expect(page.getByPlaceholder(/email/i)).toBeVisible({ timeout: 15_000 });
  });

  test('logout returns to landing page', async ({ page }) => {
    await loginAsUser(page);
    await expect(page).toHaveURL(/dashboard/);

    // Click user menu / logout button in sidebar
    await page.getByRole('button', { name: /log\s*out|sign\s*out/i }).click();

    // Should return to landing
    await expect(page.getByPlaceholder(/email/i)).toBeVisible({ timeout: 10_000 });
  });
});
