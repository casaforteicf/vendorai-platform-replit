import { NextRequest, NextResponse } from 'next/server';
import { getOperatingProfile, summarizePortfolio } from '@tad/core';
import { bearerToken } from '../../../lib/auth';
import { appendAudit, depositPaperWallet, getPaperWallet, listPositions } from '../../../lib/store';
import { getOperatingSettings } from '../../../lib/operating-settings';
export const dynamic='force-dynamic';
const PAPER_BRL_PER_USDT=5.1937;

function limits(profile:any,capital:number){
 const p=profile.riskPolicy;
 return {profile:profile.id,dailyTargetReferencePct:profile.dailyTargetReferencePct,maxTradesPerDay:null,opportunityDriven:true,maxRiskPerTradePct:p.maxRiskPerTradePct,maxRiskPerTradeAmount:capital*(p.maxRiskPerTradePct/100),maxDailyLossPct:p.maxDailyLossPct,maxDailyLossAmount:capital*(p.maxDailyLossPct/100),maxLeverage:p.maxLeverage,maxOpenPositions:p.maxOpenPositions,maxPortfolioRiskPct:profile.maxPortfolioRiskPct,maxGrossExposureMultiple:profile.maxGrossExposureMultiple};
}

export async function GET(req:NextRequest){
 const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
 const [wallet,positions,settings]=await Promise.all([getPaperWallet(token),listPositions(token),getOperatingSettings(token)]);
 const profile=getOperatingProfile(settings.profile);
 const summary=summarizePortfolio(positions,wallet.depositedCapital);
 const marginUsed=positions.filter(p=>p.status==='OPEN').reduce((s,p)=>s+p.marginUsed,0);
 return NextResponse.json({mode:'PAPER',liveTrading:false,baseCurrency:'USDT',displayCurrency:'BRL',fx:{brlPerUsdt:PAPER_BRL_PER_USDT,source:'PAPER_TEST_REFERENCE'},wallet,summary,operatingSettings:settings,marginUsed,freeMargin:Math.max(0,summary.equity-marginUsed),limits:limits(profile,wallet.depositedCapital)});
}
export async function POST(req:NextRequest){
 const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
 const body=await req.json() as {amount?:number;amountBrl?:number}; const amountBrl=Number(body.amountBrl); const amount=Number.isFinite(amountBrl)&&amountBrl>0?amountBrl/PAPER_BRL_PER_USDT:Number(body.amount);
 if(!Number.isFinite(amount)||amount<=0||amount>1_000_000)return NextResponse.json({error:'INVALID_PAPER_DEPOSIT'},{status:400});
 const [wallet,settings]=await Promise.all([depositPaperWallet(token,amount),getOperatingSettings(token)]); const profile=getOperatingProfile(settings.profile); await appendAudit(token,'PAPER_DEPOSIT',{amountUsdt:amount,amountBrl:Number.isFinite(amountBrl)?amountBrl:null,brlPerUsdt:PAPER_BRL_PER_USDT,depositedCapitalUsdt:wallet.depositedCapital,profile:profile.id});
 const positions=await listPositions(token); const summary=summarizePortfolio(positions,wallet.depositedCapital);
 return NextResponse.json({ok:true,mode:'PAPER',liveTrading:false,baseCurrency:'USDT',displayCurrency:'BRL',fx:{brlPerUsdt:PAPER_BRL_PER_USDT,source:'PAPER_TEST_REFERENCE'},deposit:{usdt:amount,brl:Number.isFinite(amountBrl)?amountBrl:amount*PAPER_BRL_PER_USDT},wallet,summary,operatingSettings:settings,limits:limits(profile,wallet.depositedCapital),realMoney:false});
}
