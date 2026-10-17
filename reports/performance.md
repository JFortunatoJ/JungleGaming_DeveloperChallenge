# Performance profile

Measured on 2026-10-17 from the optimized `build:profile` output using the isolated Playwright profiling run. The full raw measurements, including the 35 entity samples and heap values, are in [`performance-profile.json`](performance-profile.json). The browser's detailed Playwright report is in [`performance-playwright/`](performance-playwright/).

## Environment and scenario

- Windows 11 (build 26200), AMD Ryzen 5 2600, 12 logical processors.
- Playwright headless Chromium 155.0.8059.84, Node.js 24.13.0.
- Viewport 1280×720 at device pixel ratio 1. GPU acceleration mode was not independently verified, so these figures are a local automation reference, not a claim for every end-user device.
- One 180-second match, 30-second spawn interval. The profile driver held movement, turning and all three weapons; the match ended by time with 3 points.

## Results

- 10,789 animation frames over 180.016 seconds: **59.93 average FPS**.
- **16.8 ms p95 frame interval** versus a 16.67 ms budget at 60 FPS. This is close to the target, but the p95 is slightly above it; the measured environment does not strictly meet the 60 FPS target at every percentile.
- 35 snapshots sampled every five seconds. Sampled peaks: 2 active ships, 1 sinking ship, 12 projectiles, 3 crew, 2 splashes and 8 impact particles. No increasing entity count was observed across the match.
- After forced garbage collection at each menu teardown, heap use was 15.33, 15.56, 15.72, 15.87 and 16.01 MiB across five start/play/exit cycles. That is **0.68 MiB growth from cycle 1 to cycle 5**, or 0.89 MiB above the post-match reading.

## Investigation and limitation

The teardown path disconnects the resize observer, clears the control interval, destroys the Pixi engine/display tree and application ticker/renderer, and clears active one-shot audio. Repeating the five-cycle measurement after explicitly releasing overlapping audio effects and allowing a one-second settle period produced a similar small, monotonic heap increase. The measured growth is below 1 MiB over these five cycles and no gameplay entity accumulation was seen, but the short run is not sufficient to prove that memory plateaus. Treat it as an item for heap-snapshot comparison on the target browser/GPU before making a stronger leak-free claim.

The complete reproducible command is documented in [`README.md`](../README.md#tests-and-reports). The default deployment build does not include the profiling bridge.
