import { NextRequest, NextResponse } from 'next/server';
import { portfolioCorrelationRisk, summarizePortfolio } from '@tad/core';
import { bearerToken } from '../../../lib/auth';
import { getPaperWallet, listAudit, listPositions } from '../../../lib/store';
import { loadCandles } from '../../../lib/binance';

function pct(part:number,total:number){return total>0?(part/total)*100:0}

export async function GET(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  try{
    const [positions,wallet,audit]=await Promise.all([listPositions(token),getPaperWallet(token),listAudit(token,500)]);
    const summary=summarizePortfolio(positions,wallet.depositedCapital);
    const open=positions.filter(p=>p.status==='OPEN');
    const closed=positions.filter(p=>p.status==='CLOSED');
    const openRiskAmount=open.reduce((s,p)=>s+Number(p.riskAmount||0),0);
    const openRiskPct=pct(openRiskAmount,Math.max(1,summary.equity));
    const grossExposure=open.reduce((s,p)=>s+Number(p.quantity||0)*Number(p.markPrice||p.entry||0),0);
    const marginUsed=open.reduce((s,p)=>s+Number(p.marginUsed||0),0);
    const exposureMultiple=summary.equity>0?grossExposure/summary.equity:0;
    const realizedCurve=closed.slice().sort((a,b)=>Number(a.closedAt||0)-Number(b.closedAt||0)).reduce((acc:any[],p:any)=>{const prev=acc.at(-1)?.equity??wallet.depositedCapital;acc.push({ts:p.closedAt,equity:prev+Number(p.realizedPnl||0)});return acc},[]);
    let peak=wallet.depositedCapital,maxDrawdownPct=0; for(const r of realizedCurve){peak=Math.max(peak,r.equity); if(peak>0)maxDrawdownPct=Math.max(maxDrawdownPct,((peak-r.equity)/peak)*100)}
    const bySymbol=Object.values(open.reduce((m:any,p:any)=>{const k=p.symbol;m[k]??={symbol:k,positions:0,exposure:0,riskAmount:0,unrealizedPnl:0};m[k].positions++;m[k].exposure+=Number(p.quantity||0)*Number(p.markPrice||p.entry||0);m[k].riskAmount+=Number(p.riskAmount||0);m[k].unrealizedPnl+=Number(p.unrealizedPnl||0);return m},{})).sort((a:any,b:any)=>b.exposure-a.exposure);
    const byStrategy=Object.values(open.reduce((m:any,p:any)=>{const k=p.strategyId||'UNKNOWN';m[k]??={strategyId:k,positions:0,exposure:0,riskAmount:0,unrealizedPnl:0};m[k].positions++;m[k].exposure+=Number(p.quantity||0)*Number(p.markPrice||p.entry||0);m[k].riskAmount+=Number(p.riskAmount||0);m[k].unrealizedPnl+=Number(p.unrealizedPnl||0);return m},{})).sort((a:any,b:any)=>b.riskAmount-a.riskAmount);
    const symbols=[...new Set(open.map(p=>p.symbol))];
    let correlation:any={maxPairCorrelation:0,pairs:[]};
    if(symbols.length>=2){const series=Object.fromEntries(await Promise.all(symbols.map(async symbol=>{const c=await loadCandles(symbol,'5m',120);return [symbol,c.map(x=>x.close)] as const})));correlation=portfolioCorrelationRisk(open,series,.75)}
    const lastDecision=audit.find((e:any)=>e.type==='DECISION') as any;
    const recentBlocks=audit.filter((e:any)=>e.type.includes('BLOCK')||e.type==='NO_SIGNAL').slice(0,25).map((e:any)=>({id:e.id,type:e.type,ts:e.ts,reason:e.payload?.reason??e.payload?.risk?.reasons??null,symbol:e.payload?.symbol??e.payload?.market?.symbol??null,strategyId:e.payload?.decision?.strategyId??null}));
    const conditions=[
      {id:'EQUITY_NON_POSITIVE',severity:'KILL',active:summary.equity<=0,detail:`Equity ${summary.equity.toFixed(2)}`},
      {id:'OPEN_RISK_WARNING',severity:'WARN',active:openRiskPct>=3,detail:`Risco aberto ${openRiskPct.toFixed(2)}%`},
      {id:'OPEN_RISK_KILL',severity:'KILL',active:openRiskPct>=5,detail:`Risco aberto ${openRiskPct.toFixed(2)}%`},
      {id:'EXPOSURE_WARNING',severity:'WARN',active:exposureMultiple>=2,detail:`Exposição ${exposureMultiple.toFixed(2)}x`},
      {id:'EXPOSURE_KILL',severity:'KILL',active:exposureMultiple>=3,detail:`Exposição ${exposureMultiple.toFixed(2)}x`},
      {id:'DRAWDOWN_WARNING',severity:'WARN',active:maxDrawdownPct>=7,detail:`Drawdown ${maxDrawdownPct.toFixed(2)}%`},
      {id:'DRAWDOWN_KILL',severity:'KILL',active:maxDrawdownPct>=10,detail:`Drawdown ${maxDrawdownPct.toFixed(2)}%`},
      {id:'CORRELATION_WARNING',severity:'WARN',active:Number(correlation.maxPairCorrelation||0)>=.75,detail:`Correlação máx. ${(Number(correlation.maxPairCorrelation||0)*100).toFixed(1)}%`},
      {id:'CORRELATION_KILL',severity:'KILL',active:Number(correlation.maxPairCorrelation||0)>=.9,detail:`Correlação máx. ${(Number(correlation.maxPairCorrelation||0)*100).toFixed(1)}%`},
      {id:'SUPERVISOR_BLOCK',severity:'KILL',active:lastDecision?.payload?.supervisor?.riskMultiplier===0,detail:lastDecision?.payload?.supervisor?.state??'Sem decisão recente'},
      {id:'DATA_HEALTH_BLOCK',severity:'KILL',active:Boolean(lastDecision?.payload?.dataHealth?.status&&lastDecision.payload.dataHealth.status!=='HEALTHY'),detail:lastDecision?.payload?.dataHealth?.status??'N/D'},
    ];
    const state=conditions.some(x=>x.active&&x.severity==='KILL')?'BLOCKED':conditions.some(x=>x.active&&x.severity==='WARN')?'REDUCED':'OPERATE';
    return NextResponse.json({mode:'PAPER_SHADOW_RISK_COMMAND',state,summary:{...summary,openRiskAmount,openRiskPct,grossExposure,marginUsed,exposureMultiple,maxDrawdownPct},bySymbol,byStrategy,correlation,latestDecision:lastDecision?{ts:lastDecision.ts,supervisor:lastDecision.payload?.supervisor??null,riskBudget:lastDecision.payload?.riskBudget??null,dataHealth:lastDecision.payload?.dataHealth??null,portfolioRisk:lastDecision.payload?.portfolioRisk??null,regimeGate:lastDecision.payload?.regimeGate??null,decision:lastDecision.payload?.decision??null}:null,conditions,recentBlocks,ts:Date.now(),liveExecution:false});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'RISK_COMMAND_ERROR'},{status:500})}
}
