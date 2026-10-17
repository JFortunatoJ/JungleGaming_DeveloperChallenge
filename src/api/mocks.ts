import { delay, http, HttpResponse } from 'msw';

import type { MatchResult } from '../game/types';
import {
  defaultNetworkScenario,
  networkScenarios,
  type NetworkScenario,
  type Page,
  type RankingEntry,
} from './contracts';

const MATCHES_KEY = 'pirate-battle/matches';
const SCENARIO_KEY = 'pirate-battle/network-scenario';
const TIMED_POSTS_KEY = 'pirate-battle/timed-out-posts';
const PENDING_MATCHES_KEY = 'pirate-battle/pending-matches';
const PAGE_SIZE = 5;
const captains = [
  'Captain Ada',
  'Captain Lin',
  'Captain Morgan',
  'Captain Grace',
  'Captain Jules',
  'Captain Nia',
  'Captain Rowan',
  'Captain Sam',
  'Captain Talia',
  'Captain Ari',
  'Captain Noor',
  'Captain Kai',
];

// Fixed fixtures keep the ranking stable across local runs, screenshots and E2E tests.
const fixtures: MatchResult[] = captains.map((playerId, index) => ({
  id: `fixture-${String(index + 1).padStart(2, '0')}`,
  playerId,
  completedAt: new Date(Date.UTC(2026, 0, index + 1, 12)).toISOString(),
  score: Math.max(1, 24 - index * 2),
  duration: 90,
  reason: 'time',
  configuration: { sessionSeconds: 90, spawnSeconds: 3 },
}));

const savedMatches = (): MatchResult[] => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(MATCHES_KEY) ?? '[]');
    return Array.isArray(value) ? (value as MatchResult[]) : [];
  } catch {
    return [];
  }
};

const saveMatches = (matches: MatchResult[]) =>
  localStorage.setItem(MATCHES_KEY, JSON.stringify(matches));

const getScenario = (): NetworkScenario => {
  const value = localStorage.getItem(SCENARIO_KEY);
  return networkScenarios.some((scenario) => scenario.value === value)
    ? (value as NetworkScenario)
    : defaultNetworkScenario;
};

const requestPage = (request: Request) =>
  Math.max(1, Number(new URL(request.url).searchParams.get('page') ?? 1));

const paginate = <T,>(items: T[], request: Request): Page<T> => {
  const page = requestPage(request);
  const start = (page - 1) * PAGE_SIZE;
  return {
    items: items.slice(start, start + PAGE_SIZE),
    page,
    totalPages: Math.max(1, Math.ceil(items.length / PAGE_SIZE)),
  };
};

const simulateReadConditions = async (
  scenario: NetworkScenario,
  resource: 'ranking' | 'history',
  request: Request,
) => {
  if (scenario === 'empty') return null;
  if (scenario === 'slow') await delay(900);

  if (scenario === 'variable-latency') {
    const page = requestPage(request);
    await delay(120 + ((page * 137 + (resource === 'history' ? 211 : 71)) % 700));
  }

  if (scenario === 'out-of-order') {
    await delay(requestPage(request) === 1 ? 800 : 80);
  }

  if (scenario === 'timeout') {
    await delay(4000);
    return HttpResponse.json({ message: 'Simulated request timeout' }, { status: 504 });
  }

  if (scenario === 'connection-error') return HttpResponse.error();
  if (scenario === 'http-4xx') {
    return HttpResponse.json({ message: 'Simulated client error' }, { status: 400 });
  }
  if (scenario === 'http-5xx') {
    return HttpResponse.json({ message: 'Simulated service unavailable' }, { status: 503 });
  }
  if (scenario === `${resource}-error`) {
    return HttpResponse.json({ message: `${resource} is unavailable` }, { status: 503 });
  }

  return null;
};

const configurationFrom = (request: Request) => {
  const params = new URL(request.url).searchParams;
  return {
    sessionSeconds: Number(params.get('sessionSeconds')),
    spawnSeconds: Number(params.get('spawnSeconds')),
  };
};

const compareRanking = (a: MatchResult, b: MatchResult) =>
  b.score - a.score ||
  a.completedAt.localeCompare(b.completedAt) ||
  a.id.localeCompare(b.id);

const timedOutPostIds = (): string[] => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(TIMED_POSTS_KEY) ?? '[]');
    return Array.isArray(value) ? (value as string[]) : [];
  } catch {
    return [];
  }
};

export const handlers = [
  http.get('/api/ranking', async ({ request }) => {
    const scenario = getScenario();
    const failure = await simulateReadConditions(scenario, 'ranking', request);
    if (failure) return failure;
    if (scenario === 'empty') return HttpResponse.json(paginate([], request));

    const configuration = configurationFrom(request);
    const all = [...fixtures, ...savedMatches()]
      .filter(
        (match) =>
          match.configuration.sessionSeconds === configuration.sessionSeconds &&
          match.configuration.spawnSeconds === configuration.spawnSeconds,
      )
      .sort(compareRanking);
    const entries: RankingEntry[] = all.map(
      ({ id, playerId, score, completedAt, configuration: matchConfiguration }) => ({
        id,
        playerId,
        score,
        completedAt,
        configuration: matchConfiguration,
      }),
    );

    return HttpResponse.json(paginate(entries, request));
  }),

  http.get('/api/history', async ({ request }) => {
    const scenario = getScenario();
    const failure = await simulateReadConditions(scenario, 'history', request);
    if (failure) return failure;
    if (scenario === 'empty') return HttpResponse.json(paginate([], request));

    const history = savedMatches()
      .filter((match) => match.playerId === 'You')
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt) || a.id.localeCompare(b.id));

    return HttpResponse.json(paginate(history, request));
  }),

  http.post('/api/matches', async ({ request }) => {
    const scenario = getScenario();
    if (scenario === 'connection-error') return HttpResponse.error();
    if (scenario === 'http-4xx') {
      return HttpResponse.json({ message: 'Simulated client error' }, { status: 400 });
    }
    if (scenario === 'http-5xx' || scenario === 'ranking-error' || scenario === 'history-error') {
      return HttpResponse.json({ message: 'Simulated service unavailable' }, { status: 503 });
    }
    if (scenario === 'timeout') {
      await delay(4000);
      return HttpResponse.json({ message: 'Simulated request timeout' }, { status: 504 });
    }
    if (scenario === 'slow') await delay(900);

    const match = (await request.json()) as MatchResult;
    const matches = savedMatches();
    const existing = matches.find((item) => item.id === match.id);
    const stored = existing ?? match;

    if (!existing) {
      matches.push(match);
      saveMatches(matches);
    }

    if (scenario === 'timeout-after-save' && !timedOutPostIds().includes(match.id)) {
      localStorage.setItem(TIMED_POSTS_KEY, JSON.stringify([...timedOutPostIds(), match.id]));
      await delay(4000);
    }

    return HttpResponse.json(stored, { status: existing ? 200 : 201 });
  }),
];

export const resetMockData = () => {
  localStorage.removeItem(MATCHES_KEY);
  localStorage.removeItem(PENDING_MATCHES_KEY);
  localStorage.removeItem(TIMED_POSTS_KEY);
  localStorage.removeItem(SCENARIO_KEY);
};
