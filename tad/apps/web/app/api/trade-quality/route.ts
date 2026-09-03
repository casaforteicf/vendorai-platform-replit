import { NextRequest, NextResponse } from 'next/server';
import type { PaperPosition } from '@tad/core';
import { bearerToken } from '../../../lib/auth';
import { listPositions } from '../../../lib/store';
import { loadCandles } from '../../../lib/binance';

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

async function analyze(p:PaperPosition){
  const end=p.closedAt??Date.now();
  const durationMs=Math.max(0,end-p.openedAt);
  const candles=await loadCandles(p.symbol,'5m',1500).catch(()=>[]);
  const path=candles.filter(c=>c.closeTime>=p.openedAt&&c.openTime<=end);
  const favorablePrices=path.map(c=>p.side==='LONG'?c.high:c.low);
  const adversePrices=path.map(c=>p.side==='LONG'?c.low:c.high);
  const best=favorablePrices.length?(p.side==='LONG'?Math.max(...favorablePrices):Math.min(...favorablePrices)):p.markPrice;
  const worst=adversePrices.length?(p.side==='LONG'?Math.min(...adversePrices):Math.max(...adversePrices)):p.markPrice;
  const mfePct=p.side==='LONG'?pct(best,p.entry):pct(p.entry,best);
  const maePct=p.side==='LONG'?pct(worst,p.entry):pct(p.entry,worst);
  const exitPrice=p.markPrice;
  const realizedMovePct=p.side==='LONG'?pct(exitPrice,p.entry):pct(p.entry,exitPrice);
  const exitEfficiencyPct=mfePct>0?Math.max(0,Math.min(100,(realizedMovePct/mfePct)*100)):0;
  const expectedBars=Math.max(1,Math.ceil(durationMs/(5*60_000)));
  const coveragePct=Math.min(100,(path.length/expectedBars)*100);
  return {
    id:p.id,symbol:p.symbol,strategyId:p.strategyId,side:p.side,status:p.status,
    openedAt:p.openedAt,closedAt:p.closedAt??null,durationMinutes:Math.round(durationMs/60000),
    entry:p.entry,exitPrice,realizedPnl:p.realizedPnl,closeReason:p.closeReason??null,
    mfePct,maePct,exitEfficiencyPct,coveragePct,
    classification:classify(p,mfePct,maePct,exitEfficiencyPct),
  };
}

export async function GET(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  const positions=(await listPositions(token)).filter(p=>p.status==='CLOSED').slice(0,40);
  const trades=await Promise.all(positions.map(analyze));
  const avg=(key:'mfePct'|'maePct'|'exitEfficiencyPct'|'durationMinutes')=>trades.length?trades.reduce((s,t)=>s+Number(t[key]||0),0)/trades.length:0;
  const classes=trades.reduce<Record<string,number>>((acc,t)=>{acc[t.classification]=(acc[t.classification]??0)+1;return acc},{});
  return NextResponse.json({mode:'PAPER_TRADE_QUALITY',trades,summary:{trades:trades.length,avgMfePct:avg('mfePct'),avgMaePct:avg('maePct'),avgExitEfficiencyPct:avg('exitEfficiencyPct'),avgDurationMinutes:avg('durationMinutes'),classifications:classes},liveExecution:false});
}
