import axios from 'axios';

import type { MatchResult } from '../game/types';
import type { Page, RankingConfiguration, RankingEntry } from './contracts';

export const http = axios.create({ baseURL: '/api', timeout: 3500 });

export const getRanking = (
  page: number,
  configuration: RankingConfiguration,
  signal?: AbortSignal,
) =>
  http
    .get<Page<RankingEntry>>('/ranking', {
      params: { page, ...configuration },
      signal,
    })
    .then((response) => response.data);

export const getHistory = (page: number, signal?: AbortSignal) =>
  http
    .get<Page<MatchResult>>('/history', { params: { page }, signal })
    .then((response) => response.data);

export const recordMatch = (match: MatchResult) =>
  http.post<MatchResult>('/matches', match, { headers: { 'Idempotency-Key': match.id } })
    .then((response) => response.data);
