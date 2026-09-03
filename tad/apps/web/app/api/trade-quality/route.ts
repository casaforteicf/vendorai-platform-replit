import { NextRequest, NextResponse } from 'next/server';
import type { Candle, PaperPosition } from '@tad/core';
import { bearerToken } from '../../../lib/auth';
import { listPositions } from '../../../lib/store';
import { loadPagedCandles } from '../../../lib/strategy-sweep-data';

const FIVE_MIN=5*60_000;
const MAX_DAYS=30;
const MAX_BARS=MAX_DAYS*24*12;
function pct(a:number,b:number){return b?((a-b)/b)*100:0}
function classify(p:PaperPosition,mfePct:number,maePct:number,exitEfficiencyPct:number){
  if(p.realizedPnl>0&&exitEfficiencyPct>=75)return 'EXCELENTE';
  if(p.realizedPnl>0&&exitEfficiencyPct>=50)return 'BOM';
  if(p.realizedPnl>0&&exitEfficiencyPct<35)return 'SAIDA_PRECOCE';
  if(p.closeReason==='BREAK_EVEN')return 'BREAK_EVEN_CORRETO';
  if(p.realizedPnl<0&&mfePct>Math.abs(maePct)*1.25)return 'DEVOLVEU_LUCRO';
  if(p.realizedPnl<0)return 'LOSS_CONTROLADO';
  return 'NEUTRO';
}
function analyze(p:PaperPosition,candles:Candle[],now:number){
  const end=p.closedAt??now,durationMs=Math.max(0,end-p.openedAt);
  const path=candles.filter(c=>c.closeTime>=p.openedAt&&c.openTime<=end);
  const favorable=path.map(c=>p.side==='LONG'?c.high:c.low),adverse=path.map(c=>p.side==='LONG'?c.low:c.high);
  const best=favorable.length?(p.side==='LONG'?Math.max(...favorable):Math.min(...favorable)):p.markPrice;
  const worst=adverse.length?(p.side==='LONG'?Math.min(...adverse):Math.max(...adverse)):p.markPrice;
  const mfePct=p.side==='LONG'?pct(best,p.entry):pct(p.entry,best);
  const maePct=p.side==='LONG'?pct(worst,p.entry):pct(p.entry,worst);
  const exitPrice=p.markPrice;
  const realizedMovePct=p.side==='LONG'?pct(exitPrice,p.entry):pct(p.entry,exitPrice);
  const exitEfficiencyPct=mfePct>0?Math.max(0,Math.min(100,(realizedMovePct/mfePct)*100)):0;
  const expectedBars=Math.max(1,Math.ceil(durationMs/FIVE_MIN));
  const coveragePct=Math.min(100,(path.length/expectedBars)*100);
  const ageDays=(now-p.openedAt)/86_400_000;
  return {id:p.id,symbol:p.symbol,strategyId:p.strategyId,side:p.side,openedAt:p.openedAt,closedAt:p.closedAt??null,durationMinutes:Math.round(durationMs/60000),entry:p.entry,exitPrice,realizedPnl:p.realizedPnl,closeReason:p.closeReason??null,mfePct,maePct,exitEfficiencyPct,coveragePct,pathBars:path.length,expectedBars,coverageState:ageDays>MAX_DAYS?'OUTSIDE_30D_WINDOW':coveragePct>=85?'FULL':coveragePct>=50?'PARTIAL':'LOW',classification:classify(p,mfePct,maePct,exitEfficiencyPct)};
}
export async function GET(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  const now=Date.now();
  const positions=(await listPositions(token)).filter(p=>p.status==='CLOSED').slice(0,60);
  const recent=positions.filter(p=>now-p.openedAt<=MAX_DAYS*86_400_000);
  const symbols=[...new Set(recent.map(p=>p.symbol))];
  const series=new Map<string,Candle[]>();
  await Promise.all(symbols.map(async symbol=>{const own=recent.filter(p=>p.symbol===symbol);const oldest=Math.min(...own.map(p=>p.openedAt));const bars=Math.min(MAX_BARS,Math.max(288,Math.ceil((now-oldest)/FIVE_MIN)+24));try{series.set(symbol,await loadPagedCandles(symbol,'5m',bars))}catch{series.set(symbol,[])}}));
  const trades=positions.map(p=>analyze(p,series.get(p.symbol)??[],now));
  const avg=(key:'mfePct'|'maePct'|'exitEfficiencyPct'|'durationMinutes'|'coveragePct')=>trades.length?trades.reduce((s,t)=>s+Number(t[key]||0),0)/trades.length:0;
  const classifications=trades.reduce<Record<string,number>>((acc,t)=>{acc[t.classification]=(acc[t.classification]??0)+1;return acc},{});
  const coverage=trades.reduce<Record<string,number>>((acc,t)=>{acc[t.coverageState]=(acc[t.coverageState]??0)+1;return acc},{});
  return NextResponse.json({mode:'PAPER_TRADE_QUALITY',windowDays:MAX_DAYS,analyzedSymbols:symbols.length,trades,summary:{trades:trades.length,avgMfePct:avg('mfePct'),avgMaePct:avg('maePct'),avgExitEfficiencyPct:avg('exitEfficiencyPct'),avgDurationMinutes:avg('durationMinutes'),avgCoveragePct:avg('coveragePct'),classifications,coverage},observational:true,binding:false,liveExecution:false});
}
