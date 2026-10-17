import { expect, test } from '@playwright/test';

import { advanceGame, readGameState, startTestGame } from './helpers';

test('keyboard movement, rotation and island collision keep the player inside the arena', async ({
  page,
}) => {
  await startTestGame(page);
  const initial = await readGameState(page);

  await page.keyboard.down('w');
  await page.waitForTimeout(40);
  await advanceGame(page, 2);
  await page.keyboard.up('w');

  const moved = await readGameState(page);
  expect(moved.player.x).toBeGreaterThan(initial.player.x);
  expect(moved.player.x).toBeLessThan(400);
  expect(moved.player.y).toBe(initial.player.y);

  await page.keyboard.down('d');
  await page.waitForTimeout(40);
  await advanceGame(page, 0.5);
  await page.keyboard.up('d');

  const turned = await readGameState(page);
  expect(turned.player.angle).toBeGreaterThan(initial.player.angle);
  expect(turned.player.x).toBeGreaterThanOrEqual(28);
  expect(turned.player.x).toBeLessThanOrEqual(turned.arena.width - 28);
  expect(turned.player.y).toBeGreaterThanOrEqual(28);
  expect(turned.player.y).toBeLessThanOrEqual(turned.arena.height - 28);
});

test('front fire cooldowns and parallel broadsides work at the same time', async ({ page }) => {
  await startTestGame(page);

  await page.keyboard.down(' ');
  await page.waitForTimeout(40);
  await advanceGame(page, 1.15);
  await page.keyboard.up(' ');

  const frontShots = await readGameState(page);
  expect(frontShots.shotCounts.front).toBe(4);

  await page.keyboard.down('q');
  await page.waitForTimeout(40);
  await advanceGame(page, 0.05);
  await page.keyboard.up('q');

  const volley = (await readGameState(page)).projectiles.slice(-3);
  expect(volley).toHaveLength(3);
  expect(volley[0].vx).toBeCloseTo(volley[1].vx, 6);
  expect(volley[1].vx).toBeCloseTo(volley[2].vx, 6);
  expect(volley[0].vy).toBeCloseTo(volley[1].vy, 6);
  expect(volley[1].vy).toBeCloseTo(volley[2].vy, 6);
});

test('the configured spawn pattern produces distant Chaser and Shooter enemies', async ({ page }) => {
  await startTestGame(page, { sessionSeconds: 60, spawnSeconds: 1 });
  await advanceGame(page, 2.1);

  const state = await readGameState(page);
  expect(state.enemies.map((enemy) => enemy.kind)).toEqual(['chaser', 'shooter']);
  for (const enemy of state.enemies) {
    expect(Math.hypot(enemy.x - state.player.x, enemy.y - state.player.y)).toBeGreaterThan(360);
  }
});

test('Chasers route around islands while Shooters fire from their configured range', async ({
  page,
}) => {
  await startTestGame(page);
  await page.evaluate(() => {
    const bridge = window.__PIRATE_BATTLE_TEST__;
    if (!bridge) throw new Error('The deterministic game test bridge is unavailable.');
    bridge.spawnEnemy('shooter', 380, 270);
    bridge.spawnEnemy('chaser', 650, 270);
  });

  const initial = await readGameState(page);
  const chaserStart = initial.enemies[1];

  for (let tick = 0; tick < 6; tick += 1) {
    await advanceGame(page, 0.2);
  }

  const state = await readGameState(page);
  const chaser = state.enemies[1];
  expect(state.shotCounts.enemy).toBeGreaterThan(0);
  expect(state.player.health).toBeLessThan(100);
  expect(Math.hypot(chaser.x - chaserStart.x, chaser.y - chaserStart.y)).toBeGreaterThan(30);

  for (const island of state.arena.islands) {
    expect(Math.hypot(chaser.x - island.x, chaser.y - island.y)).toBeGreaterThanOrEqual(
      island.r + 28,
    );
  }
});

test('hits damage once per cannonball and a defeated ship scores exactly one point', async ({
  page,
}) => {
  await startTestGame(page);
  await page.evaluate(() => {
    const bridge = window.__PIRATE_BATTLE_TEST__;
    if (!bridge) throw new Error('The deterministic game test bridge is unavailable.');
    bridge.spawnEnemy('shooter', 330, 270);
  });

  await page.keyboard.down(' ');
  await page.waitForTimeout(40);
  await advanceGame(page, 0.5);
  const damaged = await readGameState(page);
  expect(damaged.enemies[0].health).toBe(20);
  expect(damaged.player.health).toBeLessThan(100);
  await advanceGame(page, 0.8);
  await page.keyboard.up(' ');

  const defeated = await readGameState(page);
  expect(defeated.score).toBe(1);
  expect(defeated.enemies[0].alive).toBe(false);
  await advanceGame(page, 1);
  expect((await readGameState(page)).score).toBe(1);
});

test('pause and hidden-tab pause freeze simulation until explicit resume', async ({ page }) => {
  await startTestGame(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();

  const beforePause = await readGameState(page);
  await advanceGame(page, 5);
  expect((await readGameState(page)).elapsed).toBe(beforePause.elapsed);

  await page.getByRole('button', { name: 'Resume' }).click();
  await advanceGame(page, 1);
  expect((await readGameState(page)).elapsed).toBeGreaterThan(beforePause.elapsed);

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
  expect((await readGameState(page)).paused).toBe(true);
});

test('enemy fire can sink the player, stop the simulation and finish without a score', async ({
  page,
}) => {
  await startTestGame(page, { sessionSeconds: 180, spawnSeconds: 30 });
  await page.evaluate(() => {
    const bridge = window.__PIRATE_BATTLE_TEST__;
    if (!bridge) throw new Error('The deterministic game test bridge is unavailable.');
    bridge.spawnEnemy('shooter', 200, 270);
  });

  let state = await readGameState(page);
  for (let tick = 0; tick < 60 && state.player.alive; tick += 1) {
    await advanceGame(page, 0.25);
    state = await readGameState(page);
  }

  expect(state.player.alive).toBe(false);
  const elapsedAtDeath = state.elapsed;
  const shotsAtDeath = state.shotCounts.enemy;

  await advanceGame(page, 0.05);
  state = await readGameState(page);
  expect(state.elapsed).toBe(elapsedAtDeath);
  expect(state.shotCounts.enemy).toBe(shotsAtDeath);

  await advanceGame(page, 0.5);
  await expect(page.getByRole('heading', { name: 'Battle complete' })).toBeVisible();
  const savedResult = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('pirate-battle/last-result') ?? 'null'),
  );
  expect(savedResult).toMatchObject({ reason: 'destroyed', score: 0 });
});

test('match result is recorded and can be reopened after a refresh', async ({ page }) => {
  await startTestGame(page, { sessionSeconds: 60, spawnSeconds: 30 });
  await advanceGame(page, 60.1);

  await expect(page.getByRole('heading', { name: 'Battle complete' })).toBeVisible();
  await expect(page.getByText('Match recorded in history and ranking')).toBeVisible();
  const savedResult = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('pirate-battle/last-result') ?? 'null'),
  );
  expect(savedResult).toMatchObject({ reason: 'time', duration: 60 });

  await page.getByRole('button', { name: 'Main Menu' }).click();
  await page.getByRole('button', { name: 'Ranking' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'You' })).toHaveCount(1);
  await page.getByRole('tab', { name: 'Match History' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Time up' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Main Menu' }).click();
  await page.reload();
  await page.getByRole('button', { name: /Latest battle/ }).click();
  await expect(page.getByRole('heading', { name: 'Battle complete' })).toBeVisible();
});

test('leaving an unfinished match does not register it', async ({ page }) => {
  await startTestGame(page);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Main Menu' }).click();
  await page.getByRole('button', { name: 'Match History' }).click();

  await expect(page.getByText('No matches recorded yet.')).toBeVisible();
});

test('touch controls are visible and move the ship in mobile landscape', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'This interaction is specific to touch-oriented viewports.');
  await startTestGame(page, undefined, 'normal', true);

  const forward = page.getByRole('button', { name: 'Forward (W / ↑)' });
  await expect(forward).toBeVisible();
  const initial = await readGameState(page);
  await forward.hover();
  await page.mouse.down();
  await page.waitForTimeout(40);
  await advanceGame(page, 0.5);
  await page.mouse.up();

  expect((await readGameState(page)).player.x).toBeGreaterThan(initial.player.x);
});

test('portrait gameplay asks for landscape and pauses until the device is rotated', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Orientation behavior is specific to touch-oriented viewports.');
  await startTestGame(page, undefined, 'normal', true);
  await page.setViewportSize({ width: 390, height: 844 });

  await expect(page.getByRole('heading', { name: 'Rotate your device' })).toBeVisible();
  const beforePortrait = await readGameState(page);
  await advanceGame(page, 2);
  expect((await readGameState(page)).elapsed).toBe(beforePortrait.elapsed);

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByRole('heading', { name: 'Rotate your device' })).toBeHidden();
  await advanceGame(page, 0.5);
  expect((await readGameState(page)).elapsed).toBeGreaterThan(beforePortrait.elapsed);
});
