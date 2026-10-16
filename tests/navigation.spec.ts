import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.clear()); });

test('options validate and persist after refresh', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Options' }).click();
  const session = page.getByLabel(/Game session time/);
  await session.fill('20');
  await expect(page.getByRole('button', { name: 'Save options' })).toBeDisabled();
  await session.fill('120');
  await page.getByRole('button', { name: 'Save options' }).click();
  await page.getByRole('button', { name: 'Options' }).click();
  await expect(session).toHaveValue('120');
});

test('menu exposes ranking and match history', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Captain Ada')).toBeVisible();
  await page.getByRole('tab', { name: 'Match History' }).click();
  await expect(page.getByText('No matches recorded yet.')).toBeVisible();
});
