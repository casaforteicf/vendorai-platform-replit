import { NextRequest, NextResponse } from 'next/server';
import { libraryForPair, rankStrategySweep, type StrategyLibraryStatus } from '@tad/core';
import { loadSweepHorizons } from '../../../lib/strategy-sweep-data';

const DEFAULT_STATUS:StrategyLibraryStatus[]=['ACTIVE_PAPER','CANDIDATE','OBSERVATION','RESEARCH'];

export async function GET(req:NextRequest){
 const symbol=(req.nextUrl.searchParams.get('symbol')||'BTCUSDT').toUpperCase();
 const includeResearch=req.nextUrl.searchParams.get('research')!=='false';
 const statuses:StrategyLibraryStatus[]=includeResearch?DEFAULT_STATUS:['ACTIVE_PAPER','CANDIDATE','OBSERVATION'];
 try{
  const entries=libraryForPair(symbol,statuses);
  const data=await loadSweepHorizons(symbol);
  const ranking=rankStrategySweep(entries,data.horizons,data.availableFrames);
  const actionable=ranking.filter(r=>r.actionable);
  const research=ranking.filter(r=>!r.actionable);
  const horizonRows=Object.values(data.horizons).map(h=>({horizon:h.horizon,returnPct:h.returnPct,volatilityPct:h.volatilityPct,direction:h.direction,regime:h.regime,coverage:h.coverage,samples:h.samples}));
  return NextResponse.json({
   mode:'PAPER_STRATEGY_SWEEP',
   symbol,
   liveExecution:false,
   strategyCount:entries.length,
   source:data.source,
   horizons:horizonRows,
   topActionable:actionable.slice(0,10),
   topResearch:research.slice(0,10),
   ranking,
   note:'Eligibility is a compatibility/context score. RESEARCH strategies never become actionable from this endpoint.',
  });
 }catch(error:any){
  return NextResponse.json({error:'STRATEGY_SWEEP_FAILED',message:String(error?.message||error),symbol,liveExecution:false},{status:503});
 }
}
