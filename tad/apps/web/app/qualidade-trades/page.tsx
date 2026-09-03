'use client';
import { useEffect,useState } from 'react';
import { supabase } from '../../lib/supabase';

type Row={id:string;symbol:string;strategyId:string;side:string;durationMinutes:number;realizedPnl:number;closeReason:string|null;mfePct:number;maePct:number;exitEfficiencyPct:number;coveragePct:number;classification:string};
type Payload={trades:Row[];summary:{trades:number;avgMfePct:number;avgMaePct:number;avgExitEfficiencyPct:number;avgDurationMinutes:number;classifications:Record<string,number>}};
const n=(v:number,d=2)=>Number(v||0).toFixed(d);
export default function TradeQualityPage(){
 const [data,setData]=useState<Payload|null>(null);const [error,setError]=useState('');
 useEffect(()=>{(async()=>{const {data:s}=await supabase.auth.getSession();const token=s.session?.access_token;if(!token)return setError('Faça login para consultar os trades.');const r=await fetch('/api/trade-quality',{headers:{authorization:`Bearer ${token}`}});const j=await r.json();if(!r.ok)return setError(j.error||'Falha ao carregar');setData(j)})()},[]);
 if(error)return <main style={{padding:24,color:'#f3f4f6',background:'#0b0e11',minHeight:'100vh'}}>{error}</main>;
 if(!data)return <main style={{padding:24,color:'#f3f4f6',background:'#0b0e11',minHeight:'100vh'}}>Carregando qualidade dos trades…</main>;
 const s=data.summary;
 return <main style={{padding:24,color:'#eaecef',background:'#0b0e11',minHeight:'100vh',fontFamily:'Arial,sans-serif'}}>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}><div><h1 style={{margin:0}}>Qualidade dos Trades</h1><p style={{color:'#848e9c'}}>PAPER/SHADOW · análise pós-trade baseada no caminho real de preço.</p></div><a href='/testes' style={{color:'#f0b90b'}}>Voltar ao Teste Oficial</a></div>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:10,margin:'18px 0'}}>
   {[['Trades',s.trades],['MFE médio',`${n(s.avgMfePct)}%`],['MAE médio',`${n(s.avgMaePct)}%`],['Eficiência saída',`${n(s.avgExitEfficiencyPct)}%`],['Duração média',`${Math.round(s.avgDurationMinutes)} min`]].map(([k,v])=><div key={String(k)} style={{background:'#181a20',border:'1px solid #2b3139',padding:14,borderRadius:8}}><div style={{fontSize:12,color:'#848e9c'}}>{k}</div><strong style={{fontSize:20}}>{v}</strong></div>)}
  </div>
  <div style={{background:'#181a20',border:'1px solid #2b3139',borderRadius:8,overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}><thead><tr>{['Ativo','Estratégia','Lado','PnL','MFE','MAE','Eficiência','Duração','Saída','Classificação','Cobertura'].map(h=><th key={h} style={{textAlign:'left',padding:10,color:'#848e9c',borderBottom:'1px solid #2b3139'}}>{h}</th>)}</tr></thead><tbody>{data.trades.map(t=><tr key={t.id}><td style={{padding:10}}>{t.symbol}</td><td>{t.strategyId}</td><td>{t.side}</td><td>{n(t.realizedPnl,2)}</td><td>{n(t.mfePct)}%</td><td>{n(t.maePct)}%</td><td>{n(t.exitEfficiencyPct)}%</td><td>{t.durationMinutes}m</td><td>{t.closeReason||'-'}</td><td><strong>{t.classification}</strong></td><td>{n(t.coveragePct,0)}%</td></tr>)}</tbody></table></div>
  <p style={{color:'#848e9c',fontSize:12,marginTop:12}}>MFE = máximo movimento favorável; MAE = máximo movimento adverso. Cobertura abaixo de 100% indica que o histórico de candles disponível não cobre todo o período do trade.</p>
 </main>
}
