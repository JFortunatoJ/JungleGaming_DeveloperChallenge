import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { GameCanvas } from './components/GameCanvas';
import { getHistory, getRanking, recordMatch } from './api/client';
import { resetMockData } from './api/mocks';
import { playSound, setGameAudioPaused, startGameAudio, stopGameAudio } from './game/audio';
import { loadLastResult, loadOptions, saveLastResult, saveOptions } from './game/storage';
import {
  defaultConfig,
  defaultControls,
  type Controls,
  type EndReason,
  type GameConfig,
  type GameOptions,
  type GameSnapshot,
  type MatchResult,
} from './game/types';

type Screen = 'menu' | 'options' | 'game' | 'result' | 'ranking' | 'history';
type Tab = 'ranking' | 'history';
type DeviceOrientation = { mobile: boolean; landscape: boolean };

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

const readDeviceOrientation = (): DeviceOrientation => ({
  mobile:
    window.matchMedia('(pointer: coarse)').matches ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent),
  landscape: window.matchMedia('(orientation: landscape)').matches,
});

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [options, setOptions] = useState<GameOptions>(loadOptions);
  const [activeConfig, setActiveConfig] = useState<GameConfig>(() => ({
    ...defaultConfig,
    ...loadOptions(),
  }));
  const [hud, setHud] = useState(initialHud);
  const [paused, setPaused] = useState(false);
  const [pauseOptionsOpen, setPauseOptionsOpen] = useState(false);
  const [result, setResult] = useState<MatchResult | null>(loadLastResult);
  const [deviceOrientation, setDeviceOrientation] = useState<DeviceOrientation>(() =>
    readDeviceOrientation(),
  );

  const controls = useRef(defaultControls());
  const queryClient = useQueryClient();

  useEffect(() => {
    const updateOrientation = () => setDeviceOrientation(readDeviceOrientation());
    window.addEventListener('resize', updateOrientation);
    window.addEventListener('orientationchange', updateOrientation);

    return () => {
      window.removeEventListener('resize', updateOrientation);
      window.removeEventListener('orientationchange', updateOrientation);
    };
  }, []);

  useEffect(() => {
    if (screen !== 'game') window.screen.orientation?.unlock();
  }, [screen]);

  const needsLandscape =
    screen === 'game' && deviceOrientation.mobile && !deviceOrientation.landscape;

  const {
    mutate: saveMatch,
    isPending: isSaving,
    isError: saveFailed,
  } = useMutation({
    mutationFn: recordMatch,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['records'] }),
  });

  const play = () => {
    if (deviceOrientation.mobile && window.screen.orientation?.lock) {
      void window.screen.orientation.lock('landscape').catch(() => undefined);
    }
    startGameAudio();
    setActiveConfig({ ...defaultConfig, ...options });
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
  const gameConfig = useMemo(() => activeConfig, [activeConfig]);
  const playerHealthRatio = Math.min(1, Math.max(0, hud.health / gameConfig.playerHealth));
  const playerHealthFill =
    playerHealthRatio < 0.25
      ? 'health_fill_red.png'
      : playerHealthRatio <= 0.5
        ? 'health_fill_amber.png'
        : 'health_fill_green.png';

  const pauseGame = () => {
    setPaused(true);
    setGameAudioPaused(true);
  };

  const resumeGame = () => {
    setPaused(false);
    setGameAudioPaused(false);
  };

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
      playSound(reason === 'time' ? 'game_complete' : 'game_over');
      stopGameAudio();
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

      if (e.key === 'Escape' && !e.repeat) {
        if (paused) resumeGame();
        else pauseGame();
      }
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

    const blur = () => {
      if (document.visibilityState === 'visible' && document.hasFocus()) return;
      if (!paused) pauseGame();
    };

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
  }, [paused, screen]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('button:not(:disabled)')) {
        if (!target.closest('.hud-pause')) playSound('ui_click');
      }
    };

    const handleHover = (event: PointerEvent) => {
      const target = event.target;
      const previous = event.relatedTarget;
      if (!(target instanceof Element)) return;

      const button = target.closest('button:not(:disabled)');
      const previousButton = previous instanceof Element ? previous.closest('button') : null;
      if (button && button !== previousButton) playSound('ui_hover');
    };

    document.addEventListener('click', handleClick);
    document.addEventListener('pointerover', handleHover);

    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('pointerover', handleHover);
    };
  }, []);

  if (screen === 'options') {
    return (
      <Options
        options={options}
        onSave={(value) => {
          setOptions(value);
          saveOptions(value);
          playSound('ui_close');
          setScreen('menu');
        }}
        onBack={() => {
          playSound('ui_back');
          setScreen('menu');
        }}
      />
    );
  }

  if (screen === 'game') {
    return (
      <main className="game">
        <header className="game-hud" aria-label="Game status">
          <div className="player-health-hud">
            <img className="hud-heart" src="/png/default/ui/hud/icon_heart.png" alt="" />
            <div
              className="health-meter"
              role="progressbar"
              aria-label="Player ship health"
              aria-valuemin={0}
              aria-valuemax={gameConfig.playerHealth}
              aria-valuenow={Math.ceil(hud.health)}
            >
              <div
                className="health-meter-fill"
                style={
                  {
                    '--health': `${playerHealthRatio * 100}%`,
                    '--health-fill': `url('/png/default/ui/hud/${playerHealthFill}')`,
                  } as CSSProperties
                }
              />
              <img
                className="health-meter-frame"
                src="/png/default/ui/hud/health_frame.png"
                alt=""
              />
              <span>
                {Math.ceil(hud.health)} / {gameConfig.playerHealth}
              </span>
            </div>
          </div>

          <div className="hud-stats">
            <div className="hud-counter" aria-label={`Score ${hud.score}`}>
              <img
                className="hud-counter-panel"
                src="/png/default/ui/hud/counter_panel.png"
                alt=""
              />
              <img
                className="hud-counter-icon"
                src="/png/default/ui/hud/icon_score.png"
                alt=""
              />
              <strong>{hud.score}</strong>
            </div>
            <div className="hud-counter" aria-label={`${hud.remaining} seconds remaining`}>
              <img
                className="hud-counter-panel"
                src="/png/default/ui/hud/counter_panel.png"
                alt=""
              />
              <img
                className="hud-counter-icon"
                src="/png/default/ui/hud/icon_time.png"
                alt=""
              />
              <strong>
                {String(Math.floor(hud.remaining / 60)).padStart(2, '0')}:
                {String(hud.remaining % 60).padStart(2, '0')}
              </strong>
            </div>
            <button className="hud-pause" onClick={pauseGame} aria-label="Pause game">
              <img
                className="hud-pause-button"
                src="/png/default/ui/controls/button_round_normal.png"
                alt=""
              />
              <img
                className="hud-pause-icon"
                src="/png/default/ui/controls/icon_pause.png"
                alt=""
              />
            </button>
          </div>
        </header>

        <GameCanvas
          config={gameConfig}
          controls={controls}
          onHud={setHud}
          onEnd={end}
          paused={paused || needsLandscape}
        />

        {needsLandscape && (
          <div className="orientation-warning" role="alert" aria-live="assertive">
            <div className="orientation-warning-panel">
              <span className="orientation-phone" aria-hidden="true">▯</span>
              <h1>Rotate your device</h1>
              <p>Turn your phone sideways to continue playing.</p>
            </div>
          </div>
        )}

        <p className="sr-only" aria-live="polite">
          Health {Math.ceil(hud.health)}, score {hud.score}, {hud.remaining} seconds
          remaining{paused ? ', paused' : ''}
        </p>

        <TouchControls controls={controls} />

        {paused && (
          <PauseOverlay
            options={options}
            settingsOpen={pauseOptionsOpen}
            onResume={() => {
              setPauseOptionsOpen(false);
              resumeGame();
            }}
            onOptions={() => {
              playSound('ui_open');
              setPauseOptionsOpen(true);
            }}
            onSaveOptions={(value) => {
              setOptions(value);
              saveOptions(value);
              setPauseOptionsOpen(false);
              playSound('ui_close');
            }}
            onBackToPause={() => {
              setPauseOptionsOpen(false);
              playSound('ui_back');
            }}
            onMainMenu={() => {
              setPauseOptionsOpen(false);
              stopGameAudio();
              playSound('ui_close');
              setScreen('menu');
            }}
          />
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
        play={play}
        menu={() => {
          playSound('ui_back');
          setScreen('menu');
        }}
      />
    );
  }

  if (screen === 'ranking' || screen === 'history') {
    return (
      <LogScreen
        kind={screen}
        options={options}
        onChangeTab={setScreen}
        onMainMenu={() => {
          playSound('ui_back');
          setScreen('menu');
        }}
      />
    );
  }

  return (
    <Menu
      play={play}
      options={() => {
        playSound('ui_open');
        setScreen('options');
      }}
      ranking={() => {
        playSound('ui_open');
        setScreen('ranking');
      }}
      history={() => {
        playSound('ui_open');
        setScreen('history');
      }}
    />
  );
}

function Menu({
  play,
  options,
  ranking,
  history,
}: {
  play: () => void;
  options: () => void;
  ranking: () => void;
  history: () => void;
}) {
  return (
    <main className="scene-screen menu-screen">
      <section className="menu-frame framed-panel" aria-label="Main menu">
        <img
          className="game-logo"
          src="/png/default/ui/menu/title_pirate_battle.png"
          alt="Pirate Battle"
        />
        <p className="tagline">Set sail. Take command.</p>

        <div className="main-actions">
          <WoodButton onClick={play}>Play</WoodButton>
          <WoodButton onClick={options}>Options</WoodButton>
        </div>

        <div className="menu-flourish" aria-hidden="true">
          <img src="/png/default/ships/ship_1.png" alt="" />
          <p>Navigate the islands. Survive the battle.</p>
        </div>

        <div className="menu-logs">
          <WoodButton variant="secondary" onClick={ranking}>
            Ranking
          </WoodButton>
          <WoodButton variant="secondary" onClick={history}>
            Match History
          </WoodButton>
        </div>

      </section>
      <NetworkControls />
    </main>
  );
}

function WoodButton({
  children,
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' }) {
  return (
    <button
      className={`wood-button wood-button-${variant} ${className}`.trim()}
      {...props}
    >
      <span>{children}</span>
    </button>
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

  const items = query.data.items;

  return (
    <>
      <div className="record-table-wrap">
        <table className="record-table">
          {kind === 'ranking' ? (
            <>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Captain</th>
                  <th>Points</th>
                  <th>Played</th>
                </tr>
              </thead>
              <tbody>
                {items.length ? (
                  items.map((item, index) => (
                    <tr key={item.id} className={item.playerId === 'You' ? 'record-current' : ''}>
                      <td>{String((page - 1) * 5 + index + 1).padStart(2, '0')}</td>
                      <td>{item.playerId}{item.playerId === 'You' && <small className="you-badge">You</small>}</td>
                      <td>{item.score}</td>
                      <td>{formatPlayedDate(item.completedAt)}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={4} className="empty-row">No ranking entries yet.</td></tr>
                )}
              </tbody>
            </>
          ) : (
            <>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Points</th>
                  <th>Duration</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {items.length ? (
                  (items as MatchResult[]).map((item) => (
                    <tr key={item.id} className="record-current">
                      <td>{formatPlayedDate(item.completedAt)}</td>
                      <td>{item.score}</td>
                      <td>{formatDuration(item.duration)}</td>
                      <td className={item.reason === 'time' ? 'result-time' : 'result-defeat'}>
                        {item.reason === 'time' ? 'Time up' : 'Defeated'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={4} className="empty-row">No matches recorded yet.</td></tr>
                )}
              </tbody>
            </>
          )}
        </table>
      </div>

      <div className="pager">
        <button className="round-button" aria-label="Previous page" disabled={page === 1} onClick={() => setPage(page - 1)}>
          ‹
        </button>
        <span>Page {page} of {query.data.totalPages}</span>
        <button className="round-button" aria-label="Next page" disabled={page === query.data.totalPages} onClick={() => setPage(page + 1)}>
          ›
        </button>
      </div>
    </>
  );
}

function formatPlayedDate(value: string) {
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).toUpperCase();
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = (seconds % 60).toString().padStart(2, '0');

  return `${minutes}:${remainder}`;
}

function LogScreen({
  kind,
  options,
  onChangeTab,
  onMainMenu,
}: {
  kind: 'ranking' | 'history';
  options: GameOptions;
  onChangeTab: (screen: Screen) => void;
  onMainMenu: () => void;
}) {
  return (
    <main className="scene-screen log-screen">
      <section className="log-frame framed-panel" aria-label="Captain's log">
        <h1>Captain's Log</h1>
        <div className="log-tabs" role="tablist" aria-label="Captain's log pages">
          <WoodButton
            variant={kind === 'ranking' ? 'primary' : 'secondary'}
            role="tab"
            aria-selected={kind === 'ranking'}
            onClick={() => onChangeTab('ranking')}
          >
            Ranking
          </WoodButton>
          <WoodButton
            variant={kind === 'history' ? 'primary' : 'secondary'}
            role="tab"
            aria-selected={kind === 'history'}
            onClick={() => onChangeTab('history')}
          >
            Match History
          </WoodButton>
        </div>

        <p className="log-caption">
          {kind === 'ranking'
            ? `${options.sessionSeconds} second battles · ${options.spawnSeconds} second spawn interval`
            : "Captain You · Your recent battles"}
        </p>

        <Records kind={kind} />

        <WoodButton className="log-home" onClick={onMainMenu}>
          Main Menu
        </WoodButton>
      </section>
    </main>
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
  return (
    <main className="scene-screen options-screen">
      <section className="options-frame framed-panel" aria-label="Options">
        <OptionsForm
          options={options}
          onSave={onSave}
          onBack={onBack}
          backLabel="Main Menu"
        />
      </section>
    </main>
  );
}

function OptionsForm({
  options,
  onSave,
  onBack,
  backLabel,
}: {
  options: GameOptions;
  onSave: (value: GameOptions) => void;
  onBack: () => void;
  backLabel: string;
}) {
  const [draft, setDraft] = useState(options);
  const valid =
    draft.sessionSeconds >= 60 &&
    draft.sessionSeconds <= 180 &&
    draft.spawnSeconds >= 1 &&
    draft.spawnSeconds <= 30;

  return (
    <>
      <h1>Options</h1>
      <div className="option-setting">
        <label htmlFor="session-seconds">Game session time</label>
        <div className="stepper">
          <button
            className="round-button"
            aria-label="Decrease game session time"
            onClick={() => setDraft({ ...draft, sessionSeconds: Math.max(60, draft.sessionSeconds - 10) })}
          >
            −
          </button>
          <output htmlFor="session-seconds">{draft.sessionSeconds} s</output>
          <button
            className="round-button"
            aria-label="Increase game session time"
            onClick={() => setDraft({ ...draft, sessionSeconds: Math.min(180, draft.sessionSeconds + 10) })}
          >
            +
          </button>
        </div>
        <input
          id="session-seconds"
          className="sr-only"
          type="number"
          min="60"
          max="180"
          value={draft.sessionSeconds}
          onChange={(event) => setDraft({ ...draft, sessionSeconds: +event.target.value })}
        />
      </div>

      <div className="option-setting">
        <label htmlFor="spawn-seconds">Enemy spawn time</label>
        <div className="stepper">
          <button
            className="round-button"
            aria-label="Decrease enemy spawn time"
            onClick={() => setDraft({ ...draft, spawnSeconds: Math.max(1, draft.spawnSeconds - 1) })}
          >
            −
          </button>
          <output htmlFor="spawn-seconds">{draft.spawnSeconds} s</output>
          <button
            className="round-button"
            aria-label="Increase enemy spawn time"
            onClick={() => setDraft({ ...draft, spawnSeconds: Math.min(30, draft.spawnSeconds + 1) })}
          >
            +
          </button>
        </div>
        <input
          id="spawn-seconds"
          className="sr-only"
          type="number"
          min="1"
          max="30"
          value={draft.spawnSeconds}
          onChange={(event) => setDraft({ ...draft, spawnSeconds: +event.target.value })}
        />
      </div>

      <p className="option-note">Options are saved for your next voyage.</p>
      {!valid && <p role="alert">Please use values within the documented limits.</p>}
      <div className="form-actions">
        <WoodButton disabled={!valid} onClick={() => onSave(draft)}>
          Save Options
        </WoodButton>
        <WoodButton variant="secondary" onClick={onBack}>
          {backLabel}
        </WoodButton>
      </div>
    </>
  );
}

function PauseOverlay({
  options,
  settingsOpen,
  onResume,
  onOptions,
  onSaveOptions,
  onBackToPause,
  onMainMenu,
}: {
  options: GameOptions;
  settingsOpen: boolean;
  onResume: () => void;
  onOptions: () => void;
  onSaveOptions: (value: GameOptions) => void;
  onBackToPause: () => void;
  onMainMenu: () => void;
}) {
  return (
    <div className="overlay pause-overlay">
      <section className="pause-frame framed-panel">
        {settingsOpen ? (
          <OptionsForm
            options={options}
            onSave={onSaveOptions}
            onBack={onBackToPause}
            backLabel="Back"
          />
        ) : (
          <>
            <h2>Paused</h2>
            <p>Ready when you are.</p>
            <div className="pause-actions">
              <WoodButton onClick={onResume}>Resume</WoodButton>
              <WoodButton onClick={onOptions}>Options</WoodButton>
              <WoodButton onClick={onMainMenu}>Main Menu</WoodButton>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function TouchControls({ controls }: { controls: React.MutableRefObject<Controls> }) {
  // Reutiliza os ícones do pacote de assets para manter os controles touch no estilo do jogo.
  const icons: Record<keyof Controls, string> = {
    forward: 'icon_forward',
    left: 'icon_turn_left',
    right: 'icon_turn_right',
    front: 'icon_fire_front',
    port: 'icon_fire_left',
    starboard: 'icon_fire_right',
  };

  const bind = (control: keyof Controls) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      controls.current[control] = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerUp: () => {
      controls.current[control] = false;
    },
    onPointerCancel: () => {
      controls.current[control] = false;
    },
    onLostPointerCapture: () => {
      controls.current[control] = false;
    },
  });

  const renderControl = (control: keyof Controls) => (
    <button
      key={control}
      className="touch-button"
      {...bind(control)}
      aria-label={labels[control]}
      title={labels[control]}
    >
      <img
        className="touch-button-icon"
        src={`/png/default/ui/controls/${icons[control]}.png`}
        alt=""
        draggable={false}
      />
    </button>
  );

  return (
    <nav className="touch" aria-label="Touch game controls">
      <div className="touch-group touch-movement" aria-label="Movement">
        {(['left', 'forward', 'right'] as const).map(renderControl)}
      </div>
      <div className="touch-group touch-weapons" aria-label="Weapons">
        {(['port', 'front', 'starboard'] as const).map(renderControl)}
      </div>
    </nav>
  );
}

function Result({
  result,
  saving,
  error,
  play,
  menu,
}: {
  result: MatchResult;
  saving: boolean;
  error: boolean;
  play: () => void;
  menu: () => void;
}) {
  return (
    <main className="scene-screen result-screen">
      <section className="result-frame framed-panel">
        <h1>Battle complete</h1>
        <p className="score">{result.score} points</p>
        <p className="result-meta">
          {formatDuration(result.duration)} · {result.reason === 'time' ? 'Time up' : 'Defeated'}
        </p>
        <p role="status">
          {saving
            ? 'Saving match…'
            : error
              ? 'Match pending: the game remains available.'
              : 'Match recorded in history and ranking.'}
        </p>

        <div className="result-actions">
          <WoodButton onClick={play}>Play Again</WoodButton>
          <WoodButton onClick={menu}>Main Menu</WoodButton>
        </div>
      </section>
    </main>
  );
}
