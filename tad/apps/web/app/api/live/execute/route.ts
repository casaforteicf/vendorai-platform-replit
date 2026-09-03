import { NextRequest, NextResponse } from 'next/server';
import { evaluateLiveExecutionGate, getOperatingProfile, type Side } from '@tad/core';
import { bearerToken } from '../../../../lib/auth';
import { appendAudit, listAudit } from '../../../../lib/store';
import { getOperatingSettings } from '../../../../lib/operating-settings';
import { getLiveControl, getUserRole } from '../../../../lib/live-control';
import { executeProtectedEntry, getPrivateAccountV3, privateReadiness } from '../../../../lib/binance-private';
import { loadMarkets, TRACKED_SYMBOLS } from '../../../../lib/binance';

const MAX_DECISION_AGE_MS=60_000;

function clientIds(decisionId:string,symbol:string){
  const base=`TAD-${decisionId.replace(/[^A-Za-z0-9_-]/g,'').slice(-16)}-${symbol}`.slice(0,28);
  return {entry:`${base}-E`.slice(0,36),stop:`${base}-S`.slice(0,36),emergency:`${base}-X`.slice(0,36)};
}

export async function POST(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  const role=await getUserRole(token); if(role!=='ADMIN')return NextResponse.json({error:'ADMIN_AUTHORIZATION_REQUIRED'},{status:403});
  const body=await req.json() as {decisionId?:string;quantity?:number};
  if(!body.decisionId)return NextResponse.json({error:'DECISION_ID_REQUIRED'},{status:400});
  if(!Number.isFinite(body.quantity)||Number(body.quantity)<=0)return NextResponse.json({error:'VALID_QUANTITY_REQUIRED'},{status:400});

  const [control,exchange,settings,audit,markets]=await Promise.all([
    getLiveControl(token),privateReadiness(),getOperatingSettings(token),listAudit(token,250),loadMarkets()
  ]);
  const event=audit.find((e:any)=>e.type==='DECISION'&&(e.payload as any)?.decision?.decisionId===body.decisionId);
  if(!event)return NextResponse.json({error:'APPROVED_DECISION_NOT_FOUND'},{status:404});
  if(Date.now()-event.ts>MAX_DECISION_AGE_MS)return NextResponse.json({error:'DECISION_EXPIRED'},{status:409});

  const p:any=event.payload;
  const decision=p.decision;
  const symbol=String(decision?.symbol||'');
  const freshMarket=markets.find(m=>m.symbol===symbol);
  if(!freshMarket)return NextResponse.json({error:'FRESH_MARKET_NOT_FOUND'},{status:409});
  const side:Side=decision.side;
  const stop=Number(decision.stop);
  const stopPlanValid=Number.isFinite(stop)&&stop>0&&((side==='LONG'&&stop<freshMarket.price)||(side==='SHORT'&&stop>freshMarket.price));
  const ids=clientIds(body.decisionId,symbol);

  const gate=evaluateLiveExecutionGate({
    liveFeatureEnabled:process.env.TAD_LIVE_TRADING_ENABLED==='true',
    liveEnvironmentArmed:control.armed,
    killSwitchActive:control.killSwitch,
    authenticated:true,
    adminAuthorized:true,
    exchangeCredentialsConfigured:exchange.configured,
    exchangePrivateConnectivity:exchange.signedConnectivity,
    market:freshMarket,
    allowedSymbols:TRACKED_SYMBOLS,
    maxMarketAgeMs:15_000,
    risk:p.risk,
    riskBudgetApproved:Boolean(p.riskBudget?.approved),
    robustnessApproved:Boolean(p.robustness?.assessment?.approved),
    dataHealthStatus:p.dataHealth?.status||'CRITICAL',
    supervisor:p.supervisor,
    stopProtected:stopPlanValid,
    idempotencyKey:ids.entry,
  });
  if(!gate.approved){await appendAudit(token,'LIVE_BLOCKED',{decisionId:body.decisionId,symbol,reasons:gate.reasons});return NextResponse.json({approved:false,gate,liveOrderSent:false},{status:423});}

  const profile=getOperatingProfile(settings.profile);
  const account:any=await getPrivateAccountV3();
  const availableBalance=Math.max(0,Number(account?.availableBalance??account?.totalWalletBalance??0));
  if(!Number.isFinite(availableBalance)||availableBalance<=0)return NextResponse.json({approved:false,error:'LIVE_AVAILABLE_BALANCE_UNAVAILABLE',liveOrderSent:false},{status:409});
  const riskPct=Math.min(Number(p.risk?.effectiveRiskPct??0),profile.riskPolicy.maxRiskPerTradePct);
  const stopDistance=Math.abs(freshMarket.price-stop);
  if(riskPct<=0||stopDistance<=0)return NextResponse.json({approved:false,error:'LIVE_RISK_SIZING_INVALID',liveOrderSent:false},{status:409});
  const maxByStop=(availableBalance*(riskPct/100))/stopDistance;
  const maxByLeverage=(availableBalance*profile.riskPolicy.maxLeverage)/freshMarket.price;
  const maxQuantity=Math.min(maxByStop,maxByLeverage);
  const quantity=Number(body.quantity);
  if(quantity>maxQuantity*(1+1e-9))return NextResponse.json({approved:false,error:'QUANTITY_EXCEEDS_LIVE_RISK_BUDGET',requestedQuantity:quantity,maxQuantity,liveOrderSent:false},{status:409});

  await appendAudit(token,'LIVE_EXECUTION_REQUESTED',{decisionId:body.decisionId,symbol,side,quantity,stop,riskPct,availableBalance,maxQuantity,gate});
  try{
    const result=await executeProtectedEntry({symbol,side:side==='LONG'?'BUY':'SELL',quantity,stopPrice:stop,entryClientOrderId:ids.entry,stopClientAlgoId:ids.stop,emergencyClientOrderId:ids.emergency});
    await appendAudit(token,'LIVE_EXECUTION_CONFIRMED',{decisionId:body.decisionId,symbol,ids,result});
    return NextResponse.json({approved:true,mode:'LIVE',gate,decisionId:body.decisionId,symbol,quantity,stop,exchangeProtected:true,result});
  }catch(error){
    await appendAudit(token,'LIVE_EXECUTION_FAILED',{decisionId:body.decisionId,symbol,ids,error:String(error).slice(0,240)});
    return NextResponse.json({approved:false,error:'LIVE_EXECUTION_FAILED',detail:String(error).slice(0,180),exchangeProtected:false},{status:502});
  }
}
