import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';

import { expect, test, type CDPSession } from '@playwright/test';

test('optimized three-minute profile records frames, entities and five cleanup cycles', async ({
  page,
  browserName,
  isMobile,
}) => {
  test.skip(
    process.env.PIRATE_BATTLE_PROFILE !== '1' || browserName !== 'chromium' || isMobile,
    'Run the opt-in production profile with PIRATE_BATTLE_PROFILE=1.',
  );
  test.setTimeout(240_000);

  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem(
      'pirate-battle/options',
      JSON.stringify({ sessionSeconds: 180, spawnSeconds: 30 }),
    );
    localStorage.setItem('pirate-battle/network-scenario', 'normal');
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Play' }).click();
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__PIRATE_BATTLE_PROFILE__)))
    .toBe(true);
  await expect(page.locator('.game-loading-overlay')).toBeHidden();

  for (const key of ['w', 'd', ' ', 'q', 'e']) await page.keyboard.down(key);
  const frameMetrics = await page.evaluate(
    () =>
      new Promise<{
        durationMs: number;
        frameCount: number;
        averageFps: number;
        p95FrameMs: number;
        entitySamples: Array<{ elapsed: number; counts: Record<string, number> }>;
      }>((resolve) => {
        const started = performance.now();
        let previous = started;
        let lastEntitySample = started;
        const frameTimes: number[] = [];
        const entitySamples: Array<{
          elapsed: number;
          counts: Record<string, number>;
        }> = [];

        const sampleFrame = (now: number) => {
          frameTimes.push(now - previous);
          previous = now;

          if (now - lastEntitySample >= 5_000) {
            const snapshot = window.__PIRATE_BATTLE_PROFILE__?.snapshot();
            if (snapshot) {
              entitySamples.push({
                elapsed: (now - started) / 1_000,
                counts: snapshot.entityCounts,
              });
            }
            lastEntitySample = now;
          }

          const durationMs = now - started;
          if (durationMs >= 180_000) {
            const sortedFrameTimes = [...frameTimes].sort((a, b) => a - b);
            const p95FrameMs = sortedFrameTimes[Math.ceil(sortedFrameTimes.length * 0.95) - 1];
            resolve({
              durationMs,
              frameCount: frameTimes.length,
              averageFps: (frameTimes.length / durationMs) * 1_000,
              p95FrameMs,
              entitySamples,
            });
            return;
          }

          requestAnimationFrame(sampleFrame);
        };

        requestAnimationFrame(sampleFrame);
      }),
  );
  for (const key of ['w', 'd', ' ', 'q', 'e']) await page.keyboard.up(key);

  const completedMatch = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('pirate-battle/last-result') ?? 'null'),
  );
  expect(completedMatch).toMatchObject({ reason: 'time', duration: 180 });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  const heapAfterMatch = await readHeapUsage(cdp);
  const cleanupHeapSamples: number[] = [];

  for (let cycle = 0; cycle < 5; cycle += 1) {
    if (cycle === 0) {
      await page.getByRole('button', { name: 'Play Again' }).click();
    } else {
      await page.getByRole('button', { name: 'Play' }).click();
    }

    await expect(page.getByRole('button', { name: 'Pause game' })).toBeVisible();
    await expect(page.locator('.game-loading-overlay')).toBeHidden();
    await page.keyboard.down('w');
    await page.keyboard.down(' ');
    await page.waitForTimeout(500);
    await page.keyboard.up('w');
    await page.keyboard.up(' ');
    await page.getByRole('button', { name: 'Pause game' }).click();
    await page.getByRole('button', { name: 'Main Menu' }).click();
    // Let any UI click effect and teardown callbacks settle before forcing garbage collection.
    await page.waitForTimeout(1_000);
    cleanupHeapSamples.push(await readHeapUsage(cdp));
  }

  const profile = {
    browser: await page.evaluate(() => navigator.userAgent),
    browserVersion: await page.context().browser()?.version(),
    runtime: process.version,
    platform: `${os.type()} ${os.release()}`,
    processor: os.cpus()[0]?.model,
    logicalProcessors: os.cpus().length,
    viewport: page.viewportSize(),
    devicePixelRatio: await page.evaluate(() => window.devicePixelRatio),
    match: completedMatch,
    frameMetrics,
    heapAfterMatch,
    heapAfterEachCleanupCycle: cleanupHeapSamples,
    heapGrowthAcrossFiveCycles: cleanupHeapSamples.at(-1)! - cleanupHeapSamples[0],
  };
  await mkdir('reports', { recursive: true });
  await writeFile('reports/performance-profile.json', `${JSON.stringify(profile, null, 2)}\n`);
  await test.info().attach('performance-profile.json', {
    body: JSON.stringify(profile, null, 2),
    contentType: 'application/json',
  });

  expect(frameMetrics.frameCount).toBeGreaterThan(0);
  expect(frameMetrics.entitySamples.length).toBeGreaterThan(20);
});

async function readHeapUsage(session: CDPSession) {
  await session.send('HeapProfiler.collectGarbage');
  const { usedSize } = await session.send('Runtime.getHeapUsage');
  return usedSize;
}
