import { existsSync } from 'node:fs';

import { defineConfig, devices } from '@playwright/test';

const systemChromium = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find(existsSync);
const performanceRun = process.env.PIRATE_BATTLE_PROFILE === '1';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  outputDir: './reports/test-results',
  reporter: [
    [
      'html',
      {
        outputFolder: performanceRun ? './reports/performance-playwright' : './reports/playwright',
        open: 'never',
      },
    ],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    launchOptions: systemChromium ? { executablePath: systemChromium } : {},
  },
  webServer: {
    command: performanceRun
      ? 'npm run preview -- --host 127.0.0.1 --port 4173'
      : 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 844, height: 390 },
        screen: { width: 844, height: 390 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
