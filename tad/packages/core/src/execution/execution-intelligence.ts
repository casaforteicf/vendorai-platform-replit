import type { ShadowOrder } from './shadow-engine';

export type ExecutionRegime = 'TREND'|'RANGE'|'VOLATILE'|'UNKNOWN';
export interface ExecutionObservation {
  symbol:string; strategyId:string; hourUtc:number; regime:ExecutionRegime;
  spreadBps:number; slippageBps:number; latencyMs:number; fillProbabilityPct:number;
  executionDragBps:number; filled:boolean; ts:number;
}
export interface ExecutionProfile {
  symbol:string; strategyId:string; regime:ExecutionRegime; hourUtc:number;
  samples:number; fillRatePct:number; avgSpreadBps:number; avgSlippageBps:number;
  avgLatencyMs:number; avgExecutionDragBps:number; p95ExecutionDragBps:number;
  confidence:'LOW'|'MEDIUM'|'HIGH';
}
export interface EdgeGateInput { expectedEdgeBps:number; safetyBufferBps?:number; minSamples?:number; }
export interface EdgeGateResult { approved:boolean; expectedEdgeBps:number; modeledCostBps:number; requiredEdgeBps:number; edgeAfterCostBps:number; reason:string; }

export function observationFromShadow(order:ShadowOrder, regime:ExecutionRegime='UNKNOWN'):ExecutionObservation{
  const d=new Date(order.createdAt);
  return {symbol:order.symbol,strategyId:order.strategyId,hourUtc:d.getUTCHours(),regime,spreadBps:order.spreadCostBps*2,slippageBps:order.slippageBps,latencyMs:order.latencyMs,fillProbabilityPct:order.fillProbabilityPct,executionDragBps:order.executionDragBps,filled:order.filled,ts:order.createdAt};
}
const avg=(v:number[])=>v.length?v.reduce((a,b)=>a+b,0)/v.length:0;
const pct=(v:number[],p:number)=>{if(!v.length)return 0;const s=[...v].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.max(0,Math.ceil(p*s.length)-1))];};
export function buildExecutionProfile(rows:ExecutionObservation[], symbol:string, strategyId:string, regime:ExecutionRegime, hourUtc:number):ExecutionProfile{
  const exact=rows.filter(x=>x.symbol===symbol&&x.strategyId===strategyId&&x.regime===regime&&x.hourUtc===hourUtc);
  const fallback=exact.length>=8?exact:rows.filter(x=>x.symbol===symbol&&x.strategyId===strategyId);
  const use=fallback;
  const samples=use.length;
  return {symbol,strategyId,regime,hourUtc,samples,fillRatePct:samples?100*use.filter(x=>x.filled).length/samples:0,avgSpreadBps:avg(use.map(x=>x.spreadBps)),avgSlippageBps:avg(use.map(x=>x.slippageBps)),avgLatencyMs:avg(use.map(x=>x.latencyMs)),avgExecutionDragBps:avg(use.map(x=>x.executionDragBps)),p95ExecutionDragBps:pct(use.map(x=>x.executionDragBps),.95),confidence:samples>=40?'HIGH':samples>=15?'MEDIUM':'LOW'};
}
export function executionEdgeGate(profile:ExecutionProfile,input:EdgeGateInput):EdgeGateResult{
  const safety=input.safetyBufferBps??3;
  const minSamples=input.minSamples??15;
  const modeledCostBps=profile.samples>=minSamples?Math.max(profile.avgExecutionDragBps,profile.p95ExecutionDragBps*.65):Math.max(profile.avgExecutionDragBps,8);
  const requiredEdgeBps=modeledCostBps+safety;
  const edgeAfterCostBps=input.expectedEdgeBps-modeledCostBps;
  const approved=profile.samples>=minSamples&&input.expectedEdgeBps>=requiredEdgeBps&&profile.fillRatePct>=55;
  const reason=profile.samples<minSamples?'INSUFFICIENT_EXECUTION_SAMPLE':profile.fillRatePct<55?'LOW_FILL_RATE':input.expectedEdgeBps<requiredEdgeBps?'EDGE_BELOW_EXECUTION_COST':'EDGE_COVERS_EXECUTION_COST';
  return {approved,expectedEdgeBps:input.expectedEdgeBps,modeledCostBps,requiredEdgeBps,edgeAfterCostBps,reason};
}
export function executionHealthScore(profile:ExecutionProfile){
  let score=100; score-=Math.min(35,profile.avgExecutionDragBps*1.7); score-=Math.min(30,Math.max(0,70-profile.fillRatePct)); score-=Math.min(20,profile.avgLatencyMs/50); if(profile.confidence==='LOW')score-=15; return Math.max(0,Math.min(100,Math.round(score)));
}
