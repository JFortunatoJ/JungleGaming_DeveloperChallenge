type SoundName =
  | 'cannon_broadside'
  | 'cannon_fire_1'
  | 'cannon_fire_2'
  | 'cannon_fire_3'
  | 'cannonball_water_hit_1'
  | 'cannonball_water_hit_2'
  | 'game_complete'
  | 'game_over'
  | 'game_pause'
  | 'game_resume'
  | 'game_start'
  | 'health_low'
  | 'score_point'
  | 'ship_collision'
  | 'ship_explosion_1'
  | 'ship_explosion_2'
  | 'ship_sinking'
  | 'ship_wood_hit_1'
  | 'ship_wood_hit_2'
  | 'time_warning'
  | 'ui_back'
  | 'ui_click'
  | 'ui_close'
  | 'ui_hover'
  | 'ui_open';

type LoopName = 'ocean_ambience_loop' | 'ship_sailing_loop';

const soundVolumes: Record<SoundName, number> = {
  cannon_broadside: 0.48,
  cannon_fire_1: 0.42,
  cannon_fire_2: 0.42,
  cannon_fire_3: 0.42,
  cannonball_water_hit_1: 0.28,
  cannonball_water_hit_2: 0.28,
  game_complete: 0.58,
  game_over: 0.58,
  game_pause: 0.42,
  game_resume: 0.42,
  game_start: 0.5,
  health_low: 0.4,
  score_point: 0.35,
  ship_collision: 0.5,
  ship_explosion_1: 0.58,
  ship_explosion_2: 0.58,
  ship_sinking: 0.5,
  ship_wood_hit_1: 0.32,
  ship_wood_hit_2: 0.32,
  time_warning: 0.48,
  ui_back: 0.3,
  ui_click: 0.28,
  ui_close: 0.3,
  ui_hover: 0.16,
  ui_open: 0.3,
};

const loopVolumes: Record<LoopName, number> = {
  ocean_ambience_loop: 0.16,
  ship_sailing_loop: 0.1,
};

const loops = new Map<LoopName, HTMLAudioElement>();
const desiredLoops = new Set<LoopName>();
const activeSounds = new Set<HTMLAudioElement>();
let gameAudioPaused = false;

/** Play one short effect. A fresh audio element lets cannon and impact sounds overlap naturally. */
export function playSound(name: SoundName) {
  const audio = new Audio(`/sounds/${name}.wav`);
  audio.volume = soundVolumes[name];
  activeSounds.add(audio);
  audio.addEventListener('ended', () => activeSounds.delete(audio), { once: true });

  void audio.play().catch(() => activeSounds.delete(audio));
}

/** Start or stop a looping ambience/effect without creating duplicate loop players. */
export function setLoopingSound(name: LoopName, enabled: boolean) {
  if (enabled) desiredLoops.add(name);
  else desiredLoops.delete(name);

  let audio = loops.get(name);
  if (enabled && !audio) {
    audio = new Audio(`/sounds/${name}.wav`);
    audio.loop = true;
    audio.volume = loopVolumes[name];
    loops.set(name, audio);
  }

  if (!audio) return;

  if (enabled && !gameAudioPaused && audio.paused) {
    void audio.play().catch(() => undefined);
  } else if (!enabled) {
    audio.pause();
    audio.currentTime = 0;
  }
}

export function startGameAudio() {
  stopGameAudio();
  gameAudioPaused = false;
  playSound('game_start');
  setLoopingSound('ocean_ambience_loop', true);
}

export function setGameAudioPaused(paused: boolean) {
  if (gameAudioPaused === paused) return;
  gameAudioPaused = paused;

  for (const [name, audio] of loops) {
    if (paused) audio.pause();
    else if (desiredLoops.has(name)) void audio.play().catch(() => undefined);
  }

  playSound(paused ? 'game_pause' : 'game_resume');
}

export function stopGameAudio() {
  desiredLoops.clear();
  gameAudioPaused = false;

  for (const audio of loops.values()) {
    audio.pause();
    audio.currentTime = 0;
  }

  // One-shot effects normally leave this set on `ended`. Stop and release any
  // overlapping sounds at match teardown so a quick restart cannot retain them.
  for (const audio of activeSounds) {
    audio.pause();
    audio.currentTime = 0;
  }
  activeSounds.clear();
}
