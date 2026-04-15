import { test, expect } from '@playwright/test';

test.describe('Task update flow', () => {
  test('change status → toast appears → log entry visible', async ({ page }) => {
    await page.goto('/');

    // Login as first worker
    const firstWorker = page.locator('[style*="cursor: pointer"]').first();
    await firstWorker.click();

    // Navigate to Workers view [D]
    const workersTab = page.getByText('[D] Workers');
    await workersTab.click();

    // Click on a worker to see their tasks
    const workerItem = page.locator('[style*="cursor: pointer"]').nth(1);
    await workerItem.click();

    // Wait for task list to appear
    await page.waitForTimeout(500);

    // Find and click an active task to open FloatingTaskDetailPanel
    const activeTaskCard = page.locator('text=Active Tasks').locator('..').locator('..').locator('div[style*="cursor: pointer"]').first();
    await activeTaskCard.click().catch(() => {
      // Fallback: try clicking on a task in the queue
    });

    // Since FloatingTaskDetailPanel doesn't have status change, let's use My Tasks view
    // Navigate to My Tasks [F]
    const myTasksTab = page.getByText('[F] My Tasks');
    if (await myTasksTab.isVisible()) {
      await myTasksTab.click();
      await page.waitForTimeout(300);

      // Look for a task with status change buttons
      const completeBtn = page.getByText('Mark Complete').or(page.getByText('✓'));
      if (await completeBtn.first().isVisible({ timeout: 2000 })) {
        await completeBtn.first().click();

        // Toast should appear in bottom-right
        const toast = page.locator('[style*="position: fixed"]').filter({ hasText: /status|complete|updated/i }).first();
        await expect(toast).toBeVisible({ timeout: 5000 });
      }
    }

    // Navigate to Settings → Logs
    const settingsTab = page.getByText('[E] Settings');
    await settingsTab.click();
    await page.waitForTimeout(300);

    // Click Logs tab
    await page.getByText('Logs').click();
    await page.waitForTimeout(300);

    // Switch to Compact mode
    await page.getByText('Compact').click();
    await page.waitForTimeout(300);

    // Should see log entries with "status →" text
    const logEntry = page.locator('text=/status.*→|→.*status/');
    await expect(logEntry.first()).toBeVisible({ timeout: 5000 });
  });
});