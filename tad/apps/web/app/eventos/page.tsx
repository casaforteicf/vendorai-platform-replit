'use client';

import { useCallback,useEffect,useState } from 'react';
import { supabase } from '../../lib/supabase';

const C={bg:'#0b0e11',panel:'#181a20',line:'#2b3139',text:'#eaecef',muted:'#848e9c',yellow:'#f0b90b',green:'#0ecb81',red:'#f6465d',blue:'#4c8bf5'};
function badge(state:string){const blocked=state==='EVENT_ACTIVE';const reduced=state==='PRE_EVENT'||state==='POST_EVENT';return <span style={{fontSize:11,fontWeight:900,color:blocked?C.red:reduced?C.yellow:C.green}}>{blocked?'BLOQUEADO':reduced?'REDUZIDO':'LIVRE'}</span>}

export default function EventosPage(){
 const [session,setSession]=useState<any>(null),[data,setData]=useState<any>(null),[error,setError]=useState('');
 useEffect(()=>{supabase.auth.getSession().then(({data})=>setSession(data.session));const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>subscription.unsubscribe()},[]);
 const token=session?.access_token;
 const load=useCallback(async()=>{if(!token)return;setError('');try{const r=await fetch('/api/event-radar',{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});const j=await r.json();if(r.ok)setData(j);else setError(j.error||'Falha ao carregar radar')}catch{setError('Falha ao carregar radar')}},[token]);
 useEffect(()=>{load()},[load]);
 if(!session)return <main style={{minHeight:'100vh',background:C.bg,color:C.text,padding:30,fontFamily:'Inter,system-ui'}}><h1>Radar de Eventos</h1><a href="/login" style={{color:C.yellow}}>Entrar</a></main>;
 const s=data?.summary||{};
 return <main style={{minHeight:'100vh',background:C.bg,color:C.text,fontFamily:'Inter,system-ui,sans-serif'}}>
  <header style={{height:58,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 18px',borderBottom:`1px solid ${C.line}`}}><div><b style={{fontSize:24,color:C.yellow}}>TAD</b><span style={{fontSize:12,color:C.muted,marginLeft:12}}>V0.24 · RADAR DE EVENTOS · PAPER/SHADOW</span></div><div style={{display:'flex',gap:8}}><a href="/" style={{color:C.text,textDecoration:'none',border:`1px solid ${C.line}`,padding:'8px 11px',borderRadius:5}}>Terminal</a><a href="/scanner" style={{color:C.text,textDecoration:'none',border:`1px solid ${C.line}`,padding:'8px 11px',borderRadius:5}}>Scanner</a><button onClick={load} style={{background:C.yellow,border:0,padding:'8px 11px',fontWeight:900,borderRadius:5}}>Atualizar</button></div></header>
  <section style={{padding:18,maxWidth:1450,margin:'0 auto'}}>
   <h1 style={{marginBottom:4}}>Radar de Eventos e Notícias</h1><p style={{color:C.muted,maxWidth:900,lineHeight:1.5}}>O TAD classifica janelas antes, durante e depois de eventos. HIGH/CRITICAL pode bloquear novas entradas PAPER durante a janela ativa e reduzir prioridade antes/depois do evento.</p>
   {error&&<div style={{border:`1px solid ${C.red}`,color:C.red,padding:10,borderRadius:5}}>{error}</div>}
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:9,margin:'14px 0'}}>{[['Ativos monitorados',s.symbols??0,C.text],['Livres',s.clear??0,C.green],['Reduzidos',s.reduced??0,C.yellow],['Bloqueados',s.blocking??0,C.red]].map(([l,v,c]:any)=><div key={l} style={{background:C.panel,border:`1px solid ${C.line}`,padding:13,borderRadius:6}}><div style={{fontSize:11,color:C.muted}}>{l}</div><div style={{fontSize:22,fontWeight:900,color:c,marginTop:5}}>{v}</div></div>)}</div>
   <section style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:6,overflow:'hidden'}}><div style={{display:'grid',gridTemplateColumns:'1fr .8fr .9fr 1.6fr .7fr .8fr',gap:8,padding:11,borderBottom:`1px solid ${C.line}`,fontSize:11,color:C.muted,fontWeight:800}}><span>ATIVO</span><span>STATUS</span><span>IMPACTO</span><span>EVENTO</span><span>MINUTOS</span><span>FEED</span></div>{(data?.rows||[]).map((r:any)=>{const e=r.assessment?.nearestEvent;return <div key={r.symbol} style={{display:'grid',gridTemplateColumns:'1fr .8fr .9fr 1.6fr .7fr .8fr',gap:8,padding:11,borderBottom:`1px solid ${C.line}`,fontSize:12,alignItems:'center'}}><b>{r.symbol}</b>{badge(r.assessment?.state)}<span>{e?.impact||'—'}</span><span title={e?.source||''}>{e?.title||r.assessment?.reason||'Sem evento relevante'}</span><span>{e?Number(e.minutesFromNow).toFixed(1):'—'}</span><span style={{color:r.provider==='CONFIGURED'?C.green:C.muted}}>{r.provider}</span></div>})}</section>
  </section>
 </main>;
}
