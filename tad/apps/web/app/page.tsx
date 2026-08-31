'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBinanceLive } from '../hooks/useBinanceLive';
import { supabase } from '../lib/supabase';

type Market={symbol:string;price:number;change24hPct:number;quoteVolume24h:number;spreadPct:number;fundingRate:number;regime:string;opportunityScore:number;ts:number};
type Position={id:string;symbol:string;side:'LONG'|'SHORT';quantity:number;leverage:number;entry:number;markPrice:number;stop:number;targets:number[];accountSize?:number;riskPct:number;riskAmount:number;notional:number;marginUsed:number;unrealizedPnl:number;realizedPnl:number;status:'OPEN'|'CLOSED';closeReason?:string;openedAt:number;closedAt?:number};
type Portfolio={positions:Position[];summary:{startingBalance:number;realizedPnl:number;unrealizedPnl:number;equity:number;openPositions:number;closedPositions:number;winRatePct:number;grossExposure:number}};

type Tab='terminal'|'portfolio'|'risk'|'autopilot';

const BRL_PER_USDT=5.1937;
const n=(v:number,d=2)=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
const usdt=(v:number)=>`${n(v)} USDT`;
const brl=(v:number)=>`R$ ${n(v*BRL_PER_USDT)}`;
const dual=(v:number)=>`${usdt(v)} ≈ ${brl(v)}`;
const px=(v:number)=>`${Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:v>=1000?2:6})} USDT`;

const S={
 page:{minHeight:'100vh',background:'#07111f',color:'#e8eef8',fontFamily:'Inter,system-ui,sans-serif',padding:'18px 18px 70px'} as React.CSSProperties,
 wrap:{maxWidth:1500,margin:'0 auto'} as React.CSSProperties,
 card:{background:'#0d1b2a',border:'1px solid #21364d',borderRadius:16,padding:16} as React.CSSProperties,
 small:{fontSize:12,opacity:.66} as React.CSSProperties,
 btn:{padding:'10px 13px',borderRadius:10,border:'1px solid #35516d',background:'#12283d',color:'#fff',fontWeight:750,cursor:'pointer'} as React.CSSProperties,
 primary:{padding:'11px 15px',borderRadius:10,border:0,background:'#e8eef8',color:'#07111f',fontWeight:900,cursor:'pointer'} as React.CSSProperties,
 grid:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:10} as React.CSSProperties,
};

function Metric({label,value,accent}:{label:string;value:React.ReactNode;accent?:string}){
 return <div style={{...S.card,padding:13}}><div style={S.small}>{label}</div><div style={{fontSize:19,fontWeight:850,marginTop:5,color:accent}}>{value}</div></div>;
}

function OperationCard({p}:{p:Position}){
 const capital=p.accountSize??0;
 const notional=p.notional??p.quantity*p.entry;
 const stopDistance=Math.abs(p.entry-p.stop);
 const stopPct=p.entry?stopDistance/p.entry*100:0;
 const gains=(p.targets||[]).map(t=>Math.abs(t-p.entry)*p.quantity);
 const rr=p.riskAmount>0&&gains.length?gains[gains.length-1]/p.riskAmount:0;
 const pnl=p.status==='OPEN'?p.unrealizedPnl:p.realizedPnl;
 const marginPct=capital>0?p.marginUsed/capital*100:0;
 return <article style={{...S.card,display:'grid',gap:12}}>
  <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',alignItems:'center'}}>
   <div><b style={{fontSize:20}}>{p.symbol} · {p.side}</b><div style={S.small}>{p.status} · {p.leverage}x · {new Date(p.openedAt).toLocaleString('pt-BR')}</div></div>
   <b style={{color:pnl>=0?'#58d68d':'#ff7675'}}>{dual(pnl)}</b>
  </div>
  <div style={{padding:12,borderRadius:12,background:'#081522',border:'1px solid #263d54',fontWeight:800}}>Conta {dual(capital)} · Risco desta entrada {dual(p.riskAmount)} · R:R 1:{rr.toFixed(2)}</div>
  <div style={S.grid}>
   <Metric label="Risco final" value={`${p.riskPct.toFixed(3)}% · ${dual(p.riskAmount)}`}/>
   <Metric label="Exposição / nocional" value={dual(notional)}/>
   <Metric label="Margem utilizada" value={`${dual(p.marginUsed)} · ${marginPct.toFixed(1)}% da conta`}/>
   <Metric label="Quantidade" value={`${n(p.quantity,6)} ${p.symbol.replace('USDT','')}`}/>
   <Metric label="Entrada" value={px(p.entry)}/>
   <Metric label="Stop" value={`${px(p.stop)} · ${stopPct.toFixed(3)}%`}/>
   {(p.targets||[]).map((t,i)=><Metric key={i} label={`TP${i+1}`} value={`${px(t)} · ganho ${dual(gains[i])}`}/>) }
   <Metric label="Saldo se stop" value={dual(Math.max(0,capital-p.riskAmount))} accent="#ff9b9b"/>
   {gains.map((g,i)=><Metric key={`bal-${i}`} label={`Saldo se TP${i+1}`} value={dual(capital+g)} accent="#7de3a7"/>)}
  </div>
 </article>;
}

export default function Page(){
 const [session,setSession]=useState<any>(null);
 const [markets,setMarkets]=useState<Market[]>([]);
 const [selectedSymbol,setSelectedSymbol]=useState('BTCUSDT');
 const [technical,setTechnical]=useState<any>(null);
 const [portfolio,setPortfolio]=useState<Portfolio|null>(null);
 const [wallet,setWallet]=useState<any>(null);
 const [riskBudget,setRiskBudget]=useState<any>(null);
 const [autopilot,setAutopilot]=useState<any>(null);
 const [paper,setPaper]=useState<any>(null);
 const [tab,setTab]=useState<Tab>('terminal');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');

 useEffect(()=>{supabase.auth.getSession().then(({data})=>setSession(data.session));const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>subscription.unsubscribe()},[]);
 const token=session?.access_token as string|undefined;
 const headers=useCallback((extra:Record<string,string>={})=>token?{...extra,Authorization:`Bearer ${token}`}:{...extra},[token]);
 const symbols=useMemo(()=>markets.map(m=>m.symbol),[markets]);
 const live=useBinanceLive(symbols);
 const base=markets.find(m=>m.symbol===selectedSymbol)??markets[0];
 const selected=base?{...base,price:live.ticks[base.symbol]?.price??base.price,spreadPct:live.ticks[base.symbol]?.spreadPct??base.spreadPct}:null;

 const loadPublic=useCallback(async()=>{
  try{const r=await fetch('/api/market',{cache:'no-store'});const j=await r.json();if(r.ok){setMarkets(j.markets||[]);if(j.markets?.length&&!j.markets.some((m:Market)=>m.symbol===selectedSymbol))setSelectedSymbol(j.markets[0].symbol)}}catch{}
 },[selectedSymbol]);
 const loadTechnical=useCallback(async()=>{try{const r=await fetch(`/api/technical?symbol=${selectedSymbol}`,{cache:'no-store'});const j=await r.json();if(r.ok)setTechnical(j)}catch{}},[selectedSymbol]);
 const loadPrivate=useCallback(async()=>{
  if(!token){setPortfolio(null);setWallet(null);setRiskBudget(null);setAutopilot(null);return}
  const req=async(path:string)=>{try{const r=await fetch(path,{cache:'no-store',headers:headers()});const j=await r.json();return r.ok?j:null}catch{return null}};
  const [p,w,rb,a]=await Promise.all([req('/api/portfolio'),req('/api/wallet'),req(`/api/risk-budget?symbol=${selectedSymbol}`),req('/api/autopilot')]);
  if(p)setPortfolio(p);if(w)setWallet(w);if(rb)setRiskBudget(rb);if(a)setAutopilot(a);
 },[token,headers,selectedSymbol]);
 useEffect(()=>{loadPublic();const t=setInterval(loadPublic,5000);return()=>clearInterval(t)},[loadPublic]);
 useEffect(()=>{loadTechnical();loadPrivate()},[loadTechnical,loadPrivate]);

 const deposit=async()=>{if(!token)return;setBusy(true);setMessage('');try{const r=await fetch('/api/wallet',{method:'POST',headers:headers({'content-type':'application/json'}),body:JSON.stringify({amountBrl:1000})});const j=await r.json();setMessage(r.ok?'Depósito PAPER de R$ 1.000 registrado. Nenhum dinheiro real foi movimentado.':j.error||'Falha no depósito PAPER');await loadPrivate()}finally{setBusy(false)}};
 const execute=async()=>{if(!selected){return}if(!token){window.location.href='/login';return}setBusy(true);setMessage('');try{const r=await fetch('/api/paper',{method:'POST',headers:headers({'content-type':'application/json'}),body:JSON.stringify({market:selected,marketId:'CRYPTO'})});const j=await r.json();setPaper(j);setMessage(j.approved?'Operação PAPER aprovada pelos gates e registrada.':`Entrada não liberada: ${j.reason||j.risk?.reasons?.join(' · ')||'Risk Gate'}`);await loadPrivate()}catch{setMessage('Falha ao analisar a operação PAPER.')}finally{setBusy(false)}};
 const updateAutopilot=async(enabled:boolean)=>{if(!token)return;setBusy(true);try{const r=await fetch('/api/autopilot',{method:'PUT',headers:headers({'content-type':'application/json'}),body:JSON.stringify({enabled})});const j=await r.json();if(r.ok)setAutopilot(j);setMessage(r.ok?`Autopilot PAPER ${enabled?'ativado':'desativado'}.`:(j.error||'Falha no Autopilot'))}finally{setBusy(false)}};
 const runCycle=async()=>{if(!token)return;setBusy(true);try{const r=await fetch('/api/autopilot',{method:'POST',headers:headers({'content-type':'application/json'}),body:'{}'});const j=await r.json();setAutopilot((x:any)=>({...x,lastCycle:j}));setMessage(r.ok?'Ciclo PAPER executado.':'Ciclo não executado: '+(j.error||j.status||'gate')) ;await loadPrivate()}finally{setBusy(false)}};

 const equity=portfolio?.summary?.equity??wallet?.depositedCapital??0;
 return <main style={S.page}><div style={S.wrap}>
  <header style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',flexWrap:'wrap',marginBottom:16}}>
   <div><div style={{fontWeight:950,fontSize:28}}>TAD <span style={{fontSize:14,opacity:.55}}>V0.22</span></div><div style={S.small}>TRADING AI DECISIONS · PAPER / SHADOW · LIVE BLOQUEADO</div></div>
   <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><a href="/configuracao" style={{...S.btn,textDecoration:'none'}}>Objetivos & Operação</a><a href={session?'/conta':'/login'} style={{...S.btn,textDecoration:'none'}}>{session?'Minha Conta':'Entrar / Criar conta'}</a></div>
  </header>

  <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14}}>{([['terminal','Terminal'],['portfolio','Carteira & Operações'],['risk','Risco & IA'],['autopilot','Autopilot']] as [Tab,string][]).map(([id,label])=><button key={id} style={{...S.btn,background:tab===id?'#e8eef8':'#12283d',color:tab===id?'#07111f':'#fff'}} onClick={()=>setTab(id)}>{label}</button>)}</div>
  {message&&<div style={{...S.card,marginBottom:14,borderColor:'#3d5e7d'}}>{message}</div>}

  {tab==='terminal'&&<>
   <div style={{...S.grid,marginBottom:12}}><Metric label="Modo" value="PAPER" accent="#7de3a7"/><Metric label="Mercado" value="CRYPTO · Binance Futures"/><Metric label="Saldo PAPER" value={token?dual(equity):'Login necessário'}/><Metric label="LIVE" value="BLOQUEADO" accent="#ff9b9b"/></div>
   <section style={{display:'grid',gridTemplateColumns:'minmax(0,2fr) minmax(320px,1fr)',gap:12}}>
    <div style={S.card}>
     <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',alignItems:'center'}}><div><div style={S.small}>BINANCE FUTURES · DADOS PÚBLICOS REAIS</div><select value={selectedSymbol} onChange={e=>setSelectedSymbol(e.target.value)} style={{marginTop:8,padding:9,borderRadius:9,background:'#081522',color:'#fff',border:'1px solid #36516c'}}>{symbols.map(s=><option key={s}>{s}</option>)}</select></div><div style={{fontSize:28,fontWeight:900}}>{selected?px(selected.price):'Carregando...'}</div></div>
     {selected&&<div style={{...S.grid,marginTop:14}}><Metric label="24h" value={`${selected.change24hPct.toFixed(2)}%`} accent={selected.change24hPct>=0?'#7de3a7':'#ff9b9b'}/><Metric label="Spread" value={`${selected.spreadPct.toFixed(4)}%`}/><Metric label="Funding" value={`${(selected.fundingRate*100).toFixed(4)}%`}/><Metric label="TAD Score" value={`${selected.opportunityScore}/100`} accent="#8dc4ff"/></div>}
     <h3>Multi-timeframe</h3><div style={S.grid}>{technical?.mtf?Object.entries(technical.mtf.frames||{}).map(([tf,f]:any)=><Metric key={tf} label={tf} value={`${f.structure} · RSI ${Number(f.rsi14).toFixed(1)} · ATR ${Number(f.atrPct).toFixed(2)}%`}/>):<div style={S.small}>Carregando análise técnica...</div>}</div>
    </div>
    <aside style={S.card}><div style={S.small}>TAD BRAIN + RISK GATE</div><h2 style={{margin:'7px 0'}}>Entrada orientada por oportunidade</h2><p style={{opacity:.75,lineHeight:1.5}}>A entrada só é registrada se Data Integrity, Robustness, Lifecycle, Regime, Portfolio Intelligence, Supervisor e Risk Budget aprovarem.</p><button style={S.primary} disabled={busy||!selected} onClick={execute}>{busy?'ANALISANDO...':token?'ANALISAR + PAPER TRADE':'ENTRAR PARA OPERAR PAPER'}</button>{paper&&<div style={{marginTop:14,padding:12,borderRadius:10,background:'#081522'}}><b>{paper.approved?'APROVADO':'BLOQUEADO'}</b><div style={S.small}>{paper.profile?`Perfil ${paper.profile}`:''} · LIVE: false</div></div>}</aside>
   </section>
  </>}

  {tab==='portfolio'&&<section style={{display:'grid',gap:12}}>
   {!token?<div style={S.card}>Entre na sua conta para acessar carteira, posições, PnL e histórico. <a href="/login" style={{color:'#9bc4f7'}}>Entrar</a></div>:<>
    <div style={S.grid}><Metric label="Capital / Equity" value={dual(equity)}/><Metric label="PnL realizado" value={dual(portfolio?.summary?.realizedPnl??0)}/><Metric label="PnL aberto" value={dual(portfolio?.summary?.unrealizedPnl??0)}/><Metric label="Posições abertas" value={portfolio?.summary?.openPositions??0}/></div>
    <div style={S.card}><b>Carteira PAPER</b><p style={{opacity:.7}}>O saldo interno é USDT. BRL aparece apenas como referência visual.</p><button style={S.btn} onClick={deposit} disabled={busy}>Adicionar R$ 1.000 em PAPER</button></div>
    {(portfolio?.positions||[]).length?(portfolio!.positions.map(p=><OperationCard key={p.id} p={p}/>)):<div style={S.card}>Nenhuma operação registrada nesta conta.</div>}
   </>}
  </section>}

  {tab==='risk'&&<section style={{display:'grid',gap:12}}>
   {!token?<div style={S.card}>Faça login para calcular o Risk Budget da sua conta.</div>:<>
    <div style={S.grid}><Metric label="Base Risk" value={riskBudget?.budget?`${riskBudget.budget.baseRiskPct.toFixed(2)}%`:'—'}/><Metric label="Final Risk" value={riskBudget?.budget?`${riskBudget.budget.finalRiskPct.toFixed(2)}%`:'—'} accent={riskBudget?.budget?.approved?'#7de3a7':'#ff9b9b'}/><Metric label="Binding Constraint" value={riskBudget?.budget?.bindingConstraint??'—'}/><Metric label="Status" value={riskBudget?.budget?.approved?'LIBERADO':'BLOQUEADO'} accent={riskBudget?.budget?.approved?'#7de3a7':'#ff9b9b'}/></div>
    <div style={S.card}><h3>Constraint Envelope</h3><div style={{display:'grid',gap:8}}>{(riskBudget?.budget?.layers||[]).map((l:any)=><div key={l.name} style={{padding:10,borderRadius:9,background:'#081522',display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><b>{l.name}</b><span>{l.approved?'OK':'VETO'} · {(Number(l.multiplier)*100).toFixed(0)}% · {l.reason}</span></div>)}</div></div>
   </>}
  </section>}

  {tab==='autopilot'&&<section style={{display:'grid',gap:12}}>
   {!token?<div style={S.card}>Faça login para usar o Autopilot PAPER.</div>:<>
    <div style={S.grid}><Metric label="Estado" value={autopilot?.state?.enabled?'ATIVO':'DESATIVADO'} accent={autopilot?.state?.enabled?'#7de3a7':'#ffca70'}/><Metric label="Score mínimo" value={autopilot?.state?.minimumScore??'—'}/><Metric label="Cooldown" value={autopilot?.state?.cooldownMinutes!=null?`${autopilot.state.cooldownMinutes} min`:'—'}/><Metric label="Trades/dia" value="SEM TETO FIXO"/></div>
    <div style={S.card}><h3>Operação por oportunidade</h3><p style={{opacity:.75,lineHeight:1.5}}>O Autopilot não persegue a meta diária e não força operações. Ele usa os slots simultâneos do perfil escolhido e todos os gates continuam obrigatórios.</p><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button style={S.primary} disabled={busy} onClick={()=>updateAutopilot(!autopilot?.state?.enabled)}>{autopilot?.state?.enabled?'Desativar Autopilot':'Ativar Autopilot PAPER'}</button><button style={S.btn} disabled={busy||!autopilot?.state?.enabled} onClick={runCycle}>Executar ciclo agora</button></div></div>
    {autopilot?.lastCycle&&<pre style={{...S.card,whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontSize:12}}>{JSON.stringify(autopilot.lastCycle,null,2)}</pre>}
   </>}
  </section>}

  <footer style={{marginTop:20,display:'flex',justifyContent:'space-between',gap:10,flexWrap:'wrap',fontSize:12,opacity:.55}}><span>TAD V0.22 · PAPER/SHADOW</span><span>Cripto ACTIVE · B3/EUA/Forex/Commodities READY_FOR_FEED · LIVE disabled</span></footer>
 </div></main>;
}
