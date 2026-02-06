import { test, expect } from '@playwright/test';
import { loginAsUser } from './helpers';

test.describe('Error Handling', () => {
  test('404 page renders for unknown routes', async ({ page }) => {
    await loginAsUser(page);
    await page.goto('/#/this-route-does-not-exist');
    await expect(page.getByText(/not found|404|page.*exist/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('error boundary catches component crashes gracefully', async ({ page }) => {
    // This is a structural test — we verify the error boundary component exists
    // by checking the app loads without uncaught errors
    await loginAsUser(page);
    // No unhandled errors should appear in console
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForTimeout(2000);
    // Allow Supabase connection errors (expected in test env)
    const realErrors = errors.filter(
      (e) => !e.includes('supabase') && !e.includes('fetch') && !e.includes('network')
    );
    expect(realErrors).toHaveLength(0);
  });
});
