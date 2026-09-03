'use client';
import { useEffect,useState } from 'react';
import { supabase } from '../../lib/supabase';
const C={bg:'#0b0e11',panel:'#181a20',line:'#2b3139',text:'#eaecef',muted:'#848e9c',yellow:'#f0b90b',green:'#0ecb81',red:'#f6465d'};
const symbols=['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','DOGEUSDT'];
const n=(v:number,d=4)=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
export default function MicroPage(){
 const [symbol,setSymbol]=useState('BTCUSDT'),[data,setData]=useState<any>(null),[error,setError]=useState('');
 useEffect(()=>{setData(null);setError('');(async()=>{const {data:s}=await supabase.auth.getSession();const token=s.session?.access_token;if(!token){setError('Faça login.');return;}const r=await fetch(`/api/microstructure?symbol=${symbol}`,{headers:{authorization:`Bearer ${token}`},cache:'no-store'});const j=await r.json();if(!r.ok){setError(j.error||'Falha');return;}setData(j)})()},[symbol]);
 return <main style={{minHeight:'100vh',background:C.bg,color:C.text,padding:22,fontFamily:'Inter,Arial,sans-serif'}}><div style={{maxWidth:1350,margin:'0 auto'}}>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}><div><div style={{fontSize:12,color:C.muted}}>TAD · MICROSTRUCTURE</div><h1 style={{margin:'5px 0'}}>Microestrutura 15s / 30s</h1><div style={{color:C.muted}}>Barras sintéticas construídas com aggTrades reais da Binance Futures. Não são klines nativos.</div></div><a href='/' style={{color:C.yellow}}>← Terminal</a></div>
  <div style={{display:'flex',gap:7,flexWrap:'wrap',margin:'16px 0'}}>{symbols.map(s=><button key={s} onClick={()=>setSymbol(s)} style={{padding:'8px 11px',border:`1px solid ${s===symbol?C.yellow:C.line}`,background:C.panel,color:C.text,borderRadius:6,cursor:'pointer'}}>{s}</button>)}</div>
  {error&&<div style={{padding:14,border:`1px solid ${C.red}`,borderRadius:8}}>{error}</div>}
  {!data&&!error&&<div style={{color:C.muted}}>Carregando trades agregados…</div>}
  {data&&<>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:9,marginBottom:14}}><K label='Score micro' value={`${data.score}/100`}/><K label='Trades' value={data.tradeCount}/><K label='Imbalance' value={n(data.flow?.imbalance,3)}/><K label='Velocidade' value={`${n(data.priceVelocityPctPerMin,4)}%/min`}/><K label='Micro-vol' value={`${n(data.microVolatilityPct,4)}%`}/><K label='Janela' value={`${n(data.window?.durationSec,0)}s`}/></div>
   <div style={{marginBottom:14,padding:12,background:C.panel,border:`1px solid ${C.line}`,borderRadius:8,fontSize:12,color:C.muted}}>Fonte: {data.source} · syntheticFrames={String(data.syntheticFrames)} · nativeKlines={String(data.nativeKlines)} · binding PAPER: NÃO · LIVE: BLOQUEADO</div>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(380px,1fr))',gap:12}}><Bars title='Últimas barras 15s' rows={data.bars15s}/><Bars title='Últimas barras 30s' rows={data.bars30s}/></div>
  </>}
 </div></main>;
}
function K({label,value}:{label:string;value:any}){return <div style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:8,padding:12}}><div style={{fontSize:10,color:C.muted,textTransform:'uppercase'}}>{label}</div><div style={{fontSize:18,fontWeight:850,marginTop:4}}>{value}</div></div>}
function Bars({title,rows}:{title:string;rows:any[]}){return <section style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:9,padding:12,overflowX:'auto'}}><h2 style={{fontSize:15,margin:'0 0 8px'}}>{title}</h2><table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}><thead><tr>{['Hora','O','H','L','C','Trades','Imb.','Ret.'].map(h=><th key={h} style={{textAlign:'left',padding:6,color:C.muted,borderBottom:`1px solid ${C.line}`}}>{h}</th>)}</tr></thead><tbody>{(rows||[]).slice(-12).reverse().map((b:any)=><tr key={b.start}><td style={{padding:6}}>{new Date(b.start).toLocaleTimeString('pt-BR')}</td><td>{n(b.open,4)}</td><td>{n(b.high,4)}</td><td>{n(b.low,4)}</td><td>{n(b.close,4)}</td><td>{b.tradeCount}</td><td style={{color:b.imbalance>=0?C.green:C.red}}>{n(b.imbalance,3)}</td><td>{n(b.returnPct,4)}%</td></tr>)}</tbody></table></section>}
