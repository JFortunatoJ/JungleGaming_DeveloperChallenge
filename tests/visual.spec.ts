import { expect, test } from '@playwright/test';

import { advanceGame, startTestGame } from './helpers';

test('main menu visual baseline', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveScreenshot('main-menu.png', { animations: 'disabled' });
});

test('stable arena visual baseline', async ({ page, isMobile }) => {
  await startTestGame(page, { sessionSeconds: 60, spawnSeconds: 30 }, 'normal', isMobile);
  await expect(page).toHaveScreenshot('arena.png', { animations: 'disabled' });
});

test('result screen visual baseline', async ({ page, isMobile }) => {
  await startTestGame(page, { sessionSeconds: 60, spawnSeconds: 30 }, 'normal', isMobile);
  await advanceGame(page, 60.1);
  await expect(page.getByText('Match recorded in history and ranking')).toBeVisible();
  await expect(page).toHaveScreenshot('result.png', { animations: 'disabled' });
});
