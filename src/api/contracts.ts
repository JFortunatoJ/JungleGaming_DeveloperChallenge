import type { MatchResult } from '../game/types';
export type Page<T> = { items: T[]; page: number; totalPages: number };
export type RankingEntry = Pick<MatchResult, 'id' | 'playerId' | 'score' | 'completedAt' | 'configuration'>;
export type PendingRecord = MatchResult & { attempts: number };
