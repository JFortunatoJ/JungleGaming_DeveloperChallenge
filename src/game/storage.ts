import { defaultConfig, type GameOptions, type MatchResult } from './types';
const OPTIONS = 'pirate-battle/options'; const LAST = 'pirate-battle/last-result';
export const loadOptions = (): GameOptions => { try { return { ...defaultConfig, ...JSON.parse(localStorage.getItem(OPTIONS) ?? '{}') }; } catch { return defaultConfig; } };
export const saveOptions = (options: GameOptions) => localStorage.setItem(OPTIONS, JSON.stringify(options));
export const saveLastResult = (result: MatchResult) => localStorage.setItem(LAST, JSON.stringify(result));
export const loadLastResult = (): MatchResult | null => { try { return JSON.parse(localStorage.getItem(LAST) ?? 'null'); } catch { return null; } };
