import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const initialized = 'pirate-battle/test-storage-initialized';
    if (sessionStorage.getItem(initialized)) return;
    localStorage.clear();
    sessionStorage.setItem(initialized, 'true');
  });
});

test.describe('asset loading retry', () => {
  test.use({ serviceWorkers: 'block' });

  test('shows progress and retries a failed texture request without uncaught errors', async ({
    page,
  }) => {
    const unhandledErrors: string[] = [];
    page.on('pageerror', (error) => unhandledErrors.push(error.message));
    await page.goto('/?test=1&seed=731&failAssetsOnce=1');
    await page.getByRole('button', { name: 'Play' }).click();

    await expect(page.getByRole('status')).toContainText('Preparing the battle');
    await expect(page.getByRole('progressbar', { name: 'Loading game assets' })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('Battle assets could not be loaded');

    await page.getByRole('button', { name: 'Retry Loading' }).click();
    await expect(page.locator('.game-loading-overlay')).toBeHidden();
    expect(unhandledErrors).toEqual([]);
  });
});
