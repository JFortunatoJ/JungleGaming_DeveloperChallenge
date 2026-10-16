import { http, HttpResponse, delay } from 'msw';
import type { MatchResult } from '../game/types';
const KEY = 'pirate-battle/matches'; const scenarioKey = 'pirate-battle/network-scenario';
const fixture: MatchResult[] = [{ id:'fixture-1',playerId:'Captain Ada',completedAt:'2026-01-01T12:00:00Z',score:18,duration:90,reason:'time',configuration:{sessionSeconds:90,spawnSeconds:3} },{id:'fixture-2',playerId:'Captain Lin',completedAt:'2026-01-02T12:00:00Z',score:11,duration:90,reason:'time',configuration:{sessionSeconds:90,spawnSeconds:3}}];
const records=():MatchResult[]=>{try{return JSON.parse(localStorage.getItem(KEY)??'[]')}catch{return[]}}; const save=(r:MatchResult[])=>localStorage.setItem(KEY,JSON.stringify(r));
const settings=()=>localStorage.getItem(scenarioKey) ?? 'normal';
const mayFail=async()=>{const s=settings(); if(s==='slow')await delay(900); if(s==='error')return HttpResponse.json({message:'Simulated connection failure'},{status:503}); return null;};
const page=<T,>(items:T[], request:Request)=>{const n=Math.max(1,Number(new URL(request.url).searchParams.get('page')??1));const sorted=items.slice(0).slice((n-1)*5,n*5);return HttpResponse.json({items:sorted,page:n,totalPages:Math.max(1,Math.ceil(items.length/5))});};
export const handlers=[
 http.get('/api/ranking',async({request})=>{const failure=await mayFail();if(failure)return failure;const all=[...fixture,...records()].sort((a,b)=>b.score-a.score||a.completedAt.localeCompare(b.completedAt));return page(all.map(({reason,duration,...entry})=>entry),request);}),
 http.get('/api/history',async({request})=>{const failure=await mayFail();if(failure)return failure;return page(records().sort((a,b)=>b.completedAt.localeCompare(a.completedAt)),request);}),
 http.post('/api/matches',async({request})=>{const failure=await mayFail();if(failure)return failure;const match=await request.json() as MatchResult;const all=records();const current=all.find(x=>x.id===match.id);if(!current){all.push(match);save(all);}return HttpResponse.json(current??match,{status:201});})
];
export const resetMockData=()=>localStorage.removeItem(KEY);
