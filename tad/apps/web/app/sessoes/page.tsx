'use client';

import { useCallback,useEffect,useState } from 'react';
import { supabase } from '../../lib/supabase';

const C={bg:'#0b0e11',panel:'#181a20',line:'#2b3139',text:'#eaecef',muted:'#848e9c',yellow:'#f0b90b',green:'#0ecb81',red:'#f6465d'};
const n=(v:number,d=2)=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
const label=(s:string)=>({ASIA:'Ásia',EUROPE:'Europa',EUROPE_US_OVERLAP:'Overlap Europa/EUA',US:'Estados Unidos',OFF_HOURS:'Fora das principais sessões'} as any)[s]||s;

export default function SessionsPage(){
 const [session,setSession]=useState<any>(null),[data,setData]=useState<any>(null),[error,setError]=useState('');
 useEffect(()=>{supabase.auth.getSession().then(({data})=>setSession(data.session));const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>subscription.unsubscribe()},[]);
 const token=session?.access_token;
 const load=useCallback(async()=>{if(!token)return;try{const r=await fetch('/api/session-intelligence',{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});const j=await r.json();if(r.ok)setData(j);else setError(j.error||'Falha ao carregar')}catch{setError('Falha ao carregar')}},[token]);
 useEffect(()=>{load()},[load]);
 if(!session)return <main style={{minHeight:'100vh',background:C.bg,color:C.text,padding:30,fontFamily:'Inter,system-ui'}}><h1>Trading Session Intelligence</h1><a href="/login" style={{color:C.yellow}}>Entrar</a></main>;
 return <main style={{minHeight:'100vh',background:C.bg,color:C.text,fontFamily:'Inter,system-ui,sans-serif'}}>
  <header style={{height:58,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 18px',borderBottom:`1px solid ${C.line}`,position:'sticky',top:0,background:C.bg,zIndex:5}}><div><b style={{fontSize:24,color:C.yellow}}>TAD</b><span style={{marginLeft:12,fontSize:12,color:C.muted}}>V0.24 · SESSION INTELLIGENCE PAPER/SHADOW</span></div><div style={{display:'flex',gap:8}}><a href="/" style={{color:C.text,textDecoration:'none'}}>Terminal</a><a href="/risk-command" style={{color:C.text,textDecoration:'none'}}>Risk Command</a></div></header>
  <section style={{maxWidth:1450,margin:'0 auto',padding:18}}>
   <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',alignItems:'end'}}><div><div style={{fontSize:12,color:C.muted}}>SESSÃO ATUAL</div><h1 style={{margin:'4px 0'}}>{label(data?.currentSession||'—')}</h1><p style={{color:C.muted,maxWidth:820}}>Compara desempenho PAPER por sessão UTC e separa estratégia e ativo. O peso automático só entra após amostra mínima e permanece limitado dentro do aprendizado contextual.</p></div><button onClick={load} style={{background:C.yellow,border:0,borderRadius:5,padding:'10px 14px',fontWeight:850}}>Atualizar</button></div>
   {error&&<div style={{marginTop:12,color:C.red}}>{error}</div>}
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:10,marginTop:15}}>{(data?.sessions||[]).map((s:any)=><div key={s.session} style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:6,padding:14}}><div style={{fontSize:12,color:C.muted}}>{label(s.session)}</div><div style={{fontSize:20,fontWeight:850,marginTop:5}}>{s.trades} trades</div><div style={{fontSize:12,marginTop:7}}>Win rate <b>{n(s.winRatePct,1)}%</b></div><div style={{fontSize:12}}>PF <b>{s.profitFactor==null?'—':n(s.profitFactor)}</b></div><div style={{fontSize:14,fontWeight:800,color:s.pnl>=0?C.green:C.red,marginTop:7}}>{n(s.pnl)} USDT</div></div>)}</div>
   <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginTop:14}}>
    <section style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:6}}><div style={{padding:12,borderBottom:`1px solid ${C.line}`}}><b>Estratégia × Sessão</b></div><div style={{maxHeight:440,overflow:'auto'}}>{(data?.byStrategy||[]).map((r:any,i:number)=><div key={`${r.strategyId}-${r.session}-${i}`} style={{display:'grid',gridTemplateColumns:'1.3fr 1fr .6fr .7fr .8fr',gap:8,padding:10,borderBottom:`1px solid ${C.line}`,fontSize:12}}><b>{r.strategyId}</b><span>{label(r.session)}</span><span>{r.trades}</span><span>{n(r.winRatePct,1)}%</span><b style={{textAlign:'right',color:r.pnl>=0?C.green:C.red}}>{n(r.pnl)}</b></div>)}</div></section>
    <section style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:6}}><div style={{padding:12,borderBottom:`1px solid ${C.line}`}}><b>Ativo × Sessão</b></div><div style={{maxHeight:440,overflow:'auto'}}>{(data?.bySymbol||[]).map((r:any,i:number)=><div key={`${r.symbol}-${r.session}-${i}`} style={{display:'grid',gridTemplateColumns:'1fr 1.2fr .6fr .7fr .8fr',gap:8,padding:10,borderBottom:`1px solid ${C.line}`,fontSize:12}}><b>{r.symbol}</b><span>{label(r.session)}</span><span>{r.trades}</span><span>{n(r.winRatePct,1)}%</span><b style={{textAlign:'right',color:r.pnl>=0?C.green:C.red}}>{n(r.pnl)}</b></div>)}</div></section>
   </div>
  </section>
 </main>;
}
