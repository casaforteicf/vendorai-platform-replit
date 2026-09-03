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

type LiveControl={armed:boolean;killSwitch:boolean;lastReadinessAt?:number|null};
type LiveControlResponse={role:string|null;control:LiveControl;liveFeatureEnabled:boolean};
type LiveReadiness={
 ready:boolean;
 role:string|null;
 control:LiveControl;
 exchange?:{configured?:boolean;signedConnectivity?:boolean;productionHost?:boolean;productionExecutionAllowed?:boolean;serverTimeSkewMs?:number|null;error?:string|null};
 checks:Record<string,boolean|string[]>;
 version:string;
};

const profiles:Record<ProfileId,{label:string;target:number;risk:number;dailyLoss:number;positions:number;leverage:number;note:string}>={
 CONSERVATIVE:{label:'Conservador',target:1.6,risk:.4,dailyLoss:2,positions:3,leverage:3,note:'Configuração base do TAD.'},
 INTERMEDIATE:{label:'Intermediário',target:2.24,risk:.56,dailyLoss:2.8,positions:4,leverage:4.2,note:'+40% nos limites operacionais da base.'},
 AGGRESSIVE:{label:'Arriscado',target:3.2,risk:.8,dailyLoss:4,positions:6,leverage:6,note:'2x os limites da base. Em LIVE, todos os gates adicionais continuam obrigatórios.'},
};

const checkLabels:Record<string,string>={
 adminAuthorized:'Usuário ADMIN',persistedArmed:'LIVE armado',killSwitchClear:'Kill switch liberado',liveFeatureEnabled:'Feature LIVE habilitada',exchangeConfigured:'API Binance configurada',exchangeSignedConnectivity:'Conexão privada assinada',exchangeHostAllowed:'Host de produção permitido',exchangeClockHealthy:'Relógio Binance sincronizado',publicMarketFeedFresh:'Feed público atualizado'
};

export default function ConfiguracaoPage(){
 const [token,setToken]=useState(''); const [data,setData]=useState<SettingsResponse|null>(null); const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false); const [message,setMessage]=useState('');
 const [profile,setProfile]=useState<ProfileId>('CONSERVATIVE'); const [target,setTarget]=useState(1.6); const [primaryMarket,setPrimaryMarket]=useState<MarketId>('CRYPTO'); const [enabledMarkets,setEnabledMarkets]=useState<MarketId[]>(['CRYPTO']);
 const [liveControl,setLiveControl]=useState<LiveControlResponse|null>(null); const [readiness,setReadiness]=useState<LiveReadiness|null>(null); const [liveBusy,setLiveBusy]=useState(false);

 const authHeaders=(t=token,extra:Record<string,string>={})=>({...extra,Authorization:`Bearer ${t}`});
 const loadLive=async(t=token)=>{if(!t)return;const [cr,rr]=await Promise.all([fetch('/api/live/control',{headers:authHeaders(t),cache:'no-store'}),fetch('/api/live/readiness',{headers:authHeaders(t),cache:'no-store'})]);const [cj,rj]=await Promise.all([cr.json(),rr.json()]);if(cr.ok)setLiveControl(cj);if(rr.ok)setReadiness(rj)};

 useEffect(()=>{supabase.auth.getSession().then(async({data:s})=>{const t=s.session?.access_token||'';setToken(t);if(!t){setLoading(false);return}const [r]=await Promise.all([fetch('/api/settings',{headers:authHeaders(t),cache:'no-store'}),loadLive(t)]);const j=await r.json();if(r.ok){setData(j);setProfile(j.settings.profile);setTarget(j.settings.dailyTargetReferencePct);setPrimaryMarket(j.settings.primaryMarket);setEnabledMarkets(j.settings.enabledMarkets)}setLoading(false)})},[]);
 const selectProfile=(id:ProfileId)=>{setProfile(id);setTarget(profiles[id].target)};
 const toggleMarket=(id:MarketId)=>{setEnabledMarkets(prev=>prev.includes(id)?(prev.length===1?prev:prev.filter(x=>x!==id)):[...prev,id])};
 const save=async()=>{if(!token)return;setSaving(true);setMessage('');const r=await fetch('/api/settings',{method:'PUT',headers:authHeaders(token,{'content-type':'application/json'}),body:JSON.stringify({profile,dailyTargetReferencePct:target,primaryMarket,enabledMarkets})});const j=await r.json();setSaving(false);if(r.ok){setData(j);setMessage('Configuração salva para sua conta.')}else setMessage(j.error||'Falha ao salvar')};
 const testConnection=async()=>{if(!token)return;setLiveBusy(true);setMessage('');try{const r=await fetch('/api/live/readiness',{headers:authHeaders(),cache:'no-store'});const j=await r.json();if(r.ok){setReadiness(j);setMessage(j.ready?'Readiness LIVE aprovado. Todos os gates estão prontos.':'Teste concluído. Veja abaixo quais gates ainda estão bloqueados.')}else setMessage(j.error||'Falha no teste de conexão.')}finally{setLiveBusy(false)}};
 const setTestMode=async()=>{if(!token)return;setLiveBusy(true);setMessage('');try{const r=await fetch('/api/live/control',{method:'PUT',headers:authHeaders(token,{'content-type':'application/json'}),body:JSON.stringify({armed:false,killSwitch:true})});const j=await r.json();if(r.ok){setMessage('Modo Teste ativado: LIVE desarmado e kill switch ligado. Nenhuma ordem real pode ser enviada.');await loadLive()}else setMessage(j.error||'Falha ao ativar Modo Teste.')}finally{setLiveBusy(false)}};
 const setOperationMode=async()=>{if(!token)return;setLiveBusy(true);setMessage('');try{
   const pre=await fetch('/api/live/readiness',{headers:authHeaders(),cache:'no-store'});const pj=await pre.json() as LiveReadiness;if(!pre.ok){setMessage((pj as any).error||'Falha ao validar readiness.');return}setReadiness(pj);
   const ignored=new Set(['persistedArmed','killSwitchClear','trackedSymbols']);
   const blockers=Object.entries(pj.checks||{}).filter(([k,v])=>!ignored.has(k)&&v!==true).map(([k])=>checkLabels[k]||k);
   if(blockers.length){setMessage(`Modo Operação não liberado. Pendências: ${blockers.join(' · ')}`);return}
   if(!window.confirm('Ativar Modo Operação LIVE? Isso libera os controles para operações reais quando todos os gates de risco aprovarem. Nenhuma ordem é enviada por este botão.')){setMessage('Ativação cancelada.');return}
   const clear=await fetch('/api/live/control',{method:'PUT',headers:authHeaders(token,{'content-type':'application/json'}),body:JSON.stringify({killSwitch:false})});const clearJ=await clear.json();if(!clear.ok){setMessage(clearJ.error||'Não foi possível liberar o kill switch.');return}
   const arm=await fetch('/api/live/control',{method:'PUT',headers:authHeaders(token,{'content-type':'application/json'}),body:JSON.stringify({armed:true})});const armJ=await arm.json();if(!arm.ok){await fetch('/api/live/control',{method:'PUT',headers:authHeaders(token,{'content-type':'application/json'}),body:JSON.stringify({killSwitch:true,armed:false})}).catch(()=>undefined);setMessage(armJ.error||'Não foi possível armar LIVE. O sistema voltou ao modo seguro.');return}
   await loadLive();setMessage('Modo Operação armado. Este botão não envia ordens; cada operação ainda depende dos gates LIVE e do motor de execução.');
 }finally{setLiveBusy(false)}};

 if(loading)return <main style={{minHeight:'100vh',background:'#07111f',color:'#fff',padding:28}}>Carregando...</main>;
 if(!token)return <main style={{minHeight:'100vh',background:'#07111f',color:'#fff',padding:28}}><h1>Configuração operacional</h1><p>Entre na sua conta para configurar o TAD.</p><a href="/login" style={{color:'#9bc4f7'}}>Entrar</a></main>;
 const operationActive=!!liveControl?.control?.armed&&!liveControl?.control?.killSwitch;
 const role=liveControl?.role||readiness?.role||'—';
 return <main style={{minHeight:'100vh',background:'#07111f',color:'#e8eef8',padding:24,fontFamily:'Inter,system-ui,sans-serif'}}>
  <div style={{maxWidth:1100,margin:'0 auto'}}>
   <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',flexWrap:'wrap'}}><div><h1 style={{marginBottom:4}}>Objetivos & Operação</h1><div style={{opacity:.7}}>TAD V0.23 • PAPER/SHADOW + LIVE fail-closed</div></div><a href="/" style={{color:'#9bc4f7'}}>Voltar ao terminal</a></div>

   <section style={{marginTop:22,padding:18,border:'1px solid #36516c',borderRadius:16,background:'#0d1b2a'}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}><div><h2 style={{margin:'0 0 6px'}}>Modo de execução</h2><div style={{opacity:.7,fontSize:13}}>Escolha Teste para manter ordens reais bloqueadas ou Operação para preparar LIVE com confirmação e gates.</div></div><div style={{fontWeight:900,color:operationActive?'#7de3a7':'#8dc4ff'}}>{operationActive?'MODO OPERAÇÃO':'MODO TESTE'}</div></div>
    <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:16}}>
      <button disabled={liveBusy} onClick={setTestMode} style={{padding:'12px 16px',borderRadius:10,border:'1px solid #4b7197',background:operationActive?'#12283d':'#e8eef8',color:operationActive?'#fff':'#07111f',fontWeight:900,cursor:'pointer'}}>Modo Teste</button>
      <button disabled={liveBusy||role!=='ADMIN'} onClick={setOperationMode} style={{padding:'12px 16px',borderRadius:10,border:'1px solid #4f775f',background:operationActive?'#193625':'#12283d',color:'#fff',fontWeight:900,cursor:'pointer'}}>Modo Operação</button>
      <button disabled={liveBusy} onClick={testConnection} style={{padding:'12px 16px',borderRadius:10,border:'1px solid #35516d',background:'#12283d',color:'#fff',fontWeight:800,cursor:'pointer'}}>{liveBusy?'Verificando...':'Testar conexão Binance / Readiness'}</button>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10,marginTop:16}}>
      <div style={{padding:12,borderRadius:10,background:'#081522'}}><div style={{fontSize:12,opacity:.65}}>Papel</div><b>{role}</b></div>
      <div style={{padding:12,borderRadius:10,background:'#081522'}}><div style={{fontSize:12,opacity:.65}}>Armed</div><b>{liveControl?.control?.armed?'SIM':'NÃO'}</b></div>
      <div style={{padding:12,borderRadius:10,background:'#081522'}}><div style={{fontSize:12,opacity:.65}}>Kill switch</div><b>{liveControl?.control?.killSwitch?'LIGADO':'LIBERADO'}</b></div>
      <div style={{padding:12,borderRadius:10,background:'#081522'}}><div style={{fontSize:12,opacity:.65}}>Feature LIVE</div><b>{liveControl?.liveFeatureEnabled?'HABILITADA':'BLOQUEADA'}</b></div>
      <div style={{padding:12,borderRadius:10,background:'#081522'}}><div style={{fontSize:12,opacity:.65}}>Readiness</div><b style={{color:readiness?.ready?'#7de3a7':'#ffb36b'}}>{readiness?.ready?'PRONTO':'NÃO PRONTO'}</b></div>
    </div>
    {readiness&&<div style={{marginTop:14,display:'grid',gap:7}}>{Object.entries(readiness.checks||{}).filter(([k])=>k!=='trackedSymbols').map(([k,v])=><div key={k} style={{display:'flex',justifyContent:'space-between',gap:12,padding:'8px 10px',borderRadius:8,background:'#081522',fontSize:13}}><span>{checkLabels[k]||k}</span><b style={{color:v===true?'#7de3a7':'#ff9b9b'}}>{v===true?'OK':'BLOQUEADO'}</b></div>)}</div>}
    <p style={{marginBottom:0,fontSize:12,opacity:.65}}>O botão Modo Operação não envia ordem. Ele apenas libera os controles persistidos. A execução continua exigindo decisão recente, Risk Gate, Risk Budget, Supervisor, Data Health, quantidade válida e stop residente.</p>
   </section>

   <h2>Perfil operacional</h2>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:12}}>{(Object.keys(profiles) as ProfileId[]).map(id=>{const p=profiles[id];const active=profile===id;return <button key={id} onClick={()=>selectProfile(id)} style={{textAlign:'left',padding:18,borderRadius:14,border:`1px solid ${active?'#8dc4ff':'#28405a'}`,background:active?'#102942':'#0d1b2a',color:'#fff',cursor:'pointer'}}><b style={{fontSize:18}}>{p.label}</b><div style={{opacity:.7,margin:'6px 0 12px'}}>{p.note}</div><div>Meta ref.: {p.target.toFixed(2)}%</div><div>Risco/trade: {p.risk.toFixed(2)}%</div><div>Perda diária: {p.dailyLoss.toFixed(2)}%</div><div>Posições simultâneas: {p.positions}</div><div>Alavancagem máx.: {p.leverage}x</div><div>Trades/dia: sem teto fixo</div></button>})}</div>
   <section style={{marginTop:24,padding:18,border:'1px solid #28405a',borderRadius:14,background:'#0d1b2a'}}><h2 style={{marginTop:0}}>Objetivo diário</h2><label style={{display:'grid',gap:7,maxWidth:300}}>Meta diária de referência (%)<input type="number" min="0.1" max="20" step="0.01" value={target} onChange={e=>setTarget(Number(e.target.value))} style={{padding:11,borderRadius:9,border:'1px solid #39536e',background:'#081522',color:'#fff'}}/></label><p style={{opacity:.68}}>A meta é informativa. O motor não aumenta risco nem força entradas para alcançá-la.</p></section>
   <section style={{marginTop:24}}><h2>Mercados</h2><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12}}>{(data?.markets||[]).map(m=>{const checked=enabledMarkets.includes(m.id);return <div key={m.id} style={{padding:16,borderRadius:12,border:'1px solid #28405a',background:'#0d1b2a'}}><label style={{display:'flex',gap:9,alignItems:'center'}}><input type="checkbox" checked={checked} onChange={()=>toggleMarket(m.id)}/><b>{m.label}</b></label><div style={{marginTop:7,fontSize:12,opacity:.7}}>{m.status==='ACTIVE'?'FEED ATIVO':'PRONTO PARA CONECTAR FEED'}</div><div style={{fontSize:12,opacity:.62,marginTop:7}}>{m.symbols.join(' • ')}</div><p style={{fontSize:12,opacity:.65}}>{m.notes}</p><label style={{fontSize:12}}>Mercado principal <input type="radio" name="primary" checked={primaryMarket===m.id} onChange={()=>{setPrimaryMarket(m.id);if(!enabledMarkets.includes(m.id))setEnabledMarkets(v=>[...v,m.id])}}/></label></div>})}</div></section>
   <div style={{marginTop:24,padding:16,border:'1px solid #503d1f',background:'#211a0d',borderRadius:12}}>Somente <b>Cripto</b> está com feed real ativo neste momento. B3, EUA, Forex e Commodities já estão cadastrados na arquitetura, mas não geram sinais até seus feeds serem conectados.</div>
   <button disabled={saving} onClick={save} style={{marginTop:20,padding:'12px 18px',borderRadius:10,border:0,fontWeight:800,cursor:'pointer'}}>{saving?'Salvando...':'Salvar configuração'}</button>{message&&<div style={{marginTop:14,padding:12,border:'1px solid #3d5e7d',borderRadius:10,background:'#0d1b2a'}}>{message}</div>}
  </div>
 </main>;
}
