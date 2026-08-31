export interface AutoScannerConfig { enabled:boolean; minimumScore:number; cooldownMinutes:number; maxNewTradesPerCycle:number; }
export interface AutoScannerCandidate { symbol:string; strategyId:string; score:number; eligible:boolean; allocationWeight:number; }
export function selectAutoScannerCandidates(rows:AutoScannerCandidate[],config:AutoScannerConfig,lastTradeAt:Record<string,number>,now=Date.now()){
 if(!config.enabled)return [];
 return rows.filter(r=>r.eligible&&r.score>=config.minimumScore).filter(r=>now-(lastTradeAt[`${r.symbol}:${r.strategyId}`]??0)>=config.cooldownMinutes*60_000).sort((a,b)=>b.score-a.score).slice(0,config.maxNewTradesPerCycle);
}
