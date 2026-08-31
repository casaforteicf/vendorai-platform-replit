import type { PaperPosition } from '../types/index';
import { pearson, returns } from '../risk/correlation';

export interface ExposureCluster {
  id:string;
  members:string[];
  symbols:string[];
  strategies:string[];
  direction:'LONG'|'SHORT'|'MIXED';
  riskPct:number;
  avgAbsCorrelation:number;
  concentrationPct:number;
}

export interface HiddenExposurePair {
  a:string;
  b:string;
  correlation:number;
  sameDirection:boolean;
  sharedFactor:boolean;
  severity:'LOW'|'MEDIUM'|'HIGH';
}

export interface PortfolioIntelligenceSnapshot {
  diversificationScore:number;
  hiddenExposureScore:number;
  effectiveIndependentBets:number;
  clusters:ExposureCluster[];
  hiddenPairs:HiddenExposurePair[];
  factorRisk:Record<string,number>;
  riskMultiplier:number;
  approved:boolean;
  reasons:string[];
}

function assetFactor(symbol:string):string {
  if (symbol==='BTCUSDT') return 'BTC_CORE';
  if (symbol==='ETHUSDT') return 'ETH_CORE';
  if (['SOLUSDT','BNBUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','SUIUSDT'].includes(symbol)) return 'ALT_BETA';
  return 'OTHER';
}

function strategyFactor(strategyId:string):string {
  if (strategyId.includes('MOMENTUM') || strategyId.includes('BREAKOUT') || strategyId.includes('TREND')) return 'DIRECTIONAL';
  if (strategyId.includes('REVERSION')) return 'MEAN_REVERSION';
  return 'OTHER';
}

export function evaluatePortfolioIntelligence(params:{positions:PaperPosition[];priceSeries:Record<string,number[]>;correlationThreshold?:number;maxClusterRiskPct?:number}):PortfolioIntelligenceSnapshot {
  const open=params.positions.filter(p=>p.status==='OPEN');
  if(!open.length) return {diversificationScore:100,hiddenExposureScore:0,effectiveIndependentBets:0,clusters:[],hiddenPairs:[],factorRisk:{},riskMultiplier:1,approved:true,reasons:[]};
  const threshold=params.correlationThreshold??0.72;
  const maxClusterRisk=params.maxClusterRiskPct??0.8;
  const totalRisk=Math.max(0.0001,open.reduce((s,p)=>s+p.riskPct,0));
  const factorRisk:Record<string,number>={};
  for(const p of open){
    const key=`${assetFactor(p.symbol)}:${strategyFactor(p.strategyId)}:${p.side}`;
    factorRisk[key]=(factorRisk[key]??0)+p.riskPct;
  }
  const hiddenPairs:HiddenExposurePair[]=[];
  const adjacency=new Map<number,Set<number>>();
  for(let i=0;i<open.length;i++)adjacency.set(i,new Set());
  for(let i=0;i<open.length;i++)for(let j=i+1;j<open.length;j++){
    const a=open[i],b=open[j];
    const corr=a.symbol===b.symbol?1:pearson(returns(params.priceSeries[a.symbol]??[]),returns(params.priceSeries[b.symbol]??[]));
    const sameDirection=a.side===b.side;
    const sharedFactor=assetFactor(a.symbol)===assetFactor(b.symbol)||strategyFactor(a.strategyId)===strategyFactor(b.strategyId);
    const effective=Math.abs(corr)*(sameDirection?1:0.6)+(sharedFactor?0.12:0);
    if(effective>=threshold){adjacency.get(i)!.add(j);adjacency.get(j)!.add(i);}
    if(effective>=0.55)hiddenPairs.push({a:`${a.symbol}/${a.strategyId}`,b:`${b.symbol}/${b.strategyId}`,correlation:corr,sameDirection,sharedFactor,severity:effective>=0.85?'HIGH':effective>=0.7?'MEDIUM':'LOW'});
  }
  const visited=new Set<number>(); const clusters:ExposureCluster[]=[];
  for(let i=0;i<open.length;i++){
    if(visited.has(i))continue; const stack=[i],members:number[]=[];visited.add(i);
    while(stack.length){const n=stack.pop()!;members.push(n);for(const x of adjacency.get(n)??[]){if(!visited.has(x)){visited.add(x);stack.push(x)}}}
    const ps=members.map(x=>open[x]); const riskPct=ps.reduce((s,p)=>s+p.riskPct,0);
    const cs:number[]=[];for(let a=0;a<ps.length;a++)for(let b=a+1;b<ps.length;b++){const c=ps[a].symbol===ps[b].symbol?1:pearson(returns(params.priceSeries[ps[a].symbol]??[]),returns(params.priceSeries[ps[b].symbol]??[]));cs.push(Math.abs(c));}
    clusters.push({id:`CL-${clusters.length+1}`,members:ps.map(p=>`${p.symbol}/${p.strategyId}`),symbols:[...new Set(ps.map(p=>p.symbol))],strategies:[...new Set(ps.map(p=>p.strategyId))],direction:ps.every(p=>p.side==='LONG')?'LONG':ps.every(p=>p.side==='SHORT')?'SHORT':'MIXED',riskPct,avgAbsCorrelation:cs.length?cs.reduce((s,v)=>s+v,0)/cs.length:0,concentrationPct:riskPct/totalRisk*100});
  }
  const largest=Math.max(...clusters.map(c=>c.concentrationPct),0);
  const highPairs=hiddenPairs.filter(p=>p.severity==='HIGH').length;
  const concentrationPenalty=Math.max(0,(largest-40)*0.8);
  const pairPenalty=Math.min(35,highPairs*10+hiddenPairs.filter(p=>p.severity==='MEDIUM').length*4);
  const diversificationScore=Math.max(0,Math.round(100-concentrationPenalty-pairPenalty));
  const hiddenExposureScore=100-diversificationScore;
  const effectiveIndependentBets=Math.max(1,Number((open.length*(diversificationScore/100)).toFixed(2)));
  let riskMultiplier=1; const reasons:string[]=[];
  if(clusters.some(c=>c.riskPct>maxClusterRisk)){riskMultiplier=Math.min(riskMultiplier,.5);reasons.push('CLUSTER_RISK_LIMIT');}
  if(largest>=75){riskMultiplier=Math.min(riskMultiplier,.4);reasons.push('HIDDEN_CONCENTRATION_HIGH');}
  else if(largest>=60){riskMultiplier=Math.min(riskMultiplier,.65);reasons.push('HIDDEN_CONCENTRATION_ELEVATED');}
  if(highPairs>=2){riskMultiplier=Math.min(riskMultiplier,.5);reasons.push('MULTIPLE_HIGH_CORRELATION_LINKS');}
  if(diversificationScore<35){riskMultiplier=0;reasons.push('DIVERSIFICATION_CRITICAL');}
  else if(diversificationScore<55){riskMultiplier=Math.min(riskMultiplier,.5);reasons.push('DIVERSIFICATION_LOW');}
  return {diversificationScore,hiddenExposureScore,effectiveIndependentBets,clusters,hiddenPairs,factorRisk,riskMultiplier,approved:riskMultiplier>0,reasons};
}
