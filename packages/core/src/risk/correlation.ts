import type { PaperPosition } from '../types/index';

export interface CorrelationPair { a:string; b:string; correlation:number; }
export interface CorrelationRisk { maxPairCorrelation:number; highlyCorrelatedPairs:CorrelationPair[]; concentrationPenalty:number; }

export function pearson(a:number[], b:number[]):number {
  const n=Math.min(a.length,b.length); if(n<3)return 0;
  const x=a.slice(-n),y=b.slice(-n),mx=x.reduce((s,v)=>s+v,0)/n,my=y.reduce((s,v)=>s+v,0)/n;
  let num=0,dx=0,dy=0; for(let i=0;i<n;i++){const ax=x[i]-mx,by=y[i]-my;num+=ax*by;dx+=ax*ax;dy+=by*by;}
  return dx&&dy?num/Math.sqrt(dx*dy):0;
}
export function returns(prices:number[]):number[]{const out:number[]=[];for(let i=1;i<prices.length;i++)if(prices[i-1])out.push(prices[i]/prices[i-1]-1);return out;}
export function portfolioCorrelationRisk(positions:PaperPosition[], series:Record<string,number[]>, threshold=.75):CorrelationRisk{
  const open=positions.filter(p=>p.status==='OPEN'); const pairs:CorrelationPair[]=[];
  for(let i=0;i<open.length;i++)for(let j=i+1;j<open.length;j++){
    const a=open[i].symbol,b=open[j].symbol; const c=pearson(returns(series[a]??[]),returns(series[b]??[])); pairs.push({a,b,correlation:c});
  }
  const high=pairs.filter(p=>Math.abs(p.correlation)>=threshold); const max=pairs.reduce((m,p)=>Math.max(m,Math.abs(p.correlation)),0);
  return {maxPairCorrelation:max,highlyCorrelatedPairs:high,concentrationPenalty:Math.min(.5,high.length*.12)};
}
