import { NextRequest, NextResponse } from 'next/server';
export const dynamic='force-dynamic';
const PAPER_BRL_PER_USDT=5.1937;
export async function GET(req:NextRequest){
 const amountBrl=Number(req.nextUrl.searchParams.get('amountBrl')??req.nextUrl.searchParams.get('amount')??1000);
 if(!Number.isFinite(amountBrl)||amountBrl<100||amountBrl>1_000_000)return NextResponse.json({error:'INVALID_AMOUNT_BRL'},{status:400});
 const capitalUsdt=amountBrl/PAPER_BRL_PER_USDT;
 const riskUsdt=capitalUsdt*.004, dailyUsdt=capitalUsdt*.02;
 return NextResponse.json({mode:'PAPER_SIMULATION',realMoney:false,baseCurrency:'USDT',displayCurrency:'BRL',fx:{brlPerUsdt:PAPER_BRL_PER_USDT,source:'PAPER_TEST_REFERENCE'},deposit:{brl:amountBrl,usdt:capitalUsdt},limits:{maxRiskPerTradePct:.4,maxRiskPerTradeUsdt:riskUsdt,maxRiskPerTradeBrl:riskUsdt*PAPER_BRL_PER_USDT,maxDailyLossPct:2,maxDailyLossUsdt:dailyUsdt,maxDailyLossBrl:dailyUsdt*PAPER_BRL_PER_USDT,maxLeverage:3,maxOpenPositions:3},explanation:'Risk Budget, Robustness, Regime, Portfolio Intelligence and Supervisor may reduce risk below the gross limits or block a trade entirely.'});
}
