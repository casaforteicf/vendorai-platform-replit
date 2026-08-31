'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBinanceLive } from '../hooks/useBinanceLive';
import { supabase } from '../lib/supabase';

type Market={symbol:string;price:number;change24hPct:number;quoteVolume24h:number;spreadPct:number;fundingRate:number;regime:string;opportunityScore:number;ts:number};
type MarketResponse={mode:string;source:string;markets:Market[];ts:number};
type Position={id:string;orderId:string;decisionId?:string;strategyId?:string;symbol:string;side:'LONG'|'SHORT';quantity:number;leverage:number;entry:number;markPrice:number;stop:number;targets:number[];accountSize?:number;riskPct:number;riskAmount:number;notional:number;marginUsed:number;unrealizedPnl:number;realizedPnl:number;status:'OPEN'|'CLOSED';closeReason?:string;openedAt:number;closedAt?:number};
type Portfolio={positions:Position[];summary:{startingBalance:number;realizedPnl:number;unrealizedPnl:number;equity:number;openPositions:number;closedPositions:number;winRatePct:number;grossExposure:number};storage:string};
type AuditEvent={id:string;type:string;payload:any;ts:number};

const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:2});
const qty=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:6});
const PAPER_BRL_PER_USDT=5.1937; // cotação de referência do teste de R$ 1.000,00
const usdt=(v:number)=>`${v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})} USDT`;
const brl=(v:number)=>money.format(v*PAPER_BRL_PER_USDT);
const dual=(v:number)=>`${usdt(v)} ≈ ${brl(v)}`;
const price=(v:number)=>`${v.toLocaleString('pt-BR',{maximumFractionDigits:v>=1000?2:6})} USDT`;


type Candle={openTime:number;open:number;high:number;low:number;close:number;volume:number;closeTime:number};


function OperationNumbers({position,riskBudget}:{position:Position;riskBudget?:any}){
 const capital=position.accountSize??0,risk=position.riskAmount,notional=position.notional??position.quantity*position.entry,margin=position.marginUsed;
 const marginPct=capital>0?margin/capital*100:0,stopPct=position.entry>0?Math.abs(position.entry-position.stop)/position.entry*100:0;
 const gains=(position.targets??[]).map(t=>Math.abs(t-position.entry)*position.quantity);
 const rr=gains.length&&risk>0?gains[gains.length-1]/risk:0;
 const pnl=position.status==='OPEN'?position.unrealizedPnl:position.realizedPnl;
 return <div className="operationNumbers">
  <div className="operationHeadline"><b>Conta {dual(capital)}</b><span>Risco desta entrada {dual(risk)}</span><span>R:R 1:{rr.toFixed(2)}</span></div>
  <div className="operationGrid">
   <div><small>Capital</small><b>{dual(capital)}</b></div><div><small>Risco final</small><b>{position.riskPct.toFixed(3)}% • {dual(risk)}</b></div>
   <div><small>Exposição / nocional</small><b>{dual(notional)}</b></div><div><small>Margem utilizada</small><b>{dual(margin)} • {marginPct.toFixed(1)}% da conta</b></div>
   <div><small>Entrada</small><b>{price(position.entry)}</b></div><div><small>Stop</small><b>{price(position.stop)} • {stopPct.toFixed(3)}%</b></div>
   <div><small>Quantidade</small><b>{qty.format(position.quantity)} {position.symbol.replace('USDT','')}</b></div><div><small>Alavancagem</small><b>{position.leverage}x</b></div>
   {(position.targets??[]).map((t,i)=><div key={i}><small>TP{i+1}</small><b>{price(t)} • ganho potencial {dual(gains[i])}</b></div>)}
   <div><small>PnL atual</small><b className={pnl>=0?'green':'red'}>{dual(pnl)}</b></div><div><small>Saldo se stop</small><b className="red">{dual(Math.max(0,capital-risk))}</b></div>
   {gains.map((g,i)=><div key={`bal-${i}`}><small>Saldo se TP{i+1}</small><b className="green">{dual(capital+g)}</b></div>)}
  </div>
  {riskBudget?.layers?.length?<div className="riskLayers"><small>Multiplicadores aplicados</small>{riskBudget.layers.filter((l:any)=>l.binding).map((l:any)=><span key={l.name}>{l.name}: {(l.multiplier*100).toFixed(0)}%</span>)}</div>:null}
 </div>;
}

function RealCandleChart({candles,symbol}:{candles:Candle[]|undefined;symbol:string}){
 const rows=(candles??[]).slice(-72);
 if(rows.length<2)return <div className="realChart emptyChart"><div><b>Sem candles suficientes</b><small>O gráfico aparece assim que a Binance retornar histórico 5m suficiente.</small></div></div>;
 const W=920,H=320,padL=58,padR=18,padT=18,padB=30;
 const lo=Math.min(...rows.map(c=>c.low)),hi=Math.max(...rows.map(c=>c.high));
 const span=Math.max(hi-lo,Number.EPSILON),plotW=W-padL-padR,plotH=H-padT-padB;
 const x=(i:number)=>padL+(i+.5)*(plotW/rows.length),y=(v:number)=>padT+(hi-v)/span*plotH;
 const cw=Math.max(2,Math.min(8,plotW/rows.length*.58));
 const ticks=Array.from({length:5},(_,i)=>hi-(span*i/4));
 return <div className="realChart"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Candles reais de 5 minutos de ${symbol}`}>
  {ticks.map((v,i)=><g key={i}><line x1={padL} x2={W-padR} y1={y(v)} y2={y(v)} className="chartGrid"/><text x={padL-8} y={y(v)+4} textAnchor="end" className="chartAxis">{v.toLocaleString('pt-BR',{maximumFractionDigits:v>=1000?0:4})}</text></g>)}
  {rows.map((c,i)=>{const up=c.close>=c.open,xx=x(i),yo=y(c.open),yc=y(c.close),yh=y(c.high),yl=y(c.low),top=Math.min(yo,yc),h=Math.max(1,Math.abs(yc-yo));return <g key={c.openTime} className={up?'candleUp':'candleDown'}><line x1={xx} x2={xx} y1={yh} y2={yl} className="wick"/><rect x={xx-cw/2} y={top} width={cw} height={h} rx={1}/></g>})}
  <text x={padL} y={H-8} className="chartAxis">{new Date(rows[0].openTime).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</text><text x={W-padR} y={H-8} textAnchor="end" className="chartAxis">{new Date(rows.at(-1)!.openTime).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</text>
 </svg><div className="chartCaption">Candles 5m reais • Binance Futures público • {rows.length} candles</div></div>;
}

export default function Page(){
 const [session,setSession]=useState<any>(null),[authReady,setAuthReady]=useState(false),[authEmail,setAuthEmail]=useState(''),[authMessage,setAuthMessage]=useState('');
 const [marketData,setMarketData]=useState<MarketResponse|null>(null),[selectedSymbol,setSelectedSymbol]=useState('BTCUSDT'),[paper,setPaper]=useState<any>(null),[portfolio,setPortfolio]=useState<Portfolio|null>(null),[audit,setAudit]=useState<AuditEvent[]>([]),[tab,setTab]=useState<'terminal'|'portfolio'|'strategies'|'backtest'|'validation'|'intelligence'|'supervisor'|'learning'|'shadow'|'execution'|'portfolio-intel'|'regime-intel'|'risk-budget'|'data-health'|'autopilot'|'audit'>('terminal'),[error,setError]=useState(''),[loading,setLoading]=useState(false),[technical,setTechnical]=useState<any>(null),[strategyStats,setStrategyStats]=useState<any[]>([]),[backtest,setBacktest]=useState<any>(null),[backtestStrategy,setBacktestStrategy]=useState('TREND_PULLBACK_V1'),[backtestLoading,setBacktestLoading]=useState(false),[intelligence,setIntelligence]=useState<any>(null),[ranking,setRanking]=useState<any>(null),[intelLoading,setIntelLoading]=useState(false),[validation,setValidation]=useState<any>(null),[validationLoading,setValidationLoading]=useState(false),[portfolioRisk,setPortfolioRisk]=useState<any>(null),[autoPreview,setAutoPreview]=useState<any>(null),[supervisor,setSupervisor]=useState<any>(null),[supervisorLoading,setSupervisorLoading]=useState(false),[learning,setLearning]=useState<any>(null),[learningLoading,setLearningLoading]=useState(false),[shadow,setShadow]=useState<any>(null),[shadowLoading,setShadowLoading]=useState(false),[executionIntel,setExecutionIntel]=useState<any>(null),[portfolioIntel,setPortfolioIntel]=useState<any>(null),[portfolioIntelLoading,setPortfolioIntelLoading]=useState(false),[regimeIntel,setRegimeIntel]=useState<any>(null),[regimeIntelLoading,setRegimeIntelLoading]=useState(false),[riskBudget,setRiskBudget]=useState<any>(null),[riskBudgetLoading,setRiskBudgetLoading]=useState(false),[dataHealth,setDataHealth]=useState<any>(null),[dataHealthLoading,setDataHealthLoading]=useState(false),[autopilot,setAutopilot]=useState<any>(null),[autopilotLoading,setAutopilotLoading]=useState(false),[wallet,setWallet]=useState<any>(null),[walletLoading,setWalletLoading]=useState(false);
 const symbols=useMemo(()=>marketData?.markets.map(m=>m.symbol)??[],[marketData]); const live=useBinanceLive(symbols);
 const selectedBase=marketData?.markets.find(m=>m.symbol===selectedSymbol)??marketData?.markets[0];
 const selected=selectedBase?{...selectedBase,price:live.ticks[selectedBase.symbol]?.price??selectedBase.price,spreadPct:live.ticks[selectedBase.symbol]?.spreadPct??selectedBase.spreadPct,ts:live.ticks[selectedBase.symbol]?.ts??selectedBase.ts}:null;

 useEffect(()=>{let mounted=true;supabase.auth.getSession().then(({data})=>{if(mounted){setSession(data.session);setAuthReady(true)}});const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{setSession(next);setAuthReady(true)});return()=>{mounted=false;subscription.unsubscribe()}},[]);
 const accessToken=session?.access_token as string|undefined;
 const authHeaders=useCallback((extra:Record<string,string>={})=>accessToken?{...extra,Authorization:`Bearer ${accessToken}`}:{...extra},[accessToken]);
 const sendMagicLink=async()=>{setAuthMessage('');if(!authEmail.trim())return;const redirect=window.location.origin;const {error}=await supabase.auth.signInWithOtp({email:authEmail.trim(),options:{emailRedirectTo:redirect}});setAuthMessage(error?`Falha no login: ${error.message}`:'Link de acesso enviado. Verifique seu e-mail.')};
 const signOut=async()=>{await supabase.auth.signOut();setPortfolio(null);setWallet(null);setAudit([]);setStrategyStats([]);setPortfolioRisk(null);setSupervisor(null)};


 const loadWallet=useCallback(async()=>{if(!accessToken){setWallet(null);return}try{const r=await fetch('/api/wallet',{cache:'no-store',headers:authHeaders()});const j=await r.json();if(r.ok)setWallet(j)}catch{}},[accessToken,authHeaders]);
 const deposit1000=async()=>{if(!accessToken)return;setWalletLoading(true);try{const r=await fetch('/api/wallet',{method:'POST',headers:authHeaders({'content-type':'application/json'}),body:JSON.stringify({amountBrl:1000})});const j=await r.json();if(r.ok){setWallet((prev:any)=>({...prev,...j}));await loadPortfolio();setAuthMessage(`Depósito PAPER de R$ 1.000,00 = ${j.deposit?.usdt?.toFixed?.(2)??'—'} USDT registrado. Nenhum dinheiro real foi movimentado.`)}else setAuthMessage(j.error||'Falha no depósito PAPER')}finally{setWalletLoading(false)}};

 const loadMarket=useCallback(async()=>{try{const r=await fetch('/api/market',{cache:'no-store'});const j=await r.json();if(!r.ok)throw new Error(j.error||'Falha de mercado');setMarketData(j);if(!j.markets.some((m:Market)=>m.symbol===selectedSymbol))setSelectedSymbol(j.markets[0]?.symbol??'BTCUSDT');setError('')}catch(e){setError(e instanceof Error?e.message:'Erro de mercado')}},[selectedSymbol]);
 const loadPortfolio=useCallback(async()=>{if(!accessToken){setPortfolio(null);return}try{const r=await fetch('/api/portfolio',{cache:'no-store',headers:authHeaders()});const j=await r.json();if(r.ok)setPortfolio(j)}catch{}},[accessToken,authHeaders]);
 const loadAudit=useCallback(async()=>{if(!accessToken)return;try{const r=await fetch('/api/history?limit=100',{cache:'no-store',headers:authHeaders()});const j=await r.json();if(r.ok)setAudit(j.events??[])}catch{}},[accessToken,authHeaders]);
 const loadTechnical=useCallback(async()=>{try{const r=await fetch(`/api/technical?symbol=${selectedSymbol}`,{cache:'no-store'});const j=await r.json();if(r.ok)setTechnical(j)}catch{}},[selectedSymbol]);
 const loadPortfolioRisk=useCallback(async()=>{if(!accessToken)return;try{const r=await fetch('/api/portfolio-risk',{cache:'no-store',headers:authHeaders()});const j=await r.json();if(r.ok)setPortfolioRisk(j)}catch{}},[accessToken,authHeaders]);
 const loadStrategyStats=useCallback(async()=>{if(!accessToken)return;try{const r=await fetch('/api/metrics',{cache:'no-store',headers:authHeaders()});const j=await r.json();if(r.ok)setStrategyStats(j.metrics??[])}catch{}},[accessToken,authHeaders]);
 useEffect(()=>{loadMarket();loadPortfolio();loadWallet();const t=window.setInterval(()=>{loadMarket();loadPortfolio();loadWallet()},5000);return()=>window.clearInterval(t)},[loadMarket,loadPortfolio,loadWallet]);
 useEffect(()=>{loadTechnical()},[loadTechnical]);
 useEffect(()=>{if(tab==='audit')loadAudit();if(tab==='strategies')loadStrategyStats();if(tab==='portfolio')loadPortfolioRisk();if(tab==='intelligence'){loadIntelligence();loadRanking()}if(tab==='supervisor')loadSupervisor();if(tab==='learning')loadLearning();if(tab==='shadow')loadShadow();if(tab==='execution')loadExecutionIntel();if(tab==='portfolio-intel')loadPortfolioIntel();if(tab==='regime-intel')loadRegimeIntel();if(tab==='risk-budget')loadRiskBudget();if(tab==='data-health')loadDataHealth();if(tab==='autopilot')loadAutopilot()},[tab,loadAudit,loadStrategyStats,selectedSymbol]);



 const loadIntelligence=async()=>{setIntelLoading(true);try{const r=await fetch(`/api/intelligence?symbol=${selectedSymbol}`,{cache:'no-store'});const j=await r.json();if(r.ok)setIntelligence(j)}finally{setIntelLoading(false)}};
 const loadRanking=async()=>{try{const r=await fetch('/api/ranking?limit=700',{cache:'no-store'});const j=await r.json();if(r.ok)setRanking(j)}catch{}};
 const loadSupervisor=async()=>{setSupervisorLoading(true);try{const r=await fetch(`/api/supervisor?symbol=${selectedSymbol}`,{cache:'no-store',headers:authHeaders()});const j=await r.json();if(r.ok)setSupervisor(j)}finally{setSupervisorLoading(false)}};

 const runValidation=async()=>{setValidationLoading(true);try{const r=await fetch(`/api/validation?symbol=${selectedSymbol}&strategy=${backtestStrategy}&limit=960`,{cache:'no-store'});const j=await r.json();setValidation(j)}finally{setValidationLoading(false)}};
 const previewAutoScanner=async()=>{if(!ranking?.rows)return;const r=await fetch('/api/auto-scanner',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({rows:ranking.rows,enabled:true,minimumScore:70,cooldownMinutes:30,maxNewTradesPerCycle:1})});setAutoPreview(await r.json())};
 const loadLearning=async()=>{if(!accessToken)return;setLearningLoading(true);try{const r=await fetch('/api/learning',{cache:'no-store',headers:authHeaders()});const j=await r.json();if(r.ok)setLearning(j)}finally{setLearningLoading(false)}};

 const loadPortfolioIntel=async()=>{if(!accessToken)return;setPortfolioIntelLoading(true);try{const r=await fetch('/api/portfolio-intelligence',{cache:'no-store',headers:authHeaders()});const j=await r.json();if(r.ok)setPortfolioIntel(j)}finally{setPortfolioIntelLoading(false)}};


 const loadRegimeIntel=async()=>{setRegimeIntelLoading(true);try{const r=await fetch(`/api/regime-intelligence?symbol=${selectedSymbol}`,{cache:'no-store'});const j=await r.json();if(r.ok)setRegimeIntel(j)}finally{setRegimeIntelLoading(false)}};

 const loadRiskBudget=async()=>{if(!accessToken)return;setRiskBudgetLoading(true);try{const r=await fetch(`/api/risk-budget?symbol=${selectedSymbol}&strategy=${backtestStrategy}`,{cache:'no-store',headers:authHeaders()});const j=await r.json();if(r.ok)setRiskBudget(j)}finally{setRiskBudgetLoading(false)}};
 const loadDataHealth=async()=>{setDataHealthLoading(true);try{const r=await fetch(`/api/data-health?symbol=${selectedSymbol}`,{cache:'no-store'});const j=await r.json();setDataHealth(j)}finally{setDataHealthLoading(false)}};

 const loadAutopilot=async()=>{if(!accessToken)return;setAutopilotLoading(true);try{const r=await fetch('/api/autopaper/scan',{cache:'no-store',headers:authHeaders()});const j=await r.json();if(r.ok)setAutopilot(j)}finally{setAutopilotLoading(false)}};
 const updateAutopilot=async(enabled:boolean)=>{if(!accessToken)return;setAutopilotLoading(true);try{const r=await fetch('/api/autopaper/scan',{method:'PUT',headers:authHeaders({'content-type':'application/json'}),body:JSON.stringify({enabled,minimumScore:70,cooldownMinutes:30,maxNewTradesPerCycle:1})});const j=await r.json();if(r.ok)setAutopilot({mode:'PAPER_AUTOPILOT',state:j.state})}finally{setAutopilotLoading(false)}};
 const runAutopilotCycle=async()=>{if(!accessToken)return;setAutopilotLoading(true);try{const r=await fetch('/api/autopaper/scan',{method:'POST',headers:authHeaders({'content-type':'application/json'}),body:'{}'});const j=await r.json();setAutopilot((prev:any)=>({...prev,lastCycle:j}));await loadPortfolio()}finally{setAutopilotLoading(false)}};
 useEffect(()=>{if(!accessToken||!autopilot?.state?.enabled)return;const tick=()=>runAutopilotCycle();const t=window.setInterval(tick,5*60_000);return()=>window.clearInterval(t)},[accessToken,autopilot?.state?.enabled]);

 const loadExecutionIntel=async()=>{const samples=shadow?.preview?.order?[{symbol:shadow.preview.order.symbol,strategyId:shadow.preview.order.strategyId,hourUtc:new Date().getUTCHours(),regime:'UNKNOWN',spreadBps:shadow.preview.order.spreadCostBps*2,slippageBps:shadow.preview.order.slippageBps,latencyMs:shadow.preview.order.latencyMs,fillProbabilityPct:shadow.preview.order.fillProbabilityPct,executionDragBps:shadow.preview.order.executionDragBps,filled:shadow.preview.order.filled,ts:Date.now()}]:[];const r=await fetch('/api/execution-intelligence',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({observations:samples,symbol:selectedSymbol,strategyId:shadow?.preview?.order?.strategyId??'TREND_PULLBACK_V1',expectedEdgeBps:12})});if(r.ok)setExecutionIntel(await r.json())};
 const loadShadow=async()=>{if(!accessToken)return;setShadowLoading(true);try{const r=await fetch(`/api/shadow?symbol=${selectedSymbol}`,{cache:'no-store',headers:authHeaders()});const j=await r.json();if(r.ok)setShadow(j)}finally{setShadowLoading(false)}};
 const runBacktest=async()=>{setBacktestLoading(true);try{const r=await fetch(`/api/backtest?symbol=${selectedSymbol}&strategy=${backtestStrategy}&limit=700`,{cache:'no-store'});const j=await r.json();setBacktest(j)}finally{setBacktestLoading(false)}};

 const execute=async()=>{if(!selected||!accessToken){setAuthMessage('Entre com seu e-mail para registrar operações PAPER.');return;}setLoading(true);setPaper(null);try{const r=await fetch('/api/paper',{method:'POST',headers:authHeaders({'content-type':'application/json'}),body:JSON.stringify({market:selected,leverage:2})});setPaper(await r.json());await loadPortfolio()}finally{setLoading(false)}};
 const closePosition=async(p:Position)=>{if(!accessToken)return;await fetch('/api/portfolio',{method:'PATCH',headers:authHeaders({'content-type':'application/json'}),body:JSON.stringify({id:p.id,markPrice:live.ticks[p.symbol]?.price??p.markPrice})});await loadPortfolio()};
 const agents=useMemo(()=>paper?.decision?.agentScores?Object.entries(paper.decision.agentScores):[],[paper]);
 const sum=portfolio?.summary;

 return <main className="appShell">
  <header className="topbar"><div className="brand"><div className="logo">T</div><div><b>TAD</b><small>TRADING AI DECISIONS • by VendorAI</small></div></div><div className="topStatus"><span className={`dot ${live.status}`}></span>{live.status==='live'?'WebSocket LIVE':'Conectando WS'} <span className="pill">Binance Futures</span><span className="pill warn">PAPER ONLY</span>{session?.user?.email&&<><span className="pill">{session.user.email}</span><button className="tinyBtn" onClick={signOut}>Sair</button></>}</div></header>
  <nav className="nav"><button className={tab==='terminal'?'active':''} onClick={()=>setTab('terminal')}>Terminal</button><button className={tab==='portfolio'?'active':''} onClick={()=>setTab('portfolio')}>Posições & PnL</button><button className={tab==='strategies'?'active':''} onClick={()=>setTab('strategies')}>Estratégias</button><button className={tab==='backtest'?'active':''} onClick={()=>setTab('backtest')}>Backtest</button><button className={tab==='validation'?'active':''} onClick={()=>setTab('validation')}>Robustez</button><button className={tab==='intelligence'?'active':''} onClick={()=>setTab('intelligence')}>Intelligence</button><button className={tab==='supervisor'?'active':''} onClick={()=>setTab('supervisor')}>Supervisor</button><button className={tab==='learning'?'active':''} onClick={()=>setTab('learning')}>Learning</button><button className={tab==='shadow'?'active':''} onClick={()=>setTab('shadow')}>Shadow</button><button className={tab==='execution'?'active':''} onClick={()=>setTab('execution')}>Execution Intel</button><button className={tab==='portfolio-intel'?'active':''} onClick={()=>setTab('portfolio-intel')}>Portfolio Intel</button><button className={tab==='regime-intel'?'active':''} onClick={()=>setTab('regime-intel')}>Regime Intel</button><button className={tab==='risk-budget'?'active':''} onClick={()=>setTab('risk-budget')}>Risk Budget</button><button className={tab==='data-health'?'active':''} onClick={()=>setTab('data-health')}>Data Health</button><button className={tab==='autopilot'?'active':''} onClick={()=>setTab('autopilot')}>Autopilot</button><button className={tab==='audit'?'active':''} onClick={()=>setTab('audit')}>Auditoria</button></nav>
  <section className="summary"><div><small>Equity PAPER</small><b>{sum?dual(sum.equity):'—'}</b></div><div><small>PnL realizado</small><b className={(sum?.realizedPnl??0)>=0?'green':'red'}>{sum?dual(sum.realizedPnl):'—'}</b></div><div><small>PnL aberto</small><b className={(sum?.unrealizedPnl??0)>=0?'green':'red'}>{sum?dual(sum.unrealizedPnl):'—'}</b></div><div><small>Posições abertas</small><b>{sum?.openPositions??0}/3</b></div><div><small>Storage</small><b className={portfolio?.storage==='SUPABASE_RLS_AUTH'?'green':'warnText'}>{portfolio?.storage??'—'}</b></div><div><small>LIVE</small><b className="red">BLOQUEADO</b></div></section>
  {error&&<div className="error">Market Data: {error}</div>}
  {authReady&&!session&&<section className="authBar"><div><b>Entrar no TAD PAPER</b><small>Market Data continua público. Login é exigido apenas para posições, PnL e auditoria.</small></div><input type="email" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} placeholder="seu@email.com"/><button className="tinyBtn" onClick={sendMagicLink}>Enviar link de acesso</button>{authMessage&&<span>{authMessage}</span>}</section>}
  {session&&<section className="authBar paperWallet"><div><b>Carteira PAPER</b><small>Motor em USDT • equivalente em R$ • nenhum dinheiro real</small></div><div><small>Depositado</small><b>{wallet?.wallet?dual(wallet.wallet.depositedCapital):'—'}</b></div><div><small>Equity</small><b>{wallet?.summary?dual(wallet.summary.equity):'—'}</b></div><div><small>Risco bruto/trade</small><b>{wallet?.limits?`${wallet.limits.maxRiskPerTradePct.toFixed(2)}% • ${dual(wallet.limits.maxRiskPerTradeAmount)}`:'—'}</b></div><div><small>Perda diária máx.</small><b>{wallet?.limits?`${wallet.limits.maxDailyLossPct.toFixed(2)}% • ${dual(wallet.limits.maxDailyLossAmount)}`:'—'}</b></div><div><small>FX PAPER referência</small><b>1 USDT ≈ {money.format(PAPER_BRL_PER_USDT)}</b></div><button className="tinyBtn" disabled={walletLoading} onClick={deposit1000}>{walletLoading?'Depositando...':'Depositar R$ 1.000 PAPER'}</button></section>}
  {authReady&&session&&authMessage&&<div className="authNotice">{authMessage}</div>}
  {authReady&&!session&&(['portfolio','strategies','supervisor','learning','shadow','execution','portfolio-intel','risk-budget','autopilot','audit'] as string[]).includes(tab)&&<div className="authNotice authRequired"><b>Login necessário</b> • Esta área usa dados privados da sua carteira PAPER. Entre por Magic Link para carregar os dados reais desta aba.</div>}


  {tab==='backtest'&&<section className="panel" style={{marginTop:12}}><div className="panelHead"><div><small>VALIDATION LAB</small><h2>Backtest & Replay</h2></div><span className="pill warn">PAPER / HISTÓRICO</span></div><div style={{padding:16}}><div className="controls" style={{display:'flex',gap:8,flexWrap:'wrap'}}><select value={selectedSymbol} onChange={e=>setSelectedSymbol(e.target.value)}>{symbols.map(s=><option key={s}>{s}</option>)}</select><select value={backtestStrategy} onChange={e=>setBacktestStrategy(e.target.value)}><option>MOMENTUM_V1</option><option>TREND_PULLBACK_V1</option><option>VWAP_REVERSION_V1</option><option>BREAKOUT_V1</option></select><button className="primary" onClick={runBacktest} disabled={backtestLoading}>{backtestLoading?'Rodando...':'Rodar backtest'}</button></div>{backtest&&<><div className="summary" style={{marginTop:12}}><div><small>Trades</small><b>{backtest.summary.trades}</b></div><div><small>Win rate</small><b>{backtest.summary.winRatePct.toFixed(1)}%</b></div><div><small>Retorno líquido</small><b className={backtest.summary.netReturnPct>=0?'green':'red'}>{backtest.summary.netReturnPct.toFixed(2)}%</b></div><div><small>Profit factor</small><b>{backtest.summary.profitFactor?.toFixed(2)??'—'}</b></div><div><small>Max drawdown</small><b className="red">{backtest.summary.maxDrawdownPct.toFixed(2)}%</b></div><div><small>Custos</small><b>{backtest.costModel.takerFeePct}% + slip {backtest.costModel.slippagePct}%</b></div></div><h3 style={{marginTop:18}}>Desempenho por regime</h3><div className="tableWrap"><table><thead><tr><th>Regime</th><th>Trades</th><th>Win rate</th><th>PnL líquido</th><th>Profit factor</th></tr></thead><tbody>{backtest.byRegime.map((r:any)=><tr key={r.regime}><td>{r.regime}</td><td>{r.trades}</td><td>{r.winRatePct.toFixed(1)}%</td><td className={r.netReturnPct>=0?'green':'red'}>{r.netReturnPct.toFixed(2)}%</td><td>{r.profitFactor?.toFixed(2)??'—'}</td></tr>)}</tbody></table></div></>}</div></section>}

  {tab==='validation'&&<section className="panel" style={{marginTop:12}}><div className="panelHead"><div><small>ROBUSTNESS LAB V0.20</small><h2>Walk-forward + Monte Carlo</h2></div><span className="pill warn">HISTóRICO / PAPERM�S�L�,�