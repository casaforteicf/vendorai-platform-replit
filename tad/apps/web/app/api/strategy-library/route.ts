import { NextRequest, NextResponse } from 'next/server';
import { STRATEGY_LIBRARY, classifyPair, libraryForPair, type StrategyLibraryStatus } from '@tad/core';

const VALID_STATUS:StrategyLibraryStatus[]=['ACTIVE_PAPER','RESEARCH','CANDIDATE','OBSERVATION','QUARANTINED','RETIRED'];

export async function GET(req:NextRequest){
 const symbol=(req.nextUrl.searchParams.get('symbol')||'BTCUSDT').toUpperCase();
 const statusParam=(req.nextUrl.searchParams.get('status')||'').split(',').map(x=>x.trim()).filter(Boolean) as StrategyLibraryStatus[];
 const statuses=statusParam.length?statusParam.filter(x=>VALID_STATUS.includes(x)):['ACTIVE_PAPER','CANDIDATE','OBSERVATION','RESEARCH'];
 const rows=libraryForPair(symbol,statuses);
 const byFamily=rows.reduce<Record<string,number>>((acc,row)=>{acc[row.family]=(acc[row.family]||0)+1;return acc;},{});
 return NextResponse.json({symbol,pairClasses:classifyPair(symbol),statuses,totalLibrary:STRATEGY_LIBRARY.length,eligibleForPair:rows.length,byFamily,strategies:rows});
}
