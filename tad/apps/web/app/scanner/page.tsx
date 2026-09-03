'use client';
import { useEffect,useState } from 'react';
import { supabase } from '../../lib/supabase';

type Row={symbol:string;price:number;change24hPct:number;quoteVolume24h:number;spreadPct:number;fundingRate:number;regime:string;opportunityScore:number;scannerScore:number;liquidityScore:number;spreadScore:number;volatilityScore:number;fundingScore:number;volumeScore:number;intradayRangePct:number;eligible:boolean;exclusionReasons:string[]};
type Payload={total:number;eligible:number;excluded:number;rows:Row[];liveExecution:boolean};
const n=(v:number,d=2)=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
export default function ScannerPage(){
 const [data,setData]=useState<Payload|null>(null);const [error,setError]=useState('');
 useEffect(()=>{(async()=>{const {data:s}=await supabase.auth.getSession();const token=s.session?.access_token;if(!token)return setError('Faça login para consultar o scanner.');const r=await fetch('/api/market-scanner?limit=60',{headers:{authorization:`Bearer ${token}`},cache:'no-store'});const j=await r.json();if(!r.ok)return setError(j.error||'Falha ao carregar scanner');setData(j)})()},[]);
 if(error)return <main style={{minHeight:'100vh',background:'#0b0e11',color:'#eaecef',padding:24}}>{error}</main>;
 if(!data)return <main style={{minHeight:'100vh',background:'#0b0e11',color:'#eaecef',padding:24}}>Carregando scanner...</main>;
 return <main style={{minHeight:'100vh',background:'#0b0e11',color:'#eaecef',padding:24,fontFamily:'Arial,sans-serif'}}><div style={{maxWidth:1500,margin:'0 auto'}}>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'end',gap:12,flexWrap:'wrap'}}><div><div style={{fontSize:12,color:'#f0b90b',fontWeight:800}}>TAD · PAPER MARKET SCANNER</div><h1 style={{margin:'6px 0'}}>Scanner dinâmico de Futuros</h1><div style={{color:'#848e9c'}}>Contratos USDT perpetual em negociação, filtrados por liquidez, spread, funding e volatilidade. O Sweep pesado roda apenas nos melhores.</div></div><a href='/' style={{color:'#f0b90b'}}>← Terminal</a></div>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:10,margin:'18px 0'}}><K label='Universo exibido' value={data.total}/><K label='Elegíveis' value={data.eligible}/><K label='Excluídos' value={data.excluded}/><K label='LIVE' value={data.liveExecution?'ATIVO':'BLOQUEADO'}/></div>
  <div style={{overflowX:'auto',border:'1px solid #2b3139',borderRadius:10}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}><thead><tr>{['#','Par','Status','Scanner','Oportunidade','Volume 24h','Spread','Funding','Range 24h','Liquidez','Volatilidade','Regime','Motivos'].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead><tbody>{data.rows.map((r,i)=><tr key={r.symbol}><td style={td}>{i+1}</td><td style={td}><b>{r.symbol}</b></td><td style={td}><span style={{color:r.eligible?'#0ecb81':'#f6465d',fontWeight:800}}>{r.eligible?'ELEGÍVEL':'EXCLUÍDO'}</span></td><td style={td}><b>{n(r.scannerScore,0)}</b></td><td style={td}>{n(r.opportunityScore,0)}</td><td style={td}>{n(r.quoteVolume24h/1_000_000,1)}M</td><td style={td}>{n(r.spreadPct,3)}%</td><td style={td}>{n(r.fundingRate*100,4)}%</td><td style={td}>{n(r.intradayRangePct,2)}%</td><td style={td}>{n(r.liquidityScore,0)}</td><td style={td}>{n(r.volatilityScore,0)}</td><td style={td}>{r.regime}</td><td style={td}>{r.exclusionReasons.length?r.exclusionReasons.join(' · '):'—'}</td></tr>)}</tbody></table></div>
 </div></main>
}
const th={textAlign:'left' as const,padding:'10px 9px',background:'#181a20',color:'#848e9c',borderBottom:'1px solid #2b3139',whiteSpace:'nowrap' as const};
const td={padding:'9px',borderBottom:'1px solid #1e2329',whiteSpace:'nowrap' as const};
function K({label,value}:{label:string,value:any}){return <div style={{background:'#181a20',border:'1px solid #2b3139',borderRadius:8,padding:13}}><div style={{fontSize:11,color:'#848e9c'}}>{label}</div><div style={{fontSize:20,fontWeight:800,marginTop:5}}>{value}</div></div>}
