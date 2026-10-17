import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const initialized = 'pirate-battle/test-storage-initialized';
    if (sessionStorage.getItem(initialized)) return;
    localStorage.clear();
    sessionStorage.setItem(initialized, 'true');
  });
});

test('options validate and persist after leaving and refreshing the screen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Options' }).click();

  const session = page.getByRole('spinbutton', { name: 'Game session time' });
  const save = page.getByRole('button', { name: 'Save options' });

  await session.fill('20');
  await expect(save).toBeDisabled();
  await session.fill('120');
  await save.click();
  await page.reload();
  await page.getByRole('button', { name: 'Options' }).click();

  await expect(session).toHaveValue('120');
});

test('menu explains keyboard and touch controls and paginates ranking/history', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/Broadsides: Q \/ E/)).toBeVisible();
  await expect(page.getByText(/on-screen movement and cannon buttons/)).toBeVisible();

  await page.getByRole('button', { name: 'Ranking' }).click();
  await expect(page.getByText('Captain Ada')).toBeVisible();
  await expect(page.getByText('Page 1 of 3')).toBeVisible();
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText('Captain Nia')).toBeVisible();

  await page.getByRole('button', { name: 'Main Menu' }).click();
  await page.getByRole('button', { name: 'Match History' }).click();
  await expect(page.getByText('No matches recorded yet.')).toBeVisible();
});
