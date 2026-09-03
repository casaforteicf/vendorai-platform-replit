'use client';
import { useEffect,useState } from 'react';
import { supabase } from '../../lib/supabase';

const symbols=['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','DOGEUSDT'];
export default function EventRadarPage(){
 const [symbol,setSymbol]=useState('BTCUSDT');const [data,setData]=useState<any>(null);const [error,setError]=useState('');
 useEffect(()=>{(async()=>{const {data:s}=await supabase.auth.getSession();const token=s.session?.access_token;if(!token)return setError('Faça login para consultar eventos.');setData(null);const r=await fetch(`/api/event-radar?symbol=${symbol}`,{headers:{authorization:`Bearer ${token}`},cache:'no-store'});const j=await r.json();if(!r.ok)return setError(j.error||'Falha ao carregar');setError('');setData(j)})()},[symbol]);
 const a=data?.assessment;
 return <main style={{minHeight:'100vh',background:'#0b0e11',color:'#eaecef',padding:24,fontFamily:'Arial,sans-serif'}}><div style={{maxWidth:1200,margin:'0 auto'}}>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'end',gap:12,flexWrap:'wrap'}}><div><div style={{fontSize:12,color:'#f0b90b',fontWeight:800}}>TAD · PAPER EVENT RADAR</div><h1 style={{margin:'6px 0'}}>Radar de Eventos</h1><div style={{color:'#848e9c'}}>Reduz prioridade ou bloqueia novas entradas PAPER em janelas de evento relevante.</div></div><a href='/' style={{color:'#f0b90b'}}>← Terminal</a></div>
  <div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'18px 0'}}>{symbols.map(s=><button key={s} onClick={()=>setSymbol(s)} style={{background:s===symbol?'#f0b90b':'#181a20',color:s===symbol?'#0b0e11':'#eaecef',border:'1px solid #2b3139',padding:'8px 11px',borderRadius:6,cursor:'pointer'}}>{s}</button>)}</div>
  {error&&<div style={{padding:14,border:'1px solid #f6465d',borderRadius:8}}>{error}</div>}
  {!data&&!error&&<div style={{color:'#848e9c'}}>Carregando radar...</div>}
  {data&&<><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10,marginBottom:18}}><K label='Par' value={symbol}/><K label='Feed' value={data.provider}/><K label='Estado' value={a?.displayStatus||'—'}/><K label='Multiplicador' value={`${Math.round((a?.riskMultiplier??1)*100)}%`}/></div>
   <div style={{background:'#181a20',border:'1px solid #2b3139',borderRadius:8,padding:16,marginBottom:18}}><b>{a?.reason}</b><div style={{color:'#848e9c',marginTop:8}}>Evento mais próximo: {a?.nearestEvent?.title||'Nenhum na janela de risco'}</div>{a?.nearestEvent&&<div style={{color:'#848e9c',marginTop:4}}>Impacto {a.nearestEvent.impact} · {Math.round(a.nearestEvent.minutesFromNow)} min do momento atual</div>}</div>
   <div style={{background:'#181a20',border:'1px solid #2b3139',borderRadius:8,overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}><thead><tr>{['Evento','Impacto','Sentimento','Fonte','Horário'].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead><tbody>{(data.events||[]).map((e:any)=><tr key={e.id}><td style={td}>{e.title}</td><td style={td}>{e.impact}</td><td style={td}>{e.sentiment}</td><td style={td}>{e.source}</td><td style={td}>{new Date(e.publishedAt).toLocaleString('pt-BR')}</td></tr>)}</tbody></table></div>
  </>}
 </div></main>
}
const th={textAlign:'left' as const,padding:10,color:'#848e9c',borderBottom:'1px solid #2b3139'};const td={padding:10,borderBottom:'1px solid #1e2329'};
function K({label,value}:{label:string,value:any}){return <div style={{background:'#181a20',border:'1px solid #2b3139',borderRadius:8,padding:13}}><div style={{fontSize:11,color:'#848e9c'}}>{label}</div><div style={{fontSize:18,fontWeight:800,marginTop:5}}>{value}</div></div>}
