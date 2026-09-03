import type { StrategyLibraryEntry, StrategyLibraryStatus } from './strategy-library';

export type SweepDirection='BULLISH'|'BEARISH'|'NEUTRAL';
export interface HorizonState{
  horizon:string;
  returnPct:number;
  volatilityPct:number;
  direction:SweepDirection;
  regime:string;
  coverage:boolean;
  samples:number;
}
export interface StrategySweepRow{
  strategyId:string;
  name:string;
  family:string;
  status:StrategyLibraryStatus;
  actionable:boolean;
  eligibilityScore:number;
  contextScore:number;
  timingCoverageScore:number;
  regimeScore:number;
  matchedHorizons:number;
  requestedHorizons:number;
  missingHorizons:string[];
  reasons:string[];
  execution:string;
  confirmations:string[];
  micro:string[];
}

const ACTIONABLE_STATUS:StrategyLibraryStatus[]=['ACTIVE_PAPER','CANDIDATE','OBSERVATION'];

function regimeMatches(preferred:string[],actual:string){
  if(!preferred.length)return true;
  if(preferred.includes(actual))return true;
  if(actual==='STRONG_UP'&&preferred.includes('UP'))return true;
  if(actual==='STRONG_DOWN'&&preferred.includes('DOWN'))return true;
  return false;
}

export function sweepStrategy(entry:StrategyLibraryEntry,horizons:Record<string,HorizonState|undefined>,availableFrames:string[]):StrategySweepRow{
  const requested=entry.contextHorizons;
  const states=requested.map(h=>horizons[h]).filter((x):x is HorizonState=>Boolean(x?.coverage));
  const missing=requested.filter(h=>!horizons[h]?.coverage);
  const matches=states.filter(s=>regimeMatches(entry.preferredRegimes,s.regime));
  const contextScore=states.length?Math.round(matches.length/states.length*100):0;
  const latest=states.at(-1);
  const regimeScore=latest?Math.round((regimeMatches(entry.preferredRegimes,latest.regime)?100:35)):50;
  const requiredFrames=[entry.execution,...entry.confirmations];
  const availableRequired=requiredFrames.filter(x=>availableFrames.includes(x));
  const timingCoverageScore=requiredFrames.length?Math.round(availableRequired.length/requiredFrames.length*100):100;
  const statusBonus=entry.status==='ACTIVE_PAPER'?15:entry.status==='CANDIDATE'?10:entry.status==='OBSERVATION'?6:0;
  const coveragePenalty=requested.length?missing.length/requested.length*15:0;
  const eligibilityScore=Math.max(0,Math.min(100,Math.round(contextScore*.55+regimeScore*.20+timingCoverageScore*.10+statusBonus-coveragePenalty)));
  const reasons=[
    `CONTEXT_MATCH:${matches.length}/${Math.max(1,states.length)}`,
    `TIMING_COVERAGE:${availableRequired.length}/${Math.max(1,requiredFrames.length)}`,
    `STATUS:${entry.status}`,
    ...(missing.length?[`MISSING_HORIZONS:${missing.join(',')}`]:[]),
    ...(entry.micro.length?[`MICRO_REQUIRED:${entry.micro.join(',')}`]:[]),
  ];
  return {strategyId:entry.id,name:entry.name,family:entry.family,status:entry.status,actionable:ACTIONABLE_STATUS.includes(entry.status),eligibilityScore,contextScore,timingCoverageScore,regimeScore,matchedHorizons:matches.length,requestedHorizons:requested.length,missingHorizons:missing,reasons,execution:entry.execution,confirmations:entry.confirmations,micro:entry.micro};
}

export function rankStrategySweep(entries:StrategyLibraryEntry[],horizons:Record<string,HorizonState|undefined>,availableFrames:string[]){
  return entries.map(e=>sweepStrategy(e,horizons,availableFrames)).sort((a,b)=>b.eligibilityScore-a.eligibilityScore);
}
