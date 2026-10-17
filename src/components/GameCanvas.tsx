import { Application, Assets, Texture } from 'pixi.js';
import { useEffect, useRef } from 'react';

import { GameEngine, type GameTextures } from '../game/GameEngine';
import type { Controls, EndReason, GameConfig, GameSnapshot } from '../game/types';

type Props = {
  config: GameConfig;
  controls: React.MutableRefObject<Controls>;
  onHud: (value: GameSnapshot) => void;
  onEnd: (reason: EndReason, score: number, duration: number) => void;
  paused: boolean;
};

/** This adapter is deliberately thin: it creates/destroys Pixi and forwards commands to the framework-free engine. */
export function GameCanvas({ config, controls, onHud, onEnd, paused }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<GameEngine | null>(null);

  useEffect(() => {
    // `Application.init` is asynchronous. React Strict Mode deliberately mounts, unmounts,
    // then mounts effects again in development, so cleanup can happen before Pixi is ready.
    // Only destroy the application *after* init has completed.
    let disposed = false;
    let initialized = false;
    let app: Application | null = null;
    let localEngine: GameEngine | null = null;
    const resizeObserver = new ResizeObserver(([entry]) => {
      localEngine?.resize(entry.contentRect.width, entry.contentRect.height);
    });
    resizeObserver.observe(host.current!);

    // Do not use `engine.current` here: an older Strict Mode effect must never destroy
    // the engine created by a newer effect that has already replaced the ref.
    const dispose = () => {
      if (!initialized || !app) return;
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

      // Pixi v8 does not turn an arbitrary URL into a ready Texture synchronously. Loading here
      // also gives this boundary one clear place to add a progress/error UI in a later iteration.
      // Keep all combat textures in one load step so no ship can enter combat before its effects
      // are ready. The slices below follow the same order as this list.
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
      const loadedTextures = await Promise.all(
        assetUrls.map((url) => Assets.load<Texture>(url)),
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
      const gameEngine = (localEngine = new GameEngine(config, onHud, onEnd, textures));
      gameEngine.resize(host.current!.clientWidth, host.current!.clientHeight);
      engine.current = gameEngine;
      app.stage.addChild(gameEngine.stage);
      app.ticker.add(() => gameEngine.step(performance.now()));
      gameEngine.start(performance.now());
    };

    void boot();

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      dispose();
    };
  }, [config, onHud, onEnd]);

  useEffect(() => {
    engine.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      for (const [key, value] of Object.entries(controls.current)) {
        engine.current?.setControl(key as keyof Controls, value);
      }
    }, 30);

    return () => clearInterval(timer);
  }, [controls]);

  return <div className="canvas" ref={host} aria-label="Pirate battle arena" />;
}
