import axios from 'axios';
import type { MatchResult } from '../game/types';
import type { Page, RankingEntry } from './contracts';
export const http = axios.create({ baseURL: '/api', timeout: 3500 });
export const getRanking = (page: number) => http.get<Page<RankingEntry>>('/ranking', { params: { page } }).then(r => r.data);
export const getHistory = (page: number) => http.get<Page<MatchResult>>('/history', { params: { page } }).then(r => r.data);
export const recordMatch = (match: MatchResult) => http.post<MatchResult>('/matches', match).then(r => r.data);
