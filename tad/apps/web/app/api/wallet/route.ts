import { NextRequest, NextResponse } from 'next/server';
import { summarizePortfolio } from '@tad/core';
import { bearerToken } from '../../../lib/auth';
import { appendAudit, depositPaperWallet, getPaperWallet, listPositions } from '../../../lib/store';
export const dynamic='force-dynamic';
const PAPER_BRL_PER_USDT=5.1937;


export async function GET(req:NextRequest){
 const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
 const [wallet,positions]=await Promise.all([getPaperWallet(token),listPositions(token)]);
 const summary=summarizePortfolio(positions,wallet.depositedCapital);
 const marginUsed=positions.filter(p=>p.status==='OPEN').reduce((s,p)=>s+p.marginUsed,0);
 return NextResponse.json({mode:'PAPER',baseCurrency:'USDT',displayCurrency:'BRL',fx:{brlPerUsdt:PAPER_BRL_PER_USDT,source:'PAPER_TEST_REFERENCE'},wallet,summary,marginUsed,freeMargin:Math.max(0,summary.equity-marginUsed),limits:{maxRiskPerTradePct:.4,maxRiskPerTradeAmount:wallet.depositedCapital*.004,maxDailyLossPct:2,maxDailyLossAmount:wallet.depositedCapital*.02,maxLeverage:3,maxOpenPositions:3}});
}
export async function POST(req:NextRequest){
 const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
 const body=await req.json() as {amount?:number;amountBrl?:number}; const amountBrl=Number(body.amountBrl); const amount=Number.isFinite(amountBrl)&&amountBrl>0?amountBrl/PAPER_BRL_PER_USDT:Number(body.amount);
 if(!Number.isFinite(amount)||amount<=0||amount>1_000_000)return NextResponse.json({error:'INVALID_PAPER_DEPOSIT'},{status:400});
 const wallet=await depositPaperWallet(token,amount); await appendAudit(token,'PAPER_DEPOSIT',{amountUsdt:amount,amountBrl:Number.isFinite(amountBrl)?amountBrl:null,brlPerUsdt:PAPER_BRL_PER_USDT,depositedCapitalUsdt:wallet.depositedCapital});
 const positions=await listPositions(token); const summary=summarizePortfolio(positions,wallet.depositedCapital);
 return NextResponse.json({ok:true,mode:'PAPER',baseCurrency:'USDT',displayCurrency:'BRL',fx:{brlPerUsdt:PAPER_BRL_PER_USDT,source:'PAPER_TEST_REFERENCE'},deposit:{usdt:amount,brl:Number.isFinite(amountBrl)?amountBrl:amount*PAPER_BRL_PER_USDT},wallet,summary,limits:{maxRiskPerTradePct:.4,maxRiskPerTradeAmount:wallet.depositedCapital*.004,maxDailyLossPct:2,maxDailyLossAmount:wallet.depositedCapital*.02,maxLeverage:3,maxOpenPositions:3},realMoney:false});
}
