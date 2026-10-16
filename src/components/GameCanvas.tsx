import { Application, Assets, Texture } from 'pixi.js';
import { useEffect, useRef } from 'react';

import { GameEngine, type ShipTextures } from '../game/GameEngine';
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
      const [player, chaser, shooter] = await Promise.all(
        ['/png/default/ships/ship_1.png', '/png/default/ships/ship_9.png', '/png/default/ships/ship_16.png'].map(
          (url) => Assets.load<Texture>(url),
        ),
      );

      if (disposed) {
        dispose();
        return;
      }

      host.current!.appendChild(app.canvas);
      const textures: ShipTextures = { player, chaser, shooter };
      const gameEngine = (localEngine = new GameEngine(config, onHud, onEnd, textures));
      engine.current = gameEngine;
      app.stage.addChild(gameEngine.stage);
      app.ticker.add(() => gameEngine.step(performance.now()));
      gameEngine.start(performance.now());
    };

    void boot();

    return () => {
      disposed = true;
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
