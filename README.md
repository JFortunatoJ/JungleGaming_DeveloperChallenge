# Pirate Battle

React, TypeScript, PixiJS naval shooter built from the Jungle Gaming technical challenge. Delivery/deployment work (challenge step 11) is intentionally out of scope for this iteration.

## Run locally

```bash
npm install
npm run dev
```

`npm run build` builds the production bundle and `npm run typecheck` performs strict TypeScript validation.

## Controls

`W`/Up moves, `A`/Left and `D`/Right turn, Space fires forward, and `Q`/`E` fire port/starboard broadsides. Touch controls appear on narrow screens. Escape or the HUD button pauses. Leaving focus also pauses and requires explicit Resume.

## Settings and mock network

Options persist session time (60–180 seconds) and spawn interval (1–30 seconds). The main menu exposes normal, slow and service-error MSW scenarios plus a reset for mock data. Ranking and match-history requests use Axios through TanStack Query.

See [ARCHITECTURE.md](ARCHITECTURE.md) for code structure and tradeoffs.
