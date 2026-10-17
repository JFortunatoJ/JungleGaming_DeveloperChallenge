import type { GameOptions, MatchResult } from '../game/types';

export type Page<T> = {
  items: T[];
  page: number;
  totalPages: number;
};

export type RankingEntry = Pick<
  MatchResult,
  'id' | 'playerId' | 'score' | 'completedAt' | 'configuration'
>;

export type PendingRecord = MatchResult & { attempts: number };
export type RankingConfiguration = Pick<GameOptions, 'sessionSeconds' | 'spawnSeconds'>;

export type NetworkScenario =
  | 'normal'
  | 'empty'
  | 'slow'
  | 'variable-latency'
  | 'out-of-order'
  | 'timeout'
  | 'connection-error'
  | 'http-4xx'
  | 'http-5xx'
  | 'ranking-error'
  | 'history-error'
  | 'timeout-after-save';

export const networkScenarios: { value: NetworkScenario; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'empty', label: 'Empty lists' },
  { value: 'slow', label: 'Slow (900 ms)' },
  { value: 'variable-latency', label: 'Variable latency' },
  { value: 'out-of-order', label: 'Out-of-order responses' },
  { value: 'timeout', label: 'Timeout' },
  { value: 'connection-error', label: 'Connection error' },
  { value: 'http-4xx', label: 'HTTP 400' },
  { value: 'http-5xx', label: 'HTTP 503' },
  { value: 'ranking-error', label: 'Ranking unavailable' },
  { value: 'history-error', label: 'History unavailable' },
  { value: 'timeout-after-save', label: 'POST timeout after save' },
];

export const defaultNetworkScenario: NetworkScenario = 'normal';
