import { test, expect } from '@playwright/test';

test.describe('Auth flow', () => {
  test('login → admin upgrade → Settings tab visible → sign out', async ({ page }) => {
    await page.goto('/');

    // Should see login page with "Who are you?"
    await expect(page.getByText('Who are you?')).toBeVisible();

    // Click a worker card to log in
    const firstWorker = page.locator('[style*="cursor: pointer"]').first();
    await firstWorker.click();

    // After login, should see the app (not login page)
    await expect(page.getByText('Who are you?')).not.toBeVisible({ timeout: 5000 });

    // Open user menu (user tag picker)
    const userButton = page.locator('button').filter({ hasText: /^[A-Z][a-z]+ [A-Z][a-z]+$/ }).first();
    await userButton.click();

    // Click "Upgrade to Admin"
    await page.getByText('Upgrade to Admin').click();

    // Enter admin password (default dev password from CLAUDE.md: admin2026)
    await page.getByPlaceholder('Enter admin password').fill('admin2026');
    await page.getByRole('button', { name: 'Go' }).click();

    // Dropdown should close and user should now have admin role
    await expect(page.getByText('Admin')).toBeVisible({ timeout: 3000 });

    // Check Settings tab [E] is visible
    const settingsTab = page.getByText('[E] Settings');
    await expect(settingsTab).toBeVisible();

    // Sign out
    await userButton.click();
    await page.getByText('Sign out').click();

    // Should be back at login page
    await expect(page.getByText('Who are you?')).toBeVisible({ timeout: 3000 });
  });
});