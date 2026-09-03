'use client';
import { useEffect,useState } from 'react';
import { supabase } from '../../lib/supabase';
const C={bg:'#0b0e11',panel:'#181a20',line:'#2b3139',text:'#eaecef',muted:'#848e9c',yellow:'#f0b90b',green:'#0ecb81'};
const labels:Record<string,string>={ASIA:'Ásia',EUROPE:'Europa',EUROPE_US_OVERLAP:'Overlap Europa/EUA',US:'EUA',OFF_HOURS:'Fora das principais sessões'};
const n=(v:number,d=2)=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
export default function SessionsPage(){
 const [data,setData]=useState<any>(null),[error,setError]=useState('');
 useEffect(()=>{(async()=>{const {data:s}=await supabase.auth.getSession();const token=s.session?.access_token;if(!token){setError('Faça login.');return;}const r=await fetch('/api/session-intelligence',{headers:{authorization:`Bearer ${token}`},cache:'no-store'});const j=await r.json();if(!r.ok){setError(j.error||'Falha');return;}setData(j)})()},[]);
 if(error)return <main style={{minHeight:'100vh',background:C.bg,color:C.text,padding:24}}>{error}</main>;
 if(!data)return <main style={{minHeight:'100vh',background:C.bg,color:C.text,padding:24}}>Carregando sessões…</main>;
 return <main style={{minHeight:'100vh',background:C.bg,color:C.text,padding:22,fontFamily:'Inter,Arial,sans-serif'}}><div style={{maxWidth:1250,margin:'0 auto'}}>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}><div><div style={{fontSize:12,color:C.muted}}>TAD · PAPER LEARNING</div><h1 style={{margin:'5px 0'}}>Session Intelligence</h1><div style={{color:C.muted}}>Aprendizado por sessão global. Nesta etapa é observacional; o futuro ajuste será limitado a ±2 pontos.</div></div><a href='/' style={{color:C.yellow}}>← Terminal</a></div>
  <div style={{margin:'18px 0',padding:16,border:`1px solid ${C.yellow}`,background:C.panel,borderRadius:9}}><div style={{fontSize:11,color:C.muted}}>SESSÃO ATUAL</div><div style={{fontSize:27,fontWeight:900}}>{labels[data.currentSession]||data.currentSession}</div><div style={{color:C.muted,fontSize:12,marginTop:4}}>Binding PAPER: NÃO · LIVE: BLOQUEADO</div></div>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:10}}>{(data.report||[]).map((r:any)=><article key={r.session} style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:9,padding:14}}><div style={{fontSize:12,color:C.muted}}>{labels[r.session]||r.session}</div><div style={{fontSize:22,fontWeight:900,margin:'4px 0'}}>{r.trades} trades</div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:7,fontSize:12}}><div>Win rate<br/><b>{n(r.winRatePct,1)}%</b></div><div>PnL<br/><b style={{color:r.pnl>=0?C.green:'#f6465d'}}>{n(r.pnl)} USDT</b></div><div>PnL médio<br/><b>{n(r.avgPnl)}</b></div><div>Profit factor<br/><b>{r.profitFactor==null?'—':n(r.profitFactor,2)}</b></div></div></article>)}</div>
  <p style={{color:C.muted,fontSize:12,marginTop:14}}>As sessões são definidas por UTC: Ásia 00–07h, Europa 07–13h, overlap 13–16h, EUA 16–21h e off-hours 21–00h.</p>
 </div></main>;
}
