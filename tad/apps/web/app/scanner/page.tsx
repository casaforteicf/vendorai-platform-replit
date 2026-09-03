'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

const C={bg:'#0b0e11',panel:'#181a20',line:'#2b3139',text:'#eaecef',muted:'#848e9c',yellow:'#f0b90b',green:'#0ecb81',red:'#f6465d'};
const n=(v:number,d=2)=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});

export default function ScannerPage(){
 const [session,setSession]=useState<any>(null),[data,setData]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{supabase.auth.getSession().then(({data})=>setSession(data.session));const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>subscription.unsubscribe()},[]);
 const load=useCallback(async()=>{if(!session?.access_token)return;setBusy(true);setError('');try{const r=await fetch('/api/market-scanner',{headers:{Authorization:`Bearer ${session.access_token}`},cache:'no-store'});const j=await r.json();if(r.ok)setData(j);else setError(j.error||'Falha ao carregar scanner')}catch{setError('Falha ao carregar scanner')}finally{setBusy(false)}},[session?.access_token]);
 useEffect(()=>{load()},[load]);
 if(!session)return <main style={{minHeight:'100vh',background:C.bg,color:C.text,padding:30,fontFamily:'Inter,system-ui'}}><h1>Scanner de Mercado</h1><a href="/login" style={{color:C.yellow}}>Entrar</a></main>;
 const rows=data?.rows||[];
 return <main style={{minHeight:'100vh',background:C.bg,color:C.text,fontFamily:'Inter,system-ui,sans-serif'}}>
  <header style={{height:58,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 18px',borderBottom:`1px solid ${C.line}`,position:'sticky',top:0,background:C.bg,zIndex:10}}><div style={{display:'flex',gap:14,alignItems:'center'}}><b style={{fontSize:24,color:C.yellow}}>TAD</b><span style={{fontSize:12,color:C.muted}}>V0.24 · MARKET SCANNER PAPER</span></div><div style={{display:'flex',gap:8}}><a href="/" style={{color:C.text,textDecoration:'none',border:`1px solid ${C.line}`,padding:'8px 11px',borderRadius:5}}>Terminal</a><a href="/testes" style={{color:C.text,textDecoration:'none',border:`1px solid ${C.line}`,padding:'8px 11px',borderRadius:5}}>Teste 30 dias</a><button onClick={load} disabled={busy} style={{background:C.yellow,color:'#111',border:0,borderRadius:5,padding:'8px 12px',fontWeight:900}}>{busy?'Atualizando...':'Atualizar'}</button></div></header>
  <section style={{padding:18,maxWidth:1500,margin:'0 auto'}}>
   <div style={{display:'flex',justifyContent:'space-between',gap:16,flexWrap:'wrap',alignItems:'end'}}><div><div style={{fontSize:12,color:C.muted}}>UNIVERSO DINÂMICO · USDT PERPÉTUOS</div><h1 style={{margin:'5px 0'}}>Scanner de oportunidades</h1><p style={{maxWidth:850,color:C.muted,lineHeight:1.5}}>O scanner filtra contratos em negociação por liquidez, spread, volume, funding e volatilidade. Somente ativos elegíveis podem chegar ao Autopilot PAPER; depois ainda passam por estratégia, Data Health, robustez, regime, risco, portfólio e Supervisor.</p></div>{data&&<div style={{display:'flex',gap:8}}><div style={{padding:'10px 12px',background:C.panel,border:`1px solid ${C.line}`,borderRadius:6}}><div style={{fontSize:10,color:C.muted}}>UNIVERSO</div><b>{data.universeSize}</b></div><div style={{padding:'10px 12px',background:C.panel,border:`1px solid ${C.line}`,borderRadius:6}}><div style={{fontSize:10,color:C.muted}}>ELEGÍVEIS</div><b style={{color:C.green}}>{data.eligibleCount}</b></div></div>}</div>
   {error&&<div style={{marginTop:12,padding:11,border:`1px solid ${C.red}`,color:C.red,borderRadius:5}}>{error}</div>}
   <div style={{marginTop:14,background:C.panel,border:`1px solid ${C.line}`,borderRadius:6,overflow:'auto'}}>
    <div style={{minWidth:1100}}><div style={{display:'grid',gridTemplateColumns:'50px 130px 90px 90px 90px 90px 90px 110px 110px 1fr',gap:8,padding:'10px 12px',borderBottom:`1px solid ${C.line}`,fontSize:10,color:C.muted}}><span>#</span><span>ATIVO</span><span>SCORE</span><span>LIQ.</span><span>SPREAD</span><span>VOL.</span><span>FUNDING</span><span>VOLUME 24H</span><span>RANGE 24H</span><span>STATUS</span></div>{rows.map((r:any,i:number)=><div key={r.symbol} style={{display:'grid',gridTemplateColumns:'50px 130px 90px 90px 90px 90px 90px 110px 110px 1fr',gap:8,padding:'11px 12px',borderBottom:`1px solid ${C.line}`,fontSize:12,alignItems:'center'}}><span style={{color:C.muted}}>{i+1}</span><b>{r.symbol}</b><b style={{color:r.scannerScore>=75?C.green:r.scannerScore>=60?C.yellow:C.text}}>{n(r.scannerScore,1)}</b><span>{n(r.liquidityScore,0)}</span><span>{n(r.spreadPct,3)}%</span><span>{n(r.volatilityScore,0)}</span><span>{n((r.fundingRate||0)*100,4)}%</span><span>{n((r.quoteVolume24h||0)/1_000_000,1)}M</span><span>{n(r.intradayRangePct,2)}%</span><span>{r.eligible?<b style={{color:C.green}}>ELEGÍVEL</b>:<span style={{color:C.red}}>{(r.exclusionReasons||[]).join(' · ')}</span>}</span></div>)}</div>
   </div>
  </section>
 </main>;
}
