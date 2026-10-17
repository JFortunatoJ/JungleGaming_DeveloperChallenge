# Pirate Battle

A top-down naval shooter built with React, strict TypeScript and PixiJS for the Jungle Gaming technical challenge. The combat simulation and options run locally in the browser; ranking and match history use deterministic REST mocks from MSW, called through Axios and TanStack Query.

## Requirements and setup

- Node.js 20.19 or newer and npm.
- No environment variables or private services are required. `.env` files are optional and unused by the default setup.

```bash
npm ci
npm run dev
```

Vite prints the local URL, normally `http://localhost:5173`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server. |
| `npm run build` | Type-check and create the optimized site in `dist/`. |
| `npm run build:profile` | Create a separate optimized build with read-only profiling counters enabled. |
| `npm run preview` | Serve the production build locally. |
| `npm run lint` | Check TypeScript for unused locals and parameters. |
| `npm run typecheck` | Run strict TypeScript validation without emitting files. |
| `npm run test:e2e` | Run Playwright flows and visual regression on desktop Chromium and a touch-enabled mobile landscape viewport. |
| `npm run test:e2e:performance` | Run the opt-in three-minute production profile and five cleanup cycles. |
| `npm run test:e2e:report` | Open the latest Playwright HTML report. |

Playwright uses installed Chrome or Edge when available and otherwise uses its managed Chromium. On a fresh machine, install Playwright's browsers if needed with `npx playwright install chromium`.

## Controls

| Action | Keyboard | Mobile |
| --- | --- | --- |
| Move forward | `W` or `↑` | Forward control |
| Turn left/right | `A` / `←`, `D` / `→` | Left/right controls |
| Fire forward | `Space` | Front cannon control |
| Fire left/right broadsides | `Q` / `E` | Port/starboard cannon controls |
| Pause/resume | `Escape` or HUD pause button | HUD pause button |

Movement, rotation and firing can be combined. The supported mobile game orientation is landscape; the game pauses in portrait, asks the player to rotate the device and requests an orientation lock when available. On mobile, Play requests browser fullscreen with navigation UI hidden; the pause menu can enter or exit fullscreen later. Browsers and operating systems may decline fullscreen or orientation lock, so the in-game orientation prompt remains the fallback.

## Gameplay configuration

The Options screen persists a session duration of 60–180 seconds (default 90) and enemy spawn interval of 1–30 seconds (default 3). Each match captures a configuration snapshot when Play is selected. The remaining balance values—health, movement and rotation speeds, spawn pattern and positions, damage, projectile speed/lifetime, cooldowns and Shooter range—are typed in `src/game/types.ts` under `defaultConfig` and can be adjusted without changing the simulation systems.

## Ranking, history and network scenarios

The main menu's Network scenario selector controls the MSW-backed API. Use Reset mock data to restore the default scenario and clear confirmed and pending records.

| Scenario | Reproduction |
| --- | --- |
| Normal | Standard fixtures and successful saves. |
| Empty lists | Open Ranking or Match History to see their empty states. |
| Slow / Variable latency | Open either list; observe loading and background refresh. Variable delay is derived from the requested page and resource. |
| Out-of-order responses | Request ranking page 1 and page 2 together; page 2 intentionally returns first. |
| Timeout / Connection error / HTTP 400 / HTTP 503 | Open Ranking or Match History and use Retry; for save failures, complete a match and retry from the result or main menu. |
| Ranking unavailable / History unavailable | Open the named tab to exercise a resource-specific error; the rest of the game remains usable. |
| POST timeout after save | Complete a match; the first response times out after the mock has committed the record. Reload and let the pending save replay, then confirm there is one history row. |

The mock fixtures and API contracts are shared by development and the deployed build. Completed matches are idempotent by match ID and persist in browser local storage. Failed saves remain in a local pending queue and are replayed after refresh. Ranking entries are filtered by the match's session/spawn configuration and ordered deterministically. There is no real player account or external backend.

## Tests and reports

The Playwright suite uses isolated browser contexts, a seeded game-test clock, and real game inputs for movement and combat. It runs in desktop Chromium and a touch-enabled 844×390 landscape viewport. Menu, stable arena and result-screen visual baselines live beside `tests/visual.spec.ts` in `tests/visual.spec.ts-snapshots/`.

```bash
npm run test:e2e
npm run test:e2e -- --update-snapshots  # intentionally refresh visual baselines
npm run test:e2e:report
```

The full-suite HTML report is written to `reports/playwright/`; traces and screenshots for failed tests are written to `reports/test-results/`. Do not refresh snapshots to hide an unexplained UI change—review the before/after images first.

For the performance evidence, build the isolated profile variant first and then run the test with the profile flag. In PowerShell:

```powershell
npm run build:profile
$env:PIRATE_BATTLE_PROFILE = '1'
npm run test:e2e:performance
Remove-Item Env:PIRATE_BATTLE_PROFILE
```

On macOS/Linux, prefix the final command with `PIRATE_BATTLE_PROFILE=1`. The test measures a 180-second optimized match, records mean FPS and p95 frame time plus entity samples every five seconds, then collects Chromium heap usage after five start/play/exit cycles. The profile-only bridge is not present in the normal deployment build. The detailed measurements are written to `reports/performance-profile.json`, with a separate HTML report in `reports/performance-playwright/`; the summary belongs in `reports/performance.md`.

## Production build and deployment

```bash
npm run build
npm run preview
```

The Vercel project configuration uses `npm run build` and publishes `dist/`. Import this repository into Vercel and deploy the production branch, or run `npx vercel --prod` after authenticating and linking the project. Netlify and Cloudflare Pages can use the same build command and output directory. MSW's worker file is included in the public assets, so the API mocks remain active in the published site. Confirm the public URL in a private browser window and verify that a match, ranking and history still work after a refresh.

No hosting credentials or public deployment URL are stored in this repository. The final public URL must be added here after the owner links the repository to an authorized hosting account.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the implementation and its known tradeoffs.
