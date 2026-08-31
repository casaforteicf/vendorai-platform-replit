export interface MonteCarloSummary { simulations:number; medianReturnPct:number; p05ReturnPct:number; p95ReturnPct:number; medianMaxDrawdownPct:number; p95MaxDrawdownPct:number; probabilityOfLossPct:number; ruinProbabilityPct:number; }
function q(a:number[],p:number){if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.max(0,Math.floor((s.length-1)*p)))];}
function rng(seed:number){let s=seed>>>0;return()=>((s=(1664525*s+1013904223)>>>0)/4294967296);}
export function monteCarloTradeReturns(returnsPct:number[], simulations=1000, seed=42):MonteCarloSummary{
 if(!returnsPct.length)return {simulations:0,medianReturnPct:0,p05ReturnPct:0,p95ReturnPct:0,medianMaxDrawdownPct:0,p95MaxDrawdownPct:0,probabilityOfLossPct:0,ruinProbabilityPct:0};
 const r=rng(seed),rets:number[]=[],dds:number[]=[];let loss=0,ruin=0;
 for(let s=0;s<simulations;s++){let eq=100,peak=100,maxdd=0;for(let i=0;i<returnsPct.length;i++){const t=returnsPct[Math.floor(r()*returnsPct.length)];eq*=1+t/100;peak=Math.max(peak,eq);maxdd=Math.max(maxdd,(peak-eq)/peak*100);}const ret=eq-100;rets.push(ret);dds.push(maxdd);if(ret<0)loss++;if(eq<=70)ruin++;}
 return {simulations,medianReturnPct:q(rets,.5),p05ReturnPct:q(rets,.05),p95ReturnPct:q(rets,.95),medianMaxDrawdownPct:q(dds,.5),p95MaxDrawdownPct:q(dds,.95),probabilityOfLossPct:loss/simulations*100,ruinProbabilityPct:ruin/simulations*100};
}
