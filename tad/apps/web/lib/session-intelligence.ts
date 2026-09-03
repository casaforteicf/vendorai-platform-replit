import type { PaperPosition } from '@tad/core';

export type TradingSession='ASIA'|'EUROPE'|'US'|'EUROPE_US_OVERLAP'|'OFF_HOURS';
export type SessionEdge={session:TradingSession;sampleSize:number;wins:number;winRatePct:number;avgPnl:number;profitFactor:number|null;adjustment:number;confidence:'NONE'|'LOW'|'MEDIUM'|'HIGH';source:string};
export type SessionCandidate={strategyId:string;symbol:string;side?:'LONG'|'SHORT'};

function clamp(v:number,min:number,max:number){return Math.max(min,Math.min(max,v));}
export function tradingSession(ts=Date.now()):TradingSession{
  const h=new Date(ts).getUTCHours();
  if(h>=13&&h<16)return 'EUROPE_US_OVERLAP';
  if(h>=7&&h<13)return 'EUROPE';
  if(h>=16&&h<21)return 'US';
  if(h>=0&&h<7)return 'ASIA';
  return 'OFF_HOURS';
}

export function sessionEdge(positions:PaperPosition[],signal:SessionCandidate,now=Date.now()):SessionEdge{
  const session=tradingSession(now);
  const base=positions.filter(p=>p.status==='CLOSED'&&p.strategyId===signal.strategyId&&tradingSession(p.openedAt)===session);
  const exact=signal.side?base.filter(p=>p.symbol===signal.symbol&&p.side===signal.side):base.filter(p=>p.symbol===signal.symbol);
  const rows=exact.length>=8?exact:base;
  if(rows.length<5)return {session,sampleSize:rows.length,wins:rows.filter(p=>p.realizedPnl>0).length,winRatePct:rows.length?rows.filter(p=>p.realizedPnl>0).length/rows.length*100:0,avgPnl:0,profitFactor:null,adjustment:0,confidence:'NONE',source:'INSUFFICIENT_SESSION_SAMPLE'};
  const wins=rows.filter(p=>p.realizedPnl>0),losses=rows.filter(p=>p.realizedPnl<=0);
  const pos=wins.reduce((a,p)=>a+p.realizedPnl,0),neg=Math.abs(losses.reduce((a,p)=>a+p.realizedPnl,0));
  const winRate=wins.length/rows.length*100,avgPnl=rows.reduce((a,p)=>a+p.realizedPnl,0)/rows.length,pf=neg?pos/neg:null;
  const winEdge=clamp((winRate-50)/25,-1,1);
  const pfEdge=pf==null?(avgPnl>0?.4:avgPnl<0?-.4:0):clamp((pf-1)/.75,-1,1);
  const raw=winEdge+pfEdge;
  const confidence:SessionEdge['confidence']=rows.length>=30?'HIGH':rows.length>=12?'MEDIUM':'LOW';
  const mult=confidence==='HIGH'?1:confidence==='MEDIUM'?.7:.4;
  const exactSource=signal.side?'STRATEGY_SYMBOL_SIDE_SESSION':'STRATEGY_SYMBOL_SESSION';
  return {session,sampleSize:rows.length,wins:wins.length,winRatePct:winRate,avgPnl,profitFactor:pf,adjustment:clamp(raw*mult,-2,2),confidence,source:exact.length>=8?exactSource:'STRATEGY_SESSION'};
}

export function sessionReport(positions:PaperPosition[]){
  const sessions:TradingSession[]=['ASIA','EUROPE','EUROPE_US_OVERLAP','US','OFF_HOURS'];
  return sessions.map(session=>{
    const rows=positions.filter(p=>p.status==='CLOSED'&&tradingSession(p.openedAt)===session);
    const wins=rows.filter(p=>p.realizedPnl>0),losses=rows.filter(p=>p.realizedPnl<=0);
    const pos=wins.reduce((a,p)=>a+p.realizedPnl,0),neg=Math.abs(losses.reduce((a,p)=>a+p.realizedPnl,0));
    const pnl=rows.reduce((a,p)=>a+p.realizedPnl,0);
    return {session,trades:rows.length,wins:wins.length,winRatePct:rows.length?wins.length/rows.length*100:0,pnl,avgPnl:rows.length?pnl/rows.length:0,profitFactor:neg?pos/neg:null};
  });
}
