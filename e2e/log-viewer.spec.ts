import { test, expect } from '@playwright/test';

test.describe('Log viewer', () => {
  test('readable/compact toggle, mutation entry appears after refresh', async ({ page }) => {
    // Login as admin first (need Settings access)
    await page.goto('/');

    const firstWorker = page.locator('[style*="cursor: pointer"]').first();
    await firstWorker.click();

    // Upgrade to admin
    const userButton = page.locator('button').filter({ hasText: /^[A-Z][a-z]+ [A-Z][a-z]+$/ }).first();
    await userButton.click();
    await page.getByText('Upgrade to Admin').click();
    await page.getByPlaceholder('Enter admin password').fill('admin2026');
    await page.getByRole('button', { name: 'Go' }).click();

    // Navigate to Settings → Logs
    await page.getByText('[E] Settings').click();
    await page.waitForTimeout(300);
    await page.getByText('Logs').click();
    await page.waitForTimeout(300);

    // Readable mode: empty state message visible
    const emptyState = page.getByText('No mutations or events yet — switch to Compact to see HTTP request logs');
    await expect(emptyState).toBeVisible();

    // Click Compact
    await page.getByText('Compact').click();
    await page.waitForTimeout(500);

    // HTTP request log entries should be visible (at least one row)
    const compactContent = page.locator('[style*="font-family: monospace"]');
    await expect(compactContent.first()).toBeVisible({ timeout: 3000 });

    // Trigger a mutation via direct API call
    await page.evaluate(async () => {
      await fetch('/api/mutations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'updateTask',
          taskId: 'task-usd-setup',
          updates: { status: 'completed' },
          userName: 'Test Worker',
          role: 'admin',
        }),
      });
    });

    // Click Refresh
    await page.getByText('Refresh').click();
    await page.waitForTimeout(500);

    // Switch back to Readable mode
    await page.getByText('Readable').click();
    await page.waitForTimeout(500);

    // Should see structured row with WHO/ENTITY chips
    const readableContent = page.locator('[style*="display: inline-block"]').filter({ hasText: /Test Worker|Admin/i });
    await expect(readableContent.first()).toBeVisible({ timeout: 5000 });
  });
});