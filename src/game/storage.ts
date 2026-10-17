import { defaultConfig, type GameOptions, type MatchResult } from './types';

const OPTIONS_KEY = 'pirate-battle/options';
const LAST_RESULT_KEY = 'pirate-battle/last-result';
const PENDING_MATCHES_KEY = 'pirate-battle/pending-matches';

const isValidMatch = (value: unknown): value is MatchResult => {
  if (!value || typeof value !== 'object') return false;

  const match = value as Partial<MatchResult>;
  return (
    typeof match.id === 'string' &&
    typeof match.playerId === 'string' &&
    typeof match.completedAt === 'string' &&
    typeof match.score === 'number' &&
    typeof match.duration === 'number' &&
    (match.reason === 'time' || match.reason === 'destroyed') &&
    typeof match.configuration?.sessionSeconds === 'number' &&
    typeof match.configuration?.spawnSeconds === 'number'
  );
};

const readMatches = (key: string): MatchResult[] => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value.filter(isValidMatch) : [];
  } catch {
    return [];
  }
};

export const loadOptions = (): GameOptions => {
  try {
    const saved = JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? '{}') as Partial<GameOptions>;
    const sessionSeconds = Number(saved.sessionSeconds);
    const spawnSeconds = Number(saved.spawnSeconds);

    return {
      sessionSeconds:
        Number.isInteger(sessionSeconds) && sessionSeconds >= 60 && sessionSeconds <= 180
          ? sessionSeconds
          : defaultConfig.sessionSeconds,
      spawnSeconds:
        Number.isInteger(spawnSeconds) && spawnSeconds >= 1 && spawnSeconds <= 30
          ? spawnSeconds
          : defaultConfig.spawnSeconds,
    };
  } catch {
    return {
      sessionSeconds: defaultConfig.sessionSeconds,
      spawnSeconds: defaultConfig.spawnSeconds,
    };
  }
};

export const saveOptions = (options: GameOptions) =>
  localStorage.setItem(OPTIONS_KEY, JSON.stringify(options));

export const saveLastResult = (result: MatchResult) =>
  localStorage.setItem(LAST_RESULT_KEY, JSON.stringify(result));

export const loadLastResult = (): MatchResult | null => {
  try {
    const result: unknown = JSON.parse(localStorage.getItem(LAST_RESULT_KEY) ?? 'null');
    return isValidMatch(result) ? result : null;
  } catch {
    return null;
  }
};

export const loadPendingMatches = () => readMatches(PENDING_MATCHES_KEY);

export const savePendingMatch = (match: MatchResult) => {
  const pending = loadPendingMatches();
  if (!pending.some((item) => item.id === match.id)) pending.push(match);
  localStorage.setItem(PENDING_MATCHES_KEY, JSON.stringify(pending));
};

export const removePendingMatch = (id: string) => {
  const pending = loadPendingMatches().filter((item) => item.id !== id);
  localStorage.setItem(PENDING_MATCHES_KEY, JSON.stringify(pending));
};

export const clearPendingMatches = () => localStorage.removeItem(PENDING_MATCHES_KEY);
