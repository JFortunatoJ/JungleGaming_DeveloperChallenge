import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { GameCanvas } from './components/GameCanvas';
import { getHistory, getRanking, recordMatch } from './api/client';
import { resetMockData } from './api/mocks';
import { loadLastResult, loadOptions, saveLastResult, saveOptions } from './game/storage';
import {
  defaultConfig,
  defaultControls,
  type Controls,
  type EndReason,
  type GameOptions,
  type GameSnapshot,
  type MatchResult,
} from './game/types';

type Screen = 'menu' | 'options' | 'game' | 'result';
type Tab = 'ranking' | 'history';

const labels: Record<keyof Controls, string> = {
  forward: 'Forward (W / ↑)',
  left: 'Turn left (A / ←)',
  right: 'Turn right (D / →)',
  front: 'Front fire (Space)',
  port: 'Port broadside (Q)',
  starboard: 'Starboard broadside (E)',
};

const initialHud: GameSnapshot = {
  health: 100,
  score: 0,
  remaining: 90,
  enemies: 0,
  paused: false,
};

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [options, setOptions] = useState<GameOptions>(loadOptions);
  const [hud, setHud] = useState(initialHud);
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState<MatchResult | null>(loadLastResult);

  const controls = useRef(defaultControls());
  const queryClient = useQueryClient();

  const {
    mutate: saveMatch,
    isPending: isSaving,
    isError: saveFailed,
  } = useMutation({
    mutationFn: recordMatch,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['records'] }),
  });

  const play = () => {
    setHud({
      ...initialHud,
      health: defaultConfig.playerHealth,
      remaining: options.sessionSeconds,
    });
    setPaused(false);
    controls.current = defaultControls();
    setScreen('game');
  };

  // Pixi must not be re-created when the HUD changes. These references change only for a new match configuration.
  const gameConfig = useMemo(() => ({ ...defaultConfig, ...options }), [options]);

  const end = useCallback(
    (reason: EndReason, score: number, duration: number) => {
      const match = {
        id: crypto.randomUUID(),
        playerId: 'You',
        completedAt: new Date().toISOString(),
        score,
        duration,
        reason,
        configuration: options,
      };

      saveLastResult(match);
      setResult(match);
      saveMatch(match);
      setScreen('result');
    },
    [options, saveMatch],
  );

  useEffect(() => {
    if (screen !== 'game') return;

    const down = (e: KeyboardEvent) => {
      const map: Record<string, keyof Controls> = {
        w: 'forward',
        arrowup: 'forward',
        a: 'left',
        arrowleft: 'left',
        d: 'right',
        arrowright: 'right',
        ' ': 'front',
        q: 'port',
        e: 'starboard',
      };

      const key = map[e.key.toLowerCase()];
      if (key) {
        e.preventDefault();
        controls.current[key] = true;
      }

      if (e.key === 'Escape') setPaused((value) => !value);
    };

    const up = (e: KeyboardEvent) => {
      const map: Record<string, keyof Controls> = {
        w: 'forward',
        arrowup: 'forward',
        a: 'left',
        arrowleft: 'left',
        d: 'right',
        arrowright: 'right',
        ' ': 'front',
        q: 'port',
        e: 'starboard',
      };

      const key = map[e.key.toLowerCase()];
      if (key) controls.current[key] = false;
    };

    const blur = () => setPaused(true);

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', blur);

    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', blur);
    };
  }, [screen]);

  if (screen === 'options') {
    return (
      <Options
        options={options}
        onSave={(value) => {
          setOptions(value);
          saveOptions(value);
          setScreen('menu');
        }}
        onBack={() => setScreen('menu')}
      />
    );
  }

  if (screen === 'game') {
    return (
      <main className="game">
        <header className="hud">
          <span>♥ {Math.ceil(hud.health)}</span>
          <span>★ {hud.score}</span>
          <span>◷ {hud.remaining}s</span>
          <button onClick={() => setPaused(true)}>Pause</button>
        </header>

        <GameCanvas
          config={gameConfig}
          controls={controls}
          onHud={setHud}
          onEnd={end}
          paused={paused}
        />

        <p className="sr-only" aria-live="polite">
          Health {Math.ceil(hud.health)}, score {hud.score}, {hud.remaining} seconds
          remaining{paused ? ', paused' : ''}
        </p>

        <TouchControls controls={controls} />

        {paused && (
          <div className="overlay">
            <section>
              <h2>Paused</h2>
              <p>The simulation and cooldowns are frozen.</p>
              <button autoFocus onClick={() => setPaused(false)}>
                Resume
              </button>
              <button onClick={() => setScreen('menu')}>Abandon match</button>
            </section>
          </div>
        )}
      </main>
    );
  }

  if (screen === 'result' && result) {
    return (
      <Result
        result={result}
        saving={isSaving}
        error={saveFailed}
        retry={() => saveMatch(result)}
        play={play}
        menu={() => setScreen('menu')}
      />
    );
  }

  return <Menu play={play} options={() => setScreen('options')} />;
}

function Menu({ play, options }: { play: () => void; options: () => void }) {
  const [tab, setTab] = useState<Tab>('ranking');

  return (
    <main className="menu">
      <section className="hero">
        <img src="/png/default/ui/menu/title_pirate_battle.png" alt="Pirate Battle" />
        <p>Survive the sea, sink enemy ships, and climb the leaderboard.</p>
        <button autoFocus onClick={play}>
          Play
        </button>
        <button className="secondary" onClick={options}>
          Options
        </button>
        <p className="controls-copy">
          W/↑ move · A/D rotate · Space front fire · Q/E broadsides
        </p>
      </section>

      <section className="panel">
        <div role="tablist">
          <button role="tab" aria-selected={tab === 'ranking'} onClick={() => setTab('ranking')}>
            Ranking
          </button>
          <button role="tab" aria-selected={tab === 'history'} onClick={() => setTab('history')}>
            Match History
          </button>
        </div>

        {tab === 'ranking' ? <Records kind="ranking" /> : <Records kind="history" />}

        <NetworkControls />
      </section>
    </main>
  );
}

function Records({ kind }: { kind: Tab }) {
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['records', kind, page],
    queryFn: () => (kind === 'ranking' ? getRanking(page) : getHistory(page)),
    retry: 1,
    staleTime: 10000,
  });

  if (query.isPending) return <p>Loading {kind}…</p>;

  if (query.isError) {
    return (
      <p role="alert">
        Could not load {kind}. <button onClick={() => query.refetch()}>Retry</button>
      </p>
    );
  }

  return (
    <div>
      <ul className="records">
        {query.data.items.length ? (
          query.data.items.map((item) => (
            <li key={item.id}>
              <strong>{item.playerId}</strong>
              <span>{item.score} pts</span>
              <small>{new Date(item.completedAt).toLocaleDateString()}</small>
            </li>
          ))
        ) : (
          <li>No matches recorded yet.</li>
        )}
      </ul>

      <div className="pager">
        <button disabled={page === 1} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <span>
          {page} / {query.data.totalPages}
        </span>
        <button disabled={page === query.data.totalPages} onClick={() => setPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

function NetworkControls() {
  const [scenario, setScenario] = useState(() => localStorage.getItem('pirate-battle/network-scenario') ?? 'normal');

  const update = (value: string) => {
    setScenario(value);
    localStorage.setItem('pirate-battle/network-scenario', value);
  };

  return (
    <label className="network">
      Network scenario
      <select value={scenario} onChange={(event) => update(event.target.value)}>
        <option value="normal">Normal</option>
        <option value="slow">Slow (900 ms)</option>
        <option value="error">Service unavailable</option>
      </select>
      <button
        onClick={() => {
          resetMockData();
          location.reload();
        }}
      >
        Reset mock data
      </button>
    </label>
  );
}

function Options({
  options,
  onSave,
  onBack,
}: {
  options: GameOptions;
  onSave: (value: GameOptions) => void;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState(options);
  const valid =
    draft.sessionSeconds >= 60 &&
    draft.sessionSeconds <= 180 &&
    draft.spawnSeconds >= 1 &&
    draft.spawnSeconds <= 30;

  return (
    <main className="menu">
      <section className="hero">
        <h1>Options</h1>

        <label>
          Game session time (60–180 seconds)
          <input
            type="number"
            min="60"
            max="180"
            value={draft.sessionSeconds}
            onChange={(event) => setDraft({ ...draft, sessionSeconds: +event.target.value })}
          />
        </label>

        <label>
          Enemy spawn time (1–30 seconds)
          <input
            type="number"
            min="1"
            max="30"
            value={draft.spawnSeconds}
            onChange={(event) => setDraft({ ...draft, spawnSeconds: +event.target.value })}
          />
        </label>

        <p>
          The selected values are saved locally and are captured when a new match starts.
        </p>

        <button disabled={!valid} onClick={() => onSave(draft)}>
          Save options
        </button>
        <button className="secondary" onClick={onBack}>
          Back
        </button>

        {!valid && <p role="alert">Please use values within the documented limits.</p>}
      </section>
    </main>
  );
}

function TouchControls({ controls }: { controls: React.MutableRefObject<Controls> }) {
  const bind = (control: keyof Controls) => ({
    onPointerDown: () => {
      controls.current[control] = true;
    },
    onPointerUp: () => {
      controls.current[control] = false;
    },
    onPointerLeave: () => {
      controls.current[control] = false;
    },
  });

  return (
    <nav className="touch" aria-label="Touch game controls">
      {(Object.keys(labels) as (keyof Controls)[]).map((control) => (
        <button key={control} {...bind(control)} aria-label={labels[control]}>
          {control === 'forward'
            ? '↑'
            : control === 'left'
              ? '↶'
              : control === 'right'
                ? '↷'
                : control === 'front'
                  ? '●'
                  : control === 'port'
                    ? '◀'
                    : '▶'}
        </button>
      ))}
    </nav>
  );
}

function Result({
  result,
  saving,
  error,
  retry,
  play,
  menu,
}: {
  result: MatchResult;
  saving: boolean;
  error: boolean;
  retry: () => void;
  play: () => void;
  menu: () => void;
}) {
  return (
    <main className="menu">
      <section className="hero">
        <h1>Battle complete</h1>
        <p className="score">{result.score} points</p>
        <p>
          Played {result.duration}s · Ended by{' '}
          {result.reason === 'time' ? 'time limit' : 'ship destroyed'}.
        </p>
        <p role="status">
          {saving
            ? 'Saving match…'
            : error
              ? 'Match pending: the game remains available.'
              : 'Match recorded in history and ranking.'}
        </p>

        {error && <button onClick={retry}>Try again</button>}
        <button onClick={play}>Play again</button>
        <button className="secondary" onClick={menu}>
          Main menu
        </button>
      </section>
    </main>
  );
}
