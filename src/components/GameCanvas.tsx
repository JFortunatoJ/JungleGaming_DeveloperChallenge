import { Application, Assets, Texture } from 'pixi.js';
import { useEffect, useRef } from 'react';

import { GameEngine, type GameTextures } from '../game/GameEngine';
import type {
  Controls,
  EndReason,
  EnemyKind,
  GameConfig,
  GameSnapshot,
  MovementVector,
  PlayerWeapon,
} from '../game/types';

let simulatedAssetFailureConsumed = false;

type Props = {
  config: GameConfig;
  controls: React.MutableRefObject<Controls>;
  joystickDirection: React.MutableRefObject<MovementVector>;
  fireRequests: React.MutableRefObject<PlayerWeapon[]>;
  onHud: (value: GameSnapshot) => void;
  onEnd: (reason: EndReason, score: number, duration: number) => void;
  onAssetProgress: (progress: number) => void;
  onAssetsReady: () => void;
  onAssetError: (error: Error) => void;
  paused: boolean;
};

type GameTestBridge = {
  advance: (seconds: number) => void;
  spawnEnemy: (kind: EnemyKind, x: number, y: number) => string;
  setControl: (control: keyof Controls, pressed: boolean) => void;
  snapshot: () => ReturnType<GameEngine['getDebugSnapshot']>;
};

type GameProfileBridge = {
  snapshot: () => ReturnType<GameEngine['getDebugSnapshot']>;
};

declare global {
  interface Window {
    __PIRATE_BATTLE_TEST__?: GameTestBridge;
    __PIRATE_BATTLE_PROFILE__?: GameProfileBridge;
  }
}

const createSeededRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
};

/** This adapter is deliberately thin: it creates/destroys Pixi and forwards commands to the framework-free engine. */
export function GameCanvas({
  config,
  controls,
  joystickDirection,
  fireRequests,
  onHud,
  onEnd,
  onAssetProgress,
  onAssetsReady,
  onAssetError,
  paused,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<GameEngine | null>(null);
  const pausedRef = useRef(paused);
  const testNow = useRef(performance.now());
  const testParams = new URLSearchParams(window.location.search);
  const testMode = import.meta.env.DEV && testParams.get('test') === '1';
  const profileMode = import.meta.env.VITE_ENABLE_GAME_PROFILE === 'true';
  const testSeed = Number(testParams.get('seed') ?? 1);

  useEffect(() => {
    const now = performance.now();
    pausedRef.current = paused;
    if (testMode) testNow.current = now;
    engine.current?.setPaused(paused, now);
  }, [paused, testMode]);

  useEffect(() => {
    // `Application.init` is asynchronous. React Strict Mode deliberately mounts, unmounts,
    // then mounts effects again in development, so cleanup can happen before Pixi is ready.
    // Only destroy the application *after* init has completed.
    let disposed = false;
    let initialized = false;
    let appDestroyed = false;
    let app: Application | null = null;
    let localEngine: GameEngine | null = null;
    let testBridge: GameTestBridge | null = null;
    let profileBridge: GameProfileBridge | null = null;
    const resizeObserver = new ResizeObserver(([entry]) => {
      localEngine?.resize(entry.contentRect.width, entry.contentRect.height);
    });
    resizeObserver.observe(host.current!);

    // Do not use `engine.current` here: an older Strict Mode effect must never destroy
    // the engine created by a newer effect that has already replaced the ref.
    const dispose = () => {
      if (!initialized || !app || appDestroyed) return;
      appDestroyed = true;
      if (testBridge && window.__PIRATE_BATTLE_TEST__ === testBridge) {
        delete window.__PIRATE_BATTLE_TEST__;
      }
      if (profileBridge && window.__PIRATE_BATTLE_PROFILE__ === profileBridge) {
        delete window.__PIRATE_BATTLE_PROFILE__;
      }
      localEngine?.destroy();
      if (engine.current === localEngine) engine.current = null;
      localEngine = null;
      app.destroy({ removeView: true });
    };

    const boot = async () => {
      app = new Application();
      await app.init({
        resizeTo: host.current!,
        background: '#063e5e',
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });
      initialized = true;
      if (testMode) app.ticker.stop();

      if (disposed) {
        dispose();
        return;
      }

      // This one-shot failure hook makes the loading/retry UI reproducible in E2E tests.
      if (
        testMode &&
        testParams.get('failAssetsOnce') === '1' &&
        !simulatedAssetFailureConsumed
      ) {
        simulatedAssetFailureConsumed = true;
        // Give the loading UI enough time to render before the deterministic failure is raised.
        await new Promise((resolve) => window.setTimeout(resolve, 600));
        throw new Error('Simulated asset request failure.');
      }

      // Keep all combat textures in one load step so no ship can enter combat before its effects
      // are ready. Progress and errors are forwarded to React for an accessible loading screen.
      const islandTileIds = [
        6, 7, 8, 9, 22, 23, 24, 25, 38, 39, 40, 41, 54, 55, 56, 57,
      ];
      const assetUrls = [
        '/png/default/tiles/tile_73.png',
        ...islandTileIds.map((id) => `/png/default/tiles/island/tile_${id}.png`),
        '/png/default/tiles/tile_65.png',
        '/png/default/tiles/tile_71.png',
        '/png/default/ships/ship_1.png',
        '/png/default/ships/ship_9.png',
        '/png/default/ships/ship_4.png',
        '/png/default/ships/ship_21.png',
        '/png/default/ships/ship_22.png',
        '/png/default/ui/hud/health_frame.png',
        '/png/default/ui/hud/health_fill_green.png',
        '/png/default/ui/hud/health_fill_amber.png',
        '/png/default/ui/hud/health_fill_red.png',
        '/png/default/ui/hud/enemy_health_frame.png',
        '/png/default/ui/hud/enemy_health_fill_green.png',
        '/png/default/ui/hud/enemy_health_fill_red.png',
        '/png/default/ship_parts/cannon_ball.png',
        ...Array.from({ length: 6 }, (_, index) => `/png/default/ship_parts/crew_${index + 1}.png`),
        '/png/default/effects/fire_1.png',
        '/png/default/effects/fire_2.png',
        '/png/default/effects/explosion_1.png',
        '/png/default/effects/explosion_2.png',
        '/png/default/effects/explosion_3.png',
      ];
      let loadedCount = 0;
      onAssetProgress(0);
      const loadedTextures = await Promise.all(
        assetUrls.map(async (url) => {
          const texture = await Assets.load<Texture>(url);
          loadedCount += 1;
          if (!disposed) onAssetProgress(loadedCount / assetUrls.length);
          return texture;
        }),
      );

      if (disposed) {
        dispose();
        return;
      }

      host.current!.appendChild(app.canvas);
      const [water] = loadedTextures;
      const islandTiles = Object.fromEntries(
        islandTileIds.map((id, index) => [id, loadedTextures[index + 1]]),
      ) as Record<number, Texture>;
      const [
        islandRock,
        islandFoliage,
        player,
        chaser,
        shooter,
        defeatedChaser,
        defeatedShooter,
        playerHealthFrame,
        playerHealthGreen,
        playerHealthAmber,
        playerHealthRed,
        enemyHealthFrame,
        enemyHealthGreen,
        enemyHealthRed,
        cannonBall,
        ...effectTextures
      ] = loadedTextures.slice(1 + islandTileIds.length);
      const textures: GameTextures = {
        ships: { player, chaser, shooter },
        defeated: { chaser: defeatedChaser, shooter: defeatedShooter },
        healthBars: {
          player: {
            frame: playerHealthFrame,
            green: playerHealthGreen,
            amber: playerHealthAmber,
            red: playerHealthRed,
          },
          enemy: {
            frame: enemyHealthFrame,
            green: enemyHealthGreen,
            amber: playerHealthAmber,
            red: enemyHealthRed,
          },
        },
        cannonBall,
        water,
        islandTiles,
        islandRock,
        islandFoliage,
        crew: effectTextures.slice(0, 6),
        fire: effectTextures.slice(6, 8),
        explosions: effectTextures.slice(8, 11),
      };
      const random = testMode ? createSeededRandom(testSeed) : undefined;
      const gameEngine = (localEngine = new GameEngine(config, onHud, onEnd, textures, random));
      gameEngine.resize(host.current!.clientWidth, host.current!.clientHeight);
      engine.current = gameEngine;
      app.stage.addChild(gameEngine.stage);
      if (profileMode) {
        profileBridge = { snapshot: () => gameEngine.getDebugSnapshot() };
        window.__PIRATE_BATTLE_PROFILE__ = profileBridge;
      }
      const startNow = performance.now();
      testNow.current = startNow;
      gameEngine.setPaused(pausedRef.current, startNow);
      gameEngine.start(startNow);

      const syncControls = () => {
        for (const [key, value] of Object.entries(controls.current)) {
          gameEngine.setControl(key as keyof Controls, value);
        }
        gameEngine.setJoystickDirection(joystickDirection.current);

        for (const weapon of fireRequests.current.splice(0)) {
          gameEngine.firePlayerWeapon(weapon);
        }
      };

      if (testMode) {
        testBridge = {
          setControl: (control, pressed) => gameEngine.setControl(control, pressed),
          spawnEnemy: (kind, x, y) => gameEngine.spawnEnemyForTest(kind, x, y),
          snapshot: () => gameEngine.getDebugSnapshot(),
          advance: (seconds) => {
            let remaining = Math.max(0, seconds);
            let now = testNow.current;

            while (remaining > 0) {
              const delta = Math.min(0.05, remaining);
              now += delta * 1000;
              syncControls();
              gameEngine.step(now);
              remaining -= delta;
            }

            testNow.current = now;
            app?.render();
          },
        };
        window.__PIRATE_BATTLE_TEST__ = testBridge;
      } else {
        app.ticker.add(() => {
          syncControls();
          gameEngine.step(performance.now());
        });
      }

      if (testMode) app.render();
      onAssetsReady();
    };

    void boot().catch((cause: unknown) => {
      if (disposed) return;
      const error = cause instanceof Error ? cause : new Error('Unknown asset loading error');
      onAssetError(error);
      dispose();
    });

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      dispose();
    };
  }, [
    config,
    onHud,
    onEnd,
    onAssetProgress,
    onAssetsReady,
    onAssetError,
    testMode,
    profileMode,
    testSeed,
  ]);

  return <div className="canvas" ref={host} role="region" aria-label="Pirate battle arena" />;
}
