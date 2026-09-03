'use client';
import { useEffect,useState } from 'react';
import { supabase } from '../../lib/supabase';

const C={bg:'#0b0e11',panel:'#181a20',line:'#2b3139',text:'#eaecef',muted:'#848e9c',yellow:'#f0b90b',green:'#0ecb81',red:'#f6465d',orange:'#f0a500'};
const n=(v:number,d=2)=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});

export default function RiskCommandPage(){
 const [data,setData]=useState<any>(null),[error,setError]=useState('');
 useEffect(()=>{(async()=>{const {data:s}=await supabase.auth.getSession();const token=s.session?.access_token;if(!token){setError('Faça login para consultar o Risk Command.');return;}const r=await fetch('/api/risk-command',{headers:{authorization:`Bearer ${token}`},cache:'no-store'});const j=await r.json();if(!r.ok){setError(j.error||'Falha ao carregar');return;}setData(j)})()},[]);
 if(error)return <main style={{minHeight:'100vh',background:C.bg,color:C.text,padding:24}}>{error}</main>;
 if(!data)return <main style={{minHeight:'100vh',background:C.bg,color:C.text,padding:24}}>Carregando Risk Command…</main>;
 const stateLabel=data.state==='OPERATE'?'OPERAR':data.state==='REDUCED'?'REDUZIR':'BLOQUEAR';
 const stateColor=data.state==='OPERATE'?C.green:data.state==='REDUCED'?C.yellow:C.red;
 const s=data.summary||{};
 return <main style={{minHeight:'100vh',background:C.bg,color:C.text,fontFamily:'Inter,Arial,sans-serif',padding:22}}><div style={{maxWidth:1500,margin:'0 auto'}}>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}><div><div style={{fontSize:12,color:C.muted}}>TAD · PAPER/SHADOW</div><h1 style={{margin:'4px 0'}}>Risk Command Center</h1><div style={{color:C.muted,fontSize:13}}>Painel consolidado dos gates já existentes. Não habilita LIVE e não cria um novo gate paralelo.</div></div><div style={{display:'flex',gap:8}}><a href='/' style={btn}>Terminal</a><a href='/scanner' style={btn}>Scanner</a><a href='/eventos' style={btn}>Eventos</a></div></div>
  <div style={{margin:'18px 0',padding:18,border:`1px solid ${stateColor}`,background:C.panel,borderRadius:10,display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}><div><div style={{fontSize:11,color:C.muted}}>ESTADO CONSOLIDADO</div><div style={{fontSize:30,fontWeight:900,color:stateColor}}>{stateLabel}</div></div><div style={{fontSize:12,color:C.muted}}>Binding do painel: NÃO · LIVE: BLOQUEADO</div></div>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:10,marginBottom:18}}>
   <K label='Equity' value={`${n(s.equity)} USDT`}/><K label='Risco aberto' value={`${n(s.openRiskPct)}%`}/><K label='Exposição bruta' value={`${n(s.grossExposure)} USDT`}/><K label='Exposição / Equity' value={`${n(s.exposureMultiple)}x`}/><K label='Drawdown máx.' value={`${n(s.maxDrawdownPct)}%`}/><K label='Correlação máx.' value={`${n((data.correlation?.maxPairCorrelation||0)*100,1)}%`}/><K label='Posições abertas' value={s.openPositions||0}/><K label='PnL realizado' value={`${n(s.realizedPnl)} USDT`}/>
  </div>
  <section style={section}><h2 style={h2}>Autopilot</h2><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:8}}><K label='Ativo' value={data.autopilot?.enabled?'SIM':'NÃO'}/><K label='Score mínimo' value={data.autopilot?.minimumScore??'—'}/><K label='Cooldown' value={`${data.autopilot?.cooldownMinutes??'—'} min`}/><K label='Último ciclo' value={data.autopilot?.lastCycleId||'—'}/></div></section>
  <section style={section}><h2 style={h2}>Condições de risco</h2><div style={{display:'grid',gap:7}}>{(data.conditions||[]).map((x:any)=><div key={x.id} style={{display:'grid',gridTemplateColumns:'minmax(160px,1fr) auto minmax(220px,2fr)',gap:10,padding:10,border:`1px solid ${C.line}`,borderRadius:7,alignItems:'center'}}><b>{x.id}</b><span style={{fontSize:11,fontWeight:900,color:x.active?(x.severity==='KILL'?C.red:C.yellow):C.green}}>{x.active?(x.severity==='KILL'?'ATIVO · KILL':'ATIVO · WARN'):'OK'}</span><span style={{color:C.muted,fontSize:12}}>{x.detail}</span></div>)}</div></section>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))',gap:12}}>
   <section style={section}><h2 style={h2}>Concentração por ativo</h2><Mini rows={data.bySymbol} name='symbol'/></section>
   <section style={section}><h2 style={h2}>Concentração por estratégia</h2><Mini rows={data.byStrategy} name='strategyId'/></section>
  </div>
  <section style={section}><h2 style={h2}>Última decisão PAPER</h2>{!data.latestDecision?<div style={{color:C.muted}}>Nenhuma decisão registrada.</div>:<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:8}}><K label='Supervisor' value={data.latestDecision.supervisor?.state||'—'}/><K label='Data Health' value={data.latestDecision.dataHealth?.status||'—'}/><K label='Regime gate' value={data.latestDecision.regimeGate?.reason||'—'}/><K label='Risk Budget' value={data.latestDecision.riskBudget?.approved?'APROVADO':'BLOQUEADO'}/></div>}</section>
  <section style={section}><h2 style={h2}>Último ciclo do Autopilot</h2>{!data.latestCycle?<div style={{color:C.muted}}>Nenhum ciclo registrado.</div>:<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:8}}><K label='Cycle ID' value={data.latestCycle.cycleId||'—'}/><K label='Scanner elegíveis' value={data.latestCycle.scannerSummary?.eligible??'—'}/><K label='Eventos bloqueados' value={data.latestCycle.eventSummary?.blocked??'—'}/><K label='Selecionados' value={data.latestCycle.selected?.length??0}/></div>}</section>
  <section style={section}><h2 style={h2}>Bloqueios recentes</h2>{!(data.recentBlocks||[]).length?<div style={{color:C.muted}}>Nenhum bloqueio recente.</div>:<div style={{display:'grid',gap:6}}>{data.recentBlocks.map((b:any)=><div key={b.id} style={{padding:9,borderTop:`1px solid ${C.line}`,fontSize:12}}><b>{b.type}</b> · {b.symbol||'—'} · {b.strategyId||'—'} · <span style={{color:C.muted}}>{Array.isArray(b.reason)?b.reason.join(' | '):String(b.reason??'sem motivo')}</span></div>)}</div>}</section>
 </div></main>;
}

function K({label,value}:{label:string;value:any}){return <div style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:7,padding:11}}><div style={{fontSize:10,color:C.muted,textTransform:'uppercase'}}>{label}</div><div style={{fontSize:17,fontWeight:850,marginTop:4}}>{value}</div></div>}
function Mini({rows,name}:{rows:any[];name:string}){return <div>{!rows?.length?<div style={{color:C.muted,fontSize:12}}>Sem posições abertas.</div>:rows.map((r:any,i:number)=><div key={i} style={{display:'grid',gridTemplateColumns:'1fr auto auto',gap:8,padding:'8px 0',borderTop:i?`1px solid ${C.line}`:'none',fontSize:12}}><b>{r[name]}</b><span>{n(r.riskAmount)} risco</span><span>{n(r.exposure)} exp.</span></div>)}</div>}
const btn={padding:'9px 12px',border:'1px solid #2b3139',color:'#eaecef',textDecoration:'none',borderRadius:6};
const section={background:'#181a20',border:'1px solid #2b3139',borderRadius:9,padding:14,marginBottom:12};
const h2={fontSize:16,margin:'0 0 10px'};
