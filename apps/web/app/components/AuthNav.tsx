'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

const pill:React.CSSProperties={padding:'9px 12px',borderRadius:999,background:'#13283d',border:'1px solid #36516c',color:'#fff',textDecoration:'none',font:'700 12px Inter,system-ui,sans-serif'};

export default function AuthNav(){
  const [session,setSession]=useState<any>(null);
  const [ready,setReady]=useState(false);
  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{setSession(data.session);setReady(true)});
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{setSession(next);setReady(true)});
    return()=>subscription.unsubscribe();
  },[]);
  if(!ready)return null;
  return <div style={{position:'fixed',right:14,bottom:14,zIndex:1000,display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',justifyContent:'flex-end'}}>
    {session?<><a href="/configuracao" style={pill}>Objetivos & Operação</a><a href="/conta" style={pill}>Minha Conta</a></>:<a href="/login" style={{...pill,background:'#e8eef8',color:'#07111f',fontWeight:800}}>Entrar / Criar conta</a>}
  </div>;
}
