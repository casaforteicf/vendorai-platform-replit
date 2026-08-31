'use client';

import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type Mode = 'login' | 'register' | 'recover' | 'reset';

const shell: React.CSSProperties = {minHeight:'100vh',display:'grid',placeItems:'center',padding:24,background:'#07111f',color:'#e8eef8',fontFamily:'Inter,system-ui,sans-serif'};
const card: React.CSSProperties = {width:'100%',maxWidth:460,background:'#0d1b2a',border:'1px solid #22364d',borderRadius:18,padding:28,boxShadow:'0 24px 70px rgba(0,0,0,.35)'};
const input: React.CSSProperties = {width:'100%',boxSizing:'border-box',padding:'12px 14px',borderRadius:10,border:'1px solid #304861',background:'#091522',color:'#fff',fontSize:15,outline:'none'};
const button: React.CSSProperties = {width:'100%',padding:'12px 14px',border:0,borderRadius:10,fontWeight:800,cursor:'pointer',background:'#e8eef8',color:'#07111f'};
const secondary: React.CSSProperties = {...button,background:'#13283d',color:'#e8eef8',border:'1px solid #2e4862'};
const linkBtn: React.CSSProperties = {border:0,background:'transparent',color:'#9bc4f7',cursor:'pointer',padding:0,fontSize:14};

export default function LoginPage(){
  const [mode,setMode]=useState<Mode>('login');
  const [displayName,setDisplayName]=useState('');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [confirmPassword,setConfirmPassword]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    if(params.get('recovery')==='1') setMode('reset');
    supabase.auth.getSession().then(({data})=>{
      if(data.session && params.get('recovery')!=='1') window.location.replace('/');
    });
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
      if(event==='PASSWORD_RECOVERY') setMode('reset');
      if(event==='SIGNED_IN' && session && mode!=='reset') window.location.replace('/');
    });
    return()=>subscription.unsubscribe();
  },[mode]);

  const submit=async(e:FormEvent)=>{
    e.preventDefault();
    setMessage('');
    setBusy(true);
    try{
      if(mode==='login'){
        const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
        if(error) throw error;
        setMessage('Login realizado. Abrindo o TAD...');
        window.location.replace('/');
        return;
      }
      if(mode==='register'){
        if(displayName.trim().length<2) throw new Error('Informe seu nome.');
        if(password.length<8) throw new Error('Use uma senha com pelo menos 8 caracteres.');
        if(password!==confirmPassword) throw new Error('As senhas não conferem.');
        const {data,error}=await supabase.auth.signUp({
          email:email.trim(),
          password,
          options:{data:{display_name:displayName.trim()},emailRedirectTo:`${window.location.origin}/login`}
        });
        if(error) throw error;
        if(data.session){
          window.location.replace('/');
        }else{
          setMessage('Conta criada. Confirme o e-mail recebido para ativar o acesso.');
        }
        return;
      }
      if(mode==='recover'){
        const {error}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:`${window.location.origin}/login?recovery=1`});
        if(error) throw error;
        setMessage('Enviamos um link para redefinir sua senha. Use somente o e-mail mais recente.');
        return;
      }
      if(mode==='reset'){
        if(password.length<8) throw new Error('Use uma senha com pelo menos 8 caracteres.');
        if(password!==confirmPassword) throw new Error('As senhas não conferem.');
        const {error}=await supabase.auth.updateUser({password});
        if(error) throw error;
        setMessage('Senha atualizada. Abrindo o TAD...');
        setTimeout(()=>window.location.replace('/'),700);
      }
    }catch(err:any){
      const raw=err?.message||'Não foi possível concluir a operação.';
      const friendly=raw.toLowerCase().includes('invalid login credentials')?'E-mail ou senha incorretos.':raw;
      setMessage(friendly);
    }finally{setBusy(false)}
  };

  const title=mode==='login'?'Entrar no TAD':mode==='register'?'Criar conta':mode==='recover'?'Recuperar senha':'Definir nova senha';

  return <main style={shell}>
    <section style={card}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:22}}>
        <div style={{width:42,height:42,borderRadius:12,display:'grid',placeItems:'center',fontWeight:900,background:'#e8eef8',color:'#07111f'}}>T</div>
        <div><div style={{fontWeight:900,fontSize:22}}>TAD</div><div style={{fontSize:12,opacity:.7}}>TRADING AI DECISIONS • PAPER/SHADOW</div></div>
      </div>
      <h1 style={{fontSize:26,margin:'0 0 6px'}}>{title}</h1>
      <p style={{opacity:.72,margin:'0 0 22px'}}>Sua carteira PAPER, posições, PnL e histórico ficam vinculados ao seu usuário.</p>

      <form onSubmit={submit} style={{display:'grid',gap:12}}>
        {mode==='register'&&<label style={{display:'grid',gap:6,fontSize:13}}>Nome<input style={input} value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Seu nome" autoComplete="name" required/></label>}
        {mode!=='reset'&&<label style={{display:'grid',gap:6,fontSize:13}}>E-mail<input style={input} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="voce@empresa.com" autoComplete="email" required/></label>}
        {(mode==='login'||mode==='register'||mode==='reset')&&<label style={{display:'grid',gap:6,fontSize:13}}>Senha<input style={input} type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder={mode==='login'?'Sua senha':'Mínimo de 8 caracteres'} autoComplete={mode==='login'?'current-password':'new-password'} required/></label>}
        {(mode==='register'||mode==='reset')&&<label style={{display:'grid',gap:6,fontSize:13}}>Confirmar senha<input style={input} type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="Repita a senha" autoComplete="new-password" required/></label>}
        <button style={button} disabled={busy}>{busy?'Processando...':title}</button>
      </form>

      {message&&<div style={{marginTop:14,padding:12,borderRadius:10,background:'#10263b',border:'1px solid #294968',fontSize:14,lineHeight:1.45}}>{message}</div>}

      <div style={{display:'grid',gap:10,marginTop:20,paddingTop:18,borderTop:'1px solid #22364d'}}>
        {mode!=='login'&&<button style={linkBtn} onClick={()=>{setMode('login');setMessage('')}}>Já tenho conta — entrar</button>}
        {mode==='login'&&<><button style={secondary} onClick={()=>{setMode('register');setMessage('')}} type="button">Criar nova conta</button><button style={linkBtn} onClick={()=>{setMode('recover');setMessage('')}} type="button">Esqueci minha senha</button></>}
        <a href="/" style={{textAlign:'center',color:'#9bc4f7',fontSize:14,textDecoration:'none'}}>Voltar ao Terminal público</a>
      </div>
      <div style={{marginTop:18,fontSize:12,opacity:.62,textAlign:'center'}}>LIVE permanece bloqueado. Nenhuma ordem real é enviada.</div>
    </section>
  </main>;
}
