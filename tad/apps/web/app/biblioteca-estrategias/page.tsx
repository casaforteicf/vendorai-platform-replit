'use client';

import {useEffect,useState} from 'react';

const C={bg:'#0b0e11',panel:'#181a20',line:'#2b3139',text:'#eaecef',muted:'#848e9c',yellow:'#f0b90b',green:'#0ecb81',blue:'#4c8bf5'};
const SYMBOLS=['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','DOGEUSDT','PEPEUSDT','ADAUSDT'];

export default function StrategyLibraryPage(){
 const [symbol,setSymbol]=useState('BTCUSDT');
 const [data,setData]=useState<any>(null);
 useEffect(()=>{fetch(`/api/strategy-library?symbol=${symbol}`,{cache:'no-store'}).then(r=>r.json()).then(setData).catch(()=>setData(null))},[symbol]);
 return <main style={{minHeight:'100vh',background:C.bg,color:C.text,fontFamily:'Inter,system-ui,sans-serif',padding:20}}>
  <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'end',flexWrap:'wrap'}}>
   <div><div style={{fontSize:12,color:C.yellow,fontWeight:900}}>TAD V0.27 · PAPER/SHADOW</div><h1 style={{margin:'5px 0'}}>Biblioteca de Estratégias</h1><div style={{color:C.muted,maxWidth:850}}>50 estratégias organizadas por família e afinidade de par. Somente as marcadas ACTIVE_PAPER participam automaticamente do Autopilot; RESEARCH permanece fora até validação.</div></div>
   <a href="/" style={{color:C.text,textDecoration:'none',border:`1px solid ${C.line}`,padding:'9px 12px',borderRadius:6}}>Voltar ao Terminal</a>
  </div>
  <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:18}}>{SYMBOLS.map(s=><button key={s} onClick={()=>setSymbol(s)} style={{padding:'8px 11px',borderRadius:6,border:`1px solid ${C.line}`,background:symbol===s?C.yellow:C.panel,color:symbol===s?'#111':C.text,fontWeight:800,cursor:'pointer'}}>{s}</button>)}</div>
  {data&&<>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10,marginTop:16}}>
    <div style={{background:C.panel,border:`1px solid ${C.line}`,padding:14}}><small style={{color:C.muted}}>Biblioteca total</small><div style={{fontSize:24,fontWeight:900}}>{data.totalLibrary}</div></div>
    <div style={{background:C.panel,border:`1px solid ${C.line}`,padding:14}}><small style={{color:C.muted}}>Compatíveis com {symbol}</small><div style={{fontSize:24,fontWeight:900}}>{data.eligibleForPair}</div></div>
    <div style={{background:C.panel,border:`1px solid ${C.line}`,padding:14}}><small style={{color:C.muted}}>Classes do par</small><div style={{marginTop:7,fontWeight:800}}>{(data.pairClasses||[]).join(' · ')}</div></div>
   </div>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))',gap:10,marginTop:16}}>{(data.strategies||[]).map((s:any)=><article key={s.id} style={{background:C.panel,border:`1px solid ${C.line}`,padding:14,borderRadius:7}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:8}}><b>{s.name}</b><span style={{fontSize:10,fontWeight:900,color:s.status==='ACTIVE_PAPER'?C.green:C.blue}}>{s.status}</span></div>
    <div style={{fontSize:11,color:C.muted,marginTop:5}}>{s.id} · {s.family}</div>
    <p style={{fontSize:13,lineHeight:1.45}}>{s.description}</p>
    <div style={{fontSize:11,color:C.muted}}>Contexto: <b style={{color:C.text}}>{s.contextHorizons.join(' / ')}</b></div>
    <div style={{fontSize:11,color:C.muted,marginTop:5}}>Execução: <b style={{color:C.yellow}}>{s.execution}</b> · confirmações <b style={{color:C.text}}>{s.confirmations.join(' / ')||'—'}</b></div>
    <div style={{fontSize:11,color:C.muted,marginTop:5}}>Micro: <b style={{color:C.text}}>{s.micro.join(' / ')||'não utiliza'}</b></div>
    <div style={{fontSize:11,color:C.muted,marginTop:5}}>Regimes: <b style={{color:C.text}}>{s.preferredRegimes.join(' / ')}</b></div>
   </article>)}</div>
  </>}
 </main>;
}
