# Architecture

## Overview

`App.tsx` owns screen navigation, forms and the small UI state. `GameCanvas.tsx` is the lifecycle boundary between React and Pixi. It initializes Pixi once per match, attaches the stage from `GameEngine`, and always destroys Pixi resources when it unmounts. This matters in React Strict Mode, where effects may be mounted more than once during development.

## Game simulation

`GameEngine` is deliberately framework-free. It owns ships, projectiles, cooldowns, spawns, collisions and elapsed active time. The Pixi ticker provides a timestamp; the engine converts it to seconds and caps an unusually long frame to avoid a jump after a stalled browser. Therefore movement is expressed as `speed * deltaTime`, rather than pixels per frame.

Input is a small shared object. Keyboard and touch buttons only change its booleans; the engine reads it every simulation step. Multiple booleans can be true, so movement and fire work together. The pause flag makes `step` a no-op, which freezes cooldowns, projectiles, spawns and clock together.

The engine publishes a compact `GameSnapshot` for HUD updates. It does not put per-frame entity state in React. A production expansion should throttle this callback to 5–10 Hz; the current interface is intentionally small enough for a readable challenge implementation.

## Collision and combat

The island is a circle and each ship/projectile is approximated by a circle. The checks are distance based: a proposed ship position is rejected if it overlaps the island; cannonballs are destroyed after one target hit, island hit, expiry or arena exit. A destroyed enemy is marked inactive before its view is destroyed, so it cannot fire or score again.

Combat artwork is loaded once by `GameCanvas` before `GameEngine` starts. Cannonballs use the supplied `cannon_ball.png` sprite and keep the latest eight positions for a short Pixi graphics trail. Each damage event throws one or more crew sprites away from the ship; a small pseudo-height arc makes them appear to jump before they land with a water ripple. Ships gain one, two, then three animated fire sprites as health crosses 75%, 50%, and 25%. Destruction plays the three explosion frames in order. These temporary entities are advanced by the same delta-time simulation and are destroyed when they expire or when the game canvas is removed.

All balance values are in `defaultConfig` and typed by `GameConfig`. `Options` persists only the two candidate-facing options and each match receives an immutable merged snapshot when it begins.

## Remote data and recovery

Axios is the only HTTP client. TanStack Query owns cache, retry, loading/error state and refetching for ranking/history. MSW intercepts `/api` in the browser; its handlers share the TypeScript contracts with the client and persist completed rows in local storage. Match IDs are client generated and POST is idempotent, so a retry cannot duplicate a record.

The selectable mock scenarios are normal, deliberate latency, and service error. A failed save remains represented by the Result screen and can be retried; it never blocks another match. Future hardening would store a queue of pending records, replay it at startup, and add deterministic seed/clock injection for fully automated combat tests.

## Assets and accessibility

Vite exposes the supplied `assets` folder as its public directory. The game uses supplied ship, cannonball, crew, fire, explosion, and menu artwork; Pixi draws the water, island, health bars, projectile trails, and splash ripples. The app is responsive for portrait mobile and desktop. Menus use native focusable controls, labels and live status text; keyboard gameplay listeners exist only on the game screen.
