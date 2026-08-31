'use client';

import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

const shell: React.CSSProperties={minHeight:'100vh',padding:24,background:'#07111f',color:'#e8eef8',fontFamily:'Inter,system-ui,sans-serif'};
const card: React.CSSProperties={maxWidth:760,margin:'40px auto',background:'#0d1b2a',border:'1px solid #22364d',borderRadius:18,padding:28};
const input: React.CSSProperties={width:'100%',boxSizing:'border-box',padding:'12px 14px',borderRadius:10,border:'1px solid #304861',background:'#091522',color:'#fff',fontSize:15};
const button: React.CSSProperties={padding:'11px 14px',border:0,borderRadius:10,fontWeight:800,cursor:'pointer',background:'#e8eef8',color:'#07111f'};

export default function AccountPage(){
  const [session,setSession]=useState<any>(null);
  const [profile,setProfile]=useState<any>(null);
  const [name,setName]=useState('');
  const [password,setPassword]=useState('');
  const [confirm,setConfirm]=useState('');
  const [message,setMessage]=useState('');
  const [ready,setReady]=useState(false);
  const [busy,setBusy]=useState(false);

  const loadProfile=async(userId:string)=>{
    const {data,error}=await supabase.from('tad_user_profiles').select('user_id,display_name,role,created_at,updated_at').eq('user_id',userId).maybeSingle();
    if(error){setMessage(error.message);return}
    setProfile(data);setName(data?.display_name||'');
  };

  useEffect(()=>{
    supabase.auth.getSession().then(async({data})=>{
      setSession(data.session);setReady(true);
      if(data.session?.user?.id) await loadProfile(data.session.user.id);
    });
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{
      setSession(next);setReady(true);
      if(!next) setProfile(null);
    });
    return()=>subscription.unsubscribe();
  },[]);

  const saveProfile=async(e:FormEvent)=>{
    e.preventDefault(); if(!session?.user?.id)return;
    setBusy(true);setMessage('');
    const {error}=await supabase.from('tad_user_profiles').update({display_name:name.trim()}).eq('user_id',session.user.id);
    if(error)setMessage(error.message);else{setMessage('Perfil atualizado.');await loadProfile(session.user.id)}
    setBusy(false);
  };

  const changePassword=async(e:FormEvent)=>{
    e.preventDefault();setMessage('');
    if(password.length<8){setMessage('Use uma senha com pelo menos 8 caracteres.');return}
    if(password!==confirm){setMessage('As senhas não conferem.');return}
    setBusy(true);
    const {error}=await supabase.auth.updateUser({password});
    if(error)setMessage(error.message);else{setPassword('');setConfirm('');setMessage('Senha alterada com sucesso.')}
    setBusy(false);
  };

  const signOut=async()=>{await supabase.auth.signOut();window.location.replace('/login')};

  if(!ready)return <main style={shell}><section style={card}>Carregando sua conta...</section></main>;
  if(!session)return <main style={shell}><section style={card}><h1>Minha conta</h1><p>Você precisa entrar para acessar esta página.</p><a href="/login" style={{color:'#9bc4f7'}}>Ir para o login</a></section></main>;

  return <main style={shell}>
    <section style={card}>
      <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',flexWrap:'wrap'}}>
        <div><div style={{fontWeight:900,fontSize:28}}>Minha Conta</div><div style={{opacity:.7}}>TAD V0.21 • PAPER/SHADOW</div></div>
        <div style={{display:'flex',gap:8}}><a href="/" style={{...button,textDecoration:'none'}}>Voltar ao TAD</a><button style={{...button,background:'#3a1620',color:'#fff'}} onClick={signOut}>Sair</button></div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12,margin:'24px 0'}}>
        <div style={{padding:16,borderRadius:12,background:'#091522',border:'1px solid #22364d'}}><small style={{opacity:.65}}>E-mail</small><div style={{fontWeight:800,marginTop:6,wordBreak:'break-all'}}>{session.user.email}</div></div>
        <div style={{padding:16,borderRadius:12,background:'#091522',border:'1px solid #22364d'}}><small style={{opacity:.65}}>Perfil</small><div style={{fontWeight:800,marginTop:6}}>{profile?.role||'USER'}</div></div>
        <div style={{padding:16,borderRadius:12,background:'#091522',border:'1px solid #22364d'}}><small style={{opacity:.65}}>Segurança</small><div style={{fontWeight:800,marginTop:6}}>Sessão persistente + RLS</div></div>
      </div>

      <form onSubmit={saveProfile} style={{display:'grid',gap:10,marginBottom:24}}>
        <h2 style={{marginBottom:4}}>Perfil</h2>
        <label style={{display:'grid',gap:6}}>Nome de exibição<input style={input} value={name} onChange={e=>setName(e.target.value)} maxLength={100}/></label>
        <div><button style={button} disabled={busy}>Salvar perfil</button></div>
      </form>

      <form onSubmit={changePassword} style={{display:'grid',gap:10}}>
        <h2 style={{marginBottom:4}}>Alterar senha</h2>
        <label style={{display:'grid',gap:6}}>Nova senha<input style={input} type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password"/></label>
        <label style={{display:'grid',gap:6}}>Confirmar nova senha<input style={input} type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password"/></label>
        <div><button style={button} disabled={busy}>Alterar senha</button></div>
      </form>

      {message&&<div style={{marginTop:18,padding:12,borderRadius:10,background:'#10263b',border:'1px solid #294968'}}>{message}</div>}
      <div style={{marginTop:24,paddingTop:18,borderTop:'1px solid #22364d',fontSize:12,opacity:.65}}>Seu perfil não pode promover a si próprio para ADMIN. LIVE permanece bloqueado e nenhuma ordem real é enviada.</div>
    </section>
  </main>;
}
