'use client';
import { useEffect,useState } from 'react';

const symbols=['BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','BNBUSDT','DOGEUSDT','SUIUSDT','ADAUSDT'];
const C={bg:'#0b0e11',panel:'#181a20',line:'#2b3139',text:'#eaecef',muted:'#848e9c',yellow:'#f0b90b',green:'#0ecb81',red:'#f6465d',blue:'#4c8bf5'};
const n=(v:number,d=2)=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
function badge(status:string){const color=status==='ACTIVE_PAPER'?C.green:status==='RESEARCH'?C.yellow:C.blue;return <span style={{fontSize:10,fontWeight:900,color,border:`1px solid ${color}`,padding:'3px 6px',borderRadius:4}}>{status}</span>}

export default function SweepPage(){
 const [symbol,setSymbol]=useState('BTCUSDT'),[data,setData]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=async()=>{setBusy(true);setError('');try{const r=await fetch(`/api/strategy-sweep?symbol=${symbol}`,{cache:'no-store'});const j=await r.json();if(!r.ok)throw new Error(j.message||j.error||'Falha');setData(j)}catch(e:any){setError(String(e.message||e))}finally{setBusy(false)}};
 useEffect(()=>{load()},[symbol]);
 return <main style={{minHeight:'100vh',background:C.bg,color:C.text,fontFamily:'Inter,system-ui,sans-serif',padding:20}}>
  <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}><div><div style={{color:C.yellow,fontWeight:900,fontSize:24}}>TAD · Strategy Sweep</div><div style={{color:C.muted,fontSize:12}}>PAPER/SHADOW · 90d → 1m · microestrutura 30s/15s somente em tempo real</div></div><div style={{display:'flex',gap:8}}><a href="/" style={{color:C.text,textDecoration:'none',border:`1px solid ${C.line}`,padding:'8px 10px',borderRadius:5}}>Terminal</a><a href="/biblioteca-estrategias" style={{color:C.text,textDecoration:'none',border:`1px solid ${C.line}`,padding:'8px 10px',borderRadius:5}}>Biblioteca</a></div></div>
  <div style={{display:'flex',gap:8,marginTop:18,flexWrap:'wrap'}}><select value={symbol} onChange={e=>setSymbol(e.target.value)} style={{background:C.panel,color:C.text,border:`1px solid ${C.line}`,padding:'9px 10px',borderRadius:5}}>{symbols.map(s=><option key={s}>{s}</option>)}</select><button onClick={load} disabled={busy} style={{background:C.yellow,color:'#111',border:0,padding:'9px 14px',borderRadius:5,fontWeight:900}}>{busy?'Varrendo...':'Executar varredura'}</button></div>
  {error&&<div style={{marginTop:12,color:C.red}}>{error}</div>}
  {data&&<>
   <section style={{marginTop:18,background:C.panel,border:`1px solid ${C.line}`,borderRadius:6,padding:14}}><b>Mapa multi-horizonte · {symbol}</b><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:6,marginTop:10}}>{data.horizons?.map((h:any)=><div key={h.horizon} style={{border:`1px solid ${C.line}`,padding:9,borderRadius:5}}><div style={{fontSize:11,color:C.muted}}>{h.horizon}</div><div style={{fontWeight:900,color:h.direction==='BULLISH'?C.green:h.direction==='BEARISH'?C.red:C.muted}}>{h.coverage?h.direction:'SEM DADO'}</div><div style={{fontSize:11}}>{h.coverage?`${n(h.returnPct)}% · ${h.regime}`:'tempo real'}</div></div>)}</div></section>
   <section style={{marginTop:14,display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(340px,1fr))',gap:12}}>
    <div style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:6,padding:14}}><h3 style={{marginTop:0}}>Candidatas utilizáveis no PAPER</h3>{(data.topActionable||[]).map((r:any,i:number)=><div key={r.strategyId} style={{padding:'10px 0',borderTop:`1px solid ${C.line}`}}><div style={{display:'flex',justifyContent:'space-between',gap:8}}><b>#{i+1} {r.name}</b><span style={{color:r.eligibilityScore>=75?C.green:r.eligibilityScore>=55?C.yellow:C.red,fontWeight:900}}>{r.eligibilityScore}/100</span></div><div style={{display:'flex',gap:6,marginTop:5,flexWrap:'wrap'}}>{badge(r.status)}<span style={{fontSize:10,color:C.muted}}>execução {r.execution}</span><span style={{fontSize:10,color:C.muted}}>conf. {r.confirmations?.join('/')||'—'}</span></div></div>)}</div>
    <div style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:6,padding:14}}><h3 style={{marginTop:0}}>Pesquisa · não abre trade</h3>{(data.topResearch||[]).map((r:any,i:number)=><div key={r.strategyId} style={{padding:'10px 0',borderTop:`1px solid ${C.line}`}}><div style={{display:'flex',justifyContent:'space-between',gap:8}}><b>#{i+1} {r.name}</b><span style={{color:C.yellow,fontWeight:900}}>{r.eligibilityScore}/100</span></div><div style={{display:'flex',gap:6,marginTop:5,flexWrap:'wrap'}}>{badge(r.status)}<span style={{fontSize:10,color:C.muted}}>{r.family}</span><span style={{fontSize:10,color:C.muted}}>execução {r.execution}</span></div></div>)}</div>
   </section>
   <div style={{marginTop:12,color:C.muted,fontSize:11}}>O score mede compatibilidade par + regime + cobertura temporal. Estratégias RESEARCH permanecem não acionáveis, mesmo com score alto. Nenhuma ordem LIVE é enviada.</div>
  </>}
 </main>
}
