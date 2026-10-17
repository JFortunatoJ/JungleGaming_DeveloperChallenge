import { expect, type Page } from '@playwright/test';

import type { GameOptions } from '../src/game/types';

export async function startTestGame(
  page: Page,
  options: GameOptions = { sessionSeconds: 60, spawnSeconds: 30 },
  scenario = 'normal',
  landscape = false,
) {
  if (landscape) await page.setViewportSize({ width: 844, height: 390 });

  await page.addInitScript(
    ({ savedOptions, networkScenario }) => {
      const initialized = 'pirate-battle/test-game-initialized';
      if (sessionStorage.getItem(initialized)) return;
      localStorage.clear();
      localStorage.setItem('pirate-battle/options', JSON.stringify(savedOptions));
      localStorage.setItem('pirate-battle/network-scenario', networkScenario);
      sessionStorage.setItem(initialized, 'true');
    },
    { savedOptions: options, networkScenario: scenario },
  );
  await page.goto('/?test=1&seed=731');
  await page.getByRole('button', { name: 'Play' }).click();
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__PIRATE_BATTLE_TEST__)))
    .toBe(true);
  await expect(page.locator('.game-loading-overlay')).toBeHidden();
}

export async function advanceGame(page: Page, seconds: number) {
  await page.evaluate((duration) => {
    const bridge = window.__PIRATE_BATTLE_TEST__;
    if (!bridge) throw new Error('The deterministic game test bridge is unavailable.');
    bridge.advance(duration);
  }, seconds);
}

export async function readGameState(page: Page) {
  return page.evaluate(() => {
    const bridge = window.__PIRATE_BATTLE_TEST__;
    if (!bridge) throw new Error('The deterministic game test bridge is unavailable.');
    return bridge.snapshot();
  });
}
