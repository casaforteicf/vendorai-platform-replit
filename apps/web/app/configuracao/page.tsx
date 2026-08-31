'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type ProfileId='CONSERVATIVE'|'INTERMEDIATE'|'AGGRESSIVE';
type MarketId='CRYPTO'|'B3'|'US'|'FOREX'|'COMMODITIES';

type SettingsResponse={
  settings:{profile:ProfileId;dailyTargetReferencePct:number;stopAfterDailyTarget:boolean;primaryMarket:MarketId;enabledMarkets:MarketId[]};
  profile:any;
  markets:Array<{id:MarketId;label:string;status:'ACTIVE'|'READY_FOR_FEED';symbols:string[];notes:string}>;
};

const profiles:Record<ProfileId,{label:string;target:number;risk:number;dailyLoss:number;positions:number;leverage:number;note:string}>={
 CONSERVATIVE:{label:'Conservador',target:1.6,risk:.4,dailyLoss:2,positions:3,leverage:3,note:'Configuração base do TAD.'},
 INTERMEDIATE:{label:'Intermediário',target:2.24,risk:.56,dailyLoss:2.8,positions:4,leverage:4.2,note:'+40% nos limites operacionais da base.'},
 AGGRESSIVE:{label:'Arriscado',target:3.2,risk:.8,dailyLoss:4,positions:6,leverage:6,note:'2x os limites da base, somente PAPER/SHADOW.'},
};

export default function ConfiguracaoPage(){
 const [token,setToken]=useState(''); const [data,setData]=useState<SettingsResponse|null>(null); const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false); const [message,setMessage]=useState('');
 const [profile,setProfile]=useState<ProfileId>('CONSERVATIVE'); const [target,setTarget]=useState(1.6); const [primaryMarket,setPrimaryMarket]=useState<MarketId>('CRYPTO'); const [enabledMarkets,setEnabledMarkets]=useState<MarketId[]>(['CRYPTO']);
 useEffect(()=>{supabase.auth.getSession().then(async({data:s})=>{const t=s.session?.access_token||'';setToken(t);if(!t){setLoading(false);return}const r=await fetch('/api/settings',{headers:{Authorization:`Bearer ${t}`},cache:'no-store'});const j=await r.json();if(r.ok){setData(j);setProfile(j.settings.profile);setTarget(j.settings.dailyTargetReferencePct);setPrimaryMarket(j.settings.primaryMarket);setEnabledMarkets(j.settings.enabledMarkets)}setLoading(false)})},[]);
 const selectProfile=(id:ProfileId)=>{setProfile(id);setTarget(profiles[id].target)};
 const toggleMarket=(id:MarketId)=>{setEnabledMarkets(prev=>prev.includes(id)?(prev.length===1?prev:prev.filter(x=>x!==id)):[...prev,id])};
 const save=async()=>{if(!token)return;setSaving(true);setMessage('');const r=await fetch('/api/settings',{method:'PUT',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({profile,dailyTargetReferencePct:target,primaryMarket,enabledMarkets})});const j=await r.json();setSaving(false);if(r.ok){setData(j);setMessage('Configuração salva para sua conta PAPER.')}else setMessage(j.error||'Falha ao salvar')};
 if(loading)return <main style={{minHeight:'100vh',background:'#07111f',color:'#fff',padding:28}}>Carregando...</main>;
 if(!token)return <main style={{minHeight:'100vh',background:'#07111f',color:'#fff',padding:28}}><h1>Configuração operacional</h1><p>Entre na sua conta para configurar o TAD.</p><a href="/login" style={{color:'#9bc4f7'}}>Entrar</a></main>;
 return <main style={{minHeight:'100vh',background:'#07111f',color:'#e8eef8',padding:24,fontFamily:'Inter,system-ui,sans-serif'}}>
  <div style={{maxWidth:1100,margin:'0 auto'}}>
   <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',flexWrap:'wrap'}}><div><h1 style={{marginBottom:4}}>Objetivos & Operação</h1><div style={{opacity:.7}}>TAD V0.22 • PAPER/SHADOW • LIVE bloqueado</div></div><a href="/" style={{color:'#9bc4f7'}}>Voltar ao terminal</a></div>
   <h2>Perfil operacional</h2>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:12}}>{(Object.keys(profiles) as ProfileId[]).map(id=>{const p=profiles[id];const active=profile===id;return <button key={id} onClick={()=>selectProfile(id)} style={{textAlign:'left',padding:18,borderRadius:14,border:`1px solid ${active?'#8dc4ff':'#28405a'}`,background:active?'#102942':'#0d1b2a',color:'#fff',cursor:'pointer'}}><b style={{fontSize:18}}>{p.label}</b><div style={{opacity:.7,margin:'6px 0 12px'}}>{p.note}</div><div>Meta ref.: {p.target.toFixed(2)}%</div><div>Risco/trade: {p.risk.toFixed(2)}%</div><div>Perda diária: {p.dailyLoss.toFixed(2)}%</div><div>Posições simultâneas: {p.positions}</div><div>Alavancagem máx.: {p.leverage}x</div><div>Trades/dia: sem teto fixo</div></button>})}</div>
   <section style={{marginTop:24,padding:18,border:'1px solid #28405a',borderRadius:14,background:'#0d1b2a'}}><h2 style={{marginTop:0}}>Objetivo diário</h2><label style={{display:'grid',gap:7,maxWidth:300}}>Meta diária de referência (%)<input type="number" min="0.1" max="20" step="0.01" value={target} onChange={e=>setTarget(Number(e.target.value))} style={{padding:11,borderRadius:9,border:'1px solid #39536e',background:'#081522',color:'#fff'}}/></label><p style={{opacity:.68}}>A meta é informativa. O motor não aumenta risco nem força entradas para alcançá-la.</p></section>
   <section style={{marginTop:24}}><h2>Mercados</h2><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12}}>{(data?.markets||[]).map(m=>{const checked=enabledMarkets.includes(m.id);return <div key={m.id} style={{padding:16,borderRadius:12,border:'1px solid #28405a',background:'#0d1b2a'}}><label style={{display:'flex',gap:9,alignItems:'center'}}><input type="checkbox" checked={checked} onChange={()=>toggleMarket(m.id)}/><b>{m.label}</b></label><div style={{marginTop:7,fontSize:12,opacity:.7}}>{m.status==='ACTIVE'?'FEED ATIVO':'PRONTO PARA CONECTAR FEED'}</div><div style={{fontSize:12,opacity:.62,marginTop:7}}>{m.symbols.join(' • ')}</div><p style={{fontSize:12,opacity:.65}}>{m.notes}</p><label style={{fontSize:12}}>Mercado principal <input type="radio" name="primary" checked={primaryMarket===m.id} onChange={()=>{setPrimaryMarket(m.id);if(!enabledMarkets.includes(m.id))setEnabledMarkets(v=>[...v,m.id])}}/></label></div>})}</div></section>
   <div style={{marginTop:24,padding:16,border:'1px solid #503d1f',background:'#211a0d',borderRadius:12}}>Somente <b>Cripto</b> está com feed real ativo neste momento. B3, EUA, Forex e Commodities já estão cadastrados na arquitetura, mas não geram sinais até seus feeds serem conectados.</div>
   <button disabled={saving} onClick={save} style={{marginTop:20,padding:'12px 18px',borderRadius:10,border:0,fontWeight:800,cursor:'pointer'}}>{saving?'Salvando...':'Salvar configuração'}</button>{message&&<span style={{marginLeft:12}}>{message}</span>}
  </div>
 </main>;
}
