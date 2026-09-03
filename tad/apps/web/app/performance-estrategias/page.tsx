'use client';
import { useEffect, useState } from 'react';

type Row={strategyId:string;symbol:string;side:string;trades:number;wins:number;losses:number;winRatePct:number;realizedPnl:number;avgPnl:number;profitFactor:number|null;recentTrades:number;recentWinRatePct:number;recentPnl:number;score:number;sampleState:string;lastClosedAt:number|null;closeReasons:Record<string,number>};
type Resp={recentDays:number;totalClosedTrades:number;rows:Row[];byStrategy:Row[];binding:boolean;liveExecution:boolean};

export default function StrategyPerformancePage(){
 const [data,setData]=useState<Resp|null>(null); const [error,setError]=useState('');
 useEffect(()=>{fetch('/api/strategy-performance').then(async r=>{if(!r.ok)throw new Error(await r.text());return r.json()}).then(setData).catch(e=>setError(String(e)))},[]);
 return <main style={{minHeight:'100vh',background:'#0b0e11',color:'#eaecef',padding:24,fontFamily:'Arial, sans-serif'}}>
  <div style={{maxWidth:1400,margin:'0 auto'}}>
   <div style={{display:'flex',justifyContent:'space-between',alignItems:'end',gap:16,marginBottom:22}}>
    <div><div style={{fontSize:12,color:'#f0b90b',fontWeight:700}}>TAD · PAPER LEARNING</div><h1 style={{margin:'6px 0',fontSize:30}}>Strategy Performance Matrix</h1><div style={{color:'#848e9c'}}>Desempenho real do PAPER por estratégia × par × direção. Observacional: não libera LIVE e não promove estratégia sozinho.</div></div>
    <a href="/" style={{color:'#f0b90b',textDecoration:'none'}}>← Terminal</a>
   </div>
   {error&&<div style={{padding:16,background:'#2b171b',border:'1px solid #f6465d',borderRadius:10}}>{error}</div>}
   {!data&&!error&&<div style={{color:'#848e9c'}}>Carregando matriz...</div>}
   {data&&<>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10,marginBottom:16}}>
     <Card label="Trades fechados" value={String(data.totalClosedTrades)}/><Card label="Janela recente" value={`${data.recentDays} dias`}/><Card label="Binding" value={data.binding?'SIM':'NÃO'}/><Card label="LIVE" value={data.liveExecution?'ATIVO':'BLOQUEADO'}/>
    </div>
    <h2 style={{fontSize:18}}>Ranking global por estratégia</h2>
    <div style={{overflowX:'auto',border:'1px solid #2b3139',borderRadius:12,marginBottom:24}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}><thead><tr>{['Estratégia','Score','Amostra','Trades','Win rate','Profit factor','PnL','7d WR','7d PnL'].map(x=><th key={x} style={th}>{x}</th>)}</tr></thead><tbody>{data.byStrategy.map(r=><tr key={r.strategyId}><td style={td}>{r.strategyId}</td><td style={td}><b>{r.score}</b></td><td style={td}>{r.sampleState}</td><td style={td}>{r.trades}</td><td style={td}>{r.winRatePct.toFixed(1)}%</td><td style={td}>{r.profitFactor==null?'—':r.profitFactor.toFixed(2)}</td><td style={td}>{r.realizedPnl.toFixed(2)}</td><td style={td}>{r.recentWinRatePct.toFixed(1)}%</td><td style={td}>{r.recentPnl.toFixed(2)}</td></tr>)}</tbody></table></div>
    <h2 style={{fontSize:18}}>Estratégia × par × direção</h2>
    <div style={{overflowX:'auto',border:'1px solid #2b3139',borderRadius:12}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}><thead><tr>{['Estratégia','Par','Direção','Score','Amostra','Trades','WR','PF','PnL','Último fechamento'].map(x=><th key={x} style={th}>{x}</th>)}</tr></thead><tbody>{data.rows.slice(0,250).map((r,i)=><tr key={`${r.strategyId}-${r.symbol}-${r.side}-${i}`}><td style={td}>{r.strategyId}</td><td style={td}>{r.symbol}</td><td style={td}>{r.side}</td><td style={td}><b>{r.score}</b></td><td style={td}>{r.sampleState}</td><td style={td}>{r.trades}</td><td style={td}>{r.winRatePct.toFixed(1)}%</td><td style={td}>{r.profitFactor==null?'—':r.profitFactor.toFixed(2)}</td><td style={td}>{r.realizedPnl.toFixed(2)}</td><td style={td}>{r.lastClosedAt?new Date(r.lastClosedAt).toLocaleString('pt-BR'):'—'}</td></tr>)}</tbody></table></div>
   </>}
  </div>
 </main>
}
const th={textAlign:'left' as const,padding:'10px 12px',background:'#181a20',color:'#848e9c',borderBottom:'1px solid #2b3139'};
const td={padding:'10px 12px',borderBottom:'1px solid #1e2329'};
function Card({label,value}:{label:string;value:string}){return <div style={{background:'#181a20',border:'1px solid #2b3139',borderRadius:12,padding:14}}><div style={{fontSize:12,color:'#848e9c'}}>{label}</div><div style={{fontSize:21,fontWeight:700,marginTop:6}}>{value}</div></div>}
