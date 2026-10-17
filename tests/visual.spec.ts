import { expect, test } from '@playwright/test';

import { advanceGame, startTestGame } from './helpers';

test('main menu visual baseline', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveScreenshot('main-menu.png', { animations: 'disabled' });
});

test('mobile landscape menu keeps both footer buttons inside the frame', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'This compact layout check is specific to mobile landscape screens.');
  await page.setViewportSize({ width: 667, height: 375 });
  await page.goto('/');

  const frame = page.locator('.menu-frame');
  const frameBounds = await frame.boundingBox();
  const footerButtons = await page.locator('.menu-logs .wood-button').evaluateAll((buttons) =>
    buttons.map((button) => {
      const { bottom } = button.getBoundingClientRect();
      return bottom;
    }),
  );
  const bottomBorder = await frame.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).borderBottomWidth),
  );

  expect(frameBounds).not.toBeNull();
  expect(footerButtons).toHaveLength(2);
  expect(
    footerButtons.every(
      (bottom) => bottom <= frameBounds!.y + frameBounds!.height - bottomBorder,
    ),
  ).toBe(true);
  await expect(page.getByRole('button', { name: 'Ranking' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Match History' })).toBeVisible();
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
