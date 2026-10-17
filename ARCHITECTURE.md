# Architecture

## Application boundaries

`src/App.tsx` owns screen navigation, options, the HUD snapshot, pause state and match-result submission. Menus, forms, logs and dialogs are React components; `src/styles.css` handles responsive layout and visual states. `src/components/GameCanvas.tsx` is the React/PixiJS lifecycle adapter. The rules and moving entities live in `src/game/GameEngine.ts`, which does not depend on React.

This boundary keeps React out of the per-frame simulation: the engine publishes a compact HUD snapshot at most ten times per second and immediately on pause or match end. React therefore updates readable UI without reconciling every animation frame.

## PixiJS startup and cleanup

`GameCanvas` initializes Pixi asynchronously, loads the complete combat texture set before starting the engine, reports progress/errors to React and supports a retry. The first Strict Mode effect checks its disposal flag after initialization so it cannot start duplicate asset loads after React's development-only mount/unmount cycle. Cleanup disconnects the resize observer, destroys the engine's display objects, detaches the ticker through application destruction and removes the canvas. Textures are reused through Pixi's shared `Assets` cache.

The engine uses a 960×540 logical arena. Resize applies a uniform scale and letterboxing, preserving aspect ratio and keeping input/game coordinates in the same space. Pixi uses the device pixel ratio for the backing canvas. The supplied water and island tiles form the scenery; islands have explicit collision radii independent of their decorative tile silhouettes.

## Simulation, input and collisions

`GameEngine.step(timestamp)` converts ticker time to seconds and caps unusually long frame deltas. Movement, rotation, cooldowns, projectiles, fire, impacts, crew, explosions and match time advance using delta time. A pause makes the simulation step a no-op. `src/App.tsx` maps keyboard and pointer/touch inputs into one set of control booleans, allowing movement and multiple attacks at once; listeners are installed only while the game screen is active. A hidden tab or lost focus pauses and requires an explicit resume.

Ships and islands use circle approximations for collision checks. Ship moves are clamped to the arena and rejected when they overlap an island. Projectiles are removed on their first hit, island collision, expiry or arena exit; their separate front/port/starboard cooldowns prevent one weapon from blocking another. Chasers pursue and damage by impact. Shooters approach, then fire within range. Enemy route planning builds a visibility graph around inflated island circles and routes along sampled safe arcs when direct travel is blocked. Configured spawn points are filtered against the player, existing ships and island obstacles.

An enemy is marked inactive immediately on defeat so it cannot collide, fire or score twice. Its matching defeated ship sprite remains for a short fade before its display objects are destroyed. Cannonballs use the supplied sprite and a tapered fading trail. Damage emits impact particles and crew-overboard sprites; low health adds animated fire; destruction plays the explosion frames. These temporary display entities have simulation lifetimes and are cleaned up on expiry or engine destruction.

Balance values are typed in `src/game/types.ts`. `defaultConfig` contains the spawn pattern/positions, health, movement, turning, damage, projectile speed/lifetime, cooldowns and Shooter range. Options persist only session duration and spawn interval. Starting a match merges those options into an immutable active snapshot, so edits affect subsequent matches rather than a match in progress.

## Local persistence and API data

`src/game/storage.ts` validates and persists options, the last completed result and pending submissions in local storage. Abandoning a match navigates away without creating a result. A completed match is shown even if its network submission fails; the user may retry, start another match or return later. At startup, pending records are replayed. Match IDs are idempotency keys.

The API layer is split into `src/api/contracts.ts`, `client.ts`, `mocks.ts` and `browser.ts`. Axios owns HTTP requests; TanStack Query owns ranking/history cache, status, retry and invalidation. MSW intercepts `/api/ranking`, `/api/history` and `/api/matches` in both development and the published static build. Fixed fixtures make the ranking reproducible; only the current player appears in match history. Ranking filters by session/spawn configuration and sorts by score, completion time and ID for deterministic ties. A confirmed submission is visible to both queries after invalidation.

Network scenarios are selectable in the menu: normal, empty, slow, variable latency, out-of-order, timeout, connection error, HTTP 400/503, ranking-only failure, history-only failure and timeout-after-save. The latter commits once before its first response times out; retry/reload returns the existing record instead of duplicating it. Reset clears mock records, timed-out request markers and pending submissions.

## Accessibility, mobile and test seams

React UI uses semantic buttons, labeled controls, progress/status and alert regions, keyboard focus, and focus management in dialogs. An off-screen semantic status exposes score, time and health without per-frame announcements. Touch controls share the same input state as keyboard controls. On mobile, a drag joystick maps eight directions to forward/reverse movement and steering; cannon buttons remain independent. Gameplay pauses in portrait and the accessible orientation prompt remains until landscape returns. Play requests fullscreen with hidden navigation UI from the player's gesture; the pause menu can toggle it later, and fullscreen remains active on the result screen. Orientation locking is attempted after fullscreen where supported, but browser and OS policy may refuse either request.

The development-only `?test=1&seed=731` bridge exposes a read-only simulation snapshot, seeded randomness, deterministic time advancement and a way for E2E tests to place an enemy while still exercising real game inputs and combat rules. The one-shot `&failAssetsOnce=1` parameter only simulates an asset-load error to test the accessible retry state. Neither hook is included in the normal production build. The separate `build:profile` mode exposes only a read-only snapshot for the opt-in three-minute performance test; it is not used for deployment.

## Known tradeoffs

- Collision shapes are circles, not pixel-perfect hull polygons. Island art can extend beyond its conservative circular collision boundary.
- Pathfinding is a small graph search over sampled island arcs, appropriate for the fixed arena rather than a general navigation library.
- Ranking and history are a browser-local simulation with shared fixtures, not a server-backed multi-user service; clearing site data clears local records.
- Orientation lock is a browser request, not a guarantee. The portrait prompt remains available when it is unsupported or denied.
- The initial Pixi bundle is larger than the typical UI bundle because Pixi rendering modules are included together; inspect the build output before adding more rendering features.

## Validation

`npm run typecheck`, `npm run lint`, `npm run build` and `npm run test:e2e` are the project checks. Playwright runs desktop Chromium and touch-enabled mobile landscape tests, writes an HTML report under `reports/playwright/` and saves failure traces/screenshots under `reports/test-results/`. The three visual baselines are versioned under `tests/visual.spec.ts-snapshots/`. `build:profile` plus `test:e2e:performance` measures the optimized game for three minutes, captures frame and entity metrics, checks heap usage after five cleanup cycles, and writes JSON/HTML results under `reports/`.
