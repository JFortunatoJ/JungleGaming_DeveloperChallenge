import { expect, test } from '@playwright/test';

import { advanceGame, startTestGame } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const initialized = 'pirate-battle/test-storage-initialized';
    if (sessionStorage.getItem(initialized)) return;
    localStorage.clear();
    sessionStorage.setItem(initialized, 'true');
  });
});

test('empty and failed query scenarios remain recoverable from the UI', async ({ page }) => {
  await page.goto('/');
  const scenario = page.getByLabel('Network scenario');

  await scenario.selectOption('empty');
  await page.getByRole('button', { name: 'Ranking' }).click();
  await expect(page.getByText('No ranking entries yet.')).toBeVisible();

  await page.getByRole('button', { name: 'Main Menu' }).click();
  await scenario.selectOption('history-error');
  await page.getByRole('button', { name: 'Match History' }).click();
  await expect(page.getByRole('alert')).toContainText('Could not load history');
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('alert')).toContainText('Could not load history');

  await page.getByRole('button', { name: 'Main Menu' }).click();
  await page.getByLabel('Network scenario').selectOption('ranking-error');
  await page.getByRole('button', { name: 'Ranking' }).click();
  await expect(page.getByRole('alert')).toContainText('Could not load ranking');
});

test('out-of-order page responses are deterministic and do not depend on random latency', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Network scenario').selectOption('out-of-order');

  const fastestPage = await page.evaluate(async () => {
    const started = performance.now();
    const request = (page: number) =>
      fetch(`/api/ranking?page=${page}&sessionSeconds=90&spawnSeconds=3`).then((response) =>
        response.json(),
      );
    const first = request(1).then(() => 1);
    const second = request(2).then(() => 2);
    const winner = await Promise.race([first, second]);
    await Promise.all([first, second]);
    return { winner, elapsed: performance.now() - started };
  });

  expect(fastestPage.winner).toBe(2);
  expect(fastestPage.elapsed).toBeLessThan(1200);
});

test('a timed-out POST is recovered after refresh without duplicating the match', async ({ page }) => {
  await startTestGame(page, { sessionSeconds: 60, spawnSeconds: 30 }, 'timeout-after-save');
  await advanceGame(page, 60.1);
  await expect(page.getByRole('heading', { name: 'Battle complete' })).toBeVisible();
  await expect(page.getByText('Match pending: the game remains available.')).toBeVisible({
    timeout: 12_000,
  });

  await page.getByRole('button', { name: 'Main Menu' }).click();
  await page.reload();
  await expect(page.getByText(/waiting to sync/)).toBeHidden({ timeout: 12_000 });
  await page.getByRole('button', { name: 'Match History' }).click();
  const savedHistoryRow = page.getByRole('row').filter({ hasText: 'Time up' });
  await expect(savedHistoryRow).toHaveCount(1);

  await page.reload();
  await page.getByRole('button', { name: 'Match History' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Time up' })).toHaveCount(1);
});
