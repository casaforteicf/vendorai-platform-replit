import type { MarketRegime, PaperPosition, Side } from '../types/index';

export type RegimeKey=MarketRegime|'UNKNOWN';
export interface DecisionRegimeContext { decisionId:string; regime:RegimeKey; ts?:number }
export interface StrategyRegimePerformanceRow {
  strategyId:string; symbol:string; side:Side; regime:RegimeKey;
  trades:number; wins:number; losses:number; winRatePct:number;
  realizedPnl:number; avgPnl:number; profitFactor:number|null;
  score:number; sampleState:'INSUFFICIENT'|'EARLY'|'USABLE'|'STRONG_SAMPLE';
}

function sampleState(n:number):StrategyRegimePerformanceRow['sampleState']{
  if(n<5)return 'INSUFFICIENT'; if(n<12)return 'EARLY'; if(n<30)return 'USABLE'; return 'STRONG_SAMPLE';
}
function scoreRow(ps:PaperPosition[]){
  const wins=ps.filter(p=>p.realizedPnl>0),losses=ps.filter(p=>p.realizedPnl<=0);
  const pos=wins.reduce((a,p)=>a+p.realizedPnl,0),neg=Math.abs(losses.reduce((a,p)=>a+p.realizedPnl,0));
  const realizedPnl=ps.reduce((a,p)=>a+p.realizedPnl,0),winRatePct=ps.length?wins.length/ps.length*100:0;
  const pf=neg?pos/neg:(pos>0?3:null),pfScore=pf==null?50:Math.max(0,Math.min(100,50+(pf-1)*35));
  const sample=Math.min(1,ps.length/30),pnlScore=realizedPnl>0?65:realizedPnl<0?35:50;
  const score=Math.round(Math.max(0,Math.min(100,winRatePct*.45+pfScore*.30+pnlScore*.15+sample*10)));
  return {wins:wins.length,losses:losses.length,winRatePct,realizedPnl,avgPnl:ps.length?realizedPnl/ps.length:0,profitFactor:pf,score};
}

export function buildStrategyRegimePerformance(positions:PaperPosition[],contexts:DecisionRegimeContext[]){
  const regimeByDecision=new Map(contexts.map(c=>[c.decisionId,c.regime]));
  const closed=positions.filter(p=>p.status==='CLOSED'&&p.strategyId);
  const groups=new Map<string,PaperPosition[]>();
  let matched=0,unknown=0;
  for(const p of closed){
    const regime=regimeByDecision.get(p.decisionId)??'UNKNOWN';
    if(regime==='UNKNOWN')unknown++; else matched++;
    const key=`${p.strategyId}|${p.symbol}|${p.side}|${regime}`;
    const arr=groups.get(key)??[];arr.push(p);groups.set(key,arr);
  }
  const rows:StrategyRegimePerformanceRow[]=[...groups.entries()].map(([key,ps])=>{
    const [strategyId,symbol,side,regime]=key.split('|') as [string,string,Side,RegimeKey];
    const s=scoreRow(ps); return {strategyId,symbol,side,regime,trades:ps.length,...s,sampleState:sampleState(ps.length)};
  }).sort((a,b)=>b.score-a.score||b.trades-a.trades);
  return {rows,totalClosedTrades:closed.length,matchedRegimeTrades:matched,unknownRegimeTrades:unknown,coveragePct:closed.length?matched/closed.length*100:0};
}

export function regimePerformanceAdjustment(matrix:ReturnType<typeof buildStrategyRegimePerformance>,strategyId:string,symbol:string,side:Side,regime:RegimeKey){
  if(regime==='UNKNOWN')return {adjustment:0,source:'UNKNOWN_REGIME',row:null as StrategyRegimePerformanceRow|null};
  const r=matrix.rows.find(x=>x.strategyId===strategyId&&x.symbol===symbol&&x.side===side&&x.regime===regime);
  if(!r||r.trades<5)return {adjustment:0,source:'INSUFFICIENT_REGIME_SAMPLE',row:r??null};
  const cap=r.sampleState==='STRONG_SAMPLE'?6:r.sampleState==='USABLE'?4:2;
  const adjustment=Math.max(-cap,Math.min(cap,Math.round((r.score-50)/8)));
  return {adjustment,source:'STRATEGY_PAIR_SIDE_REGIME',row:r};
}
