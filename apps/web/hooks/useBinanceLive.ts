'use client';
import { useEffect, useRef, useState } from 'react';

type Tick={symbol:string;bid:number;ask:number;price:number;spreadPct:number;ts:number};
export function useBinanceLive(symbols:string[]){
  const [ticks,setTicks]=useState<Record<string,Tick>>({}); const [status,setStatus]=useState<'connecting'|'live'|'offline'>('connecting'); const retry=useRef<number|undefined>(undefined);
  useEffect(()=>{
    let ws:WebSocket|undefined; let stopped=false;
    const connect=()=>{
      setStatus('connecting'); const streams=symbols.map(s=>`${s.toLowerCase()}@bookTicker`).join('/');
      ws=new WebSocket(`wss://fstream.binance.com/public/stream?streams=${streams}`);
      ws.onopen=()=>setStatus('live'); ws.onmessage=(ev)=>{try{const msg=JSON.parse(ev.data);const d=msg.data??msg;const symbol=String(d.s??'');if(!symbol)return;const bid=Number(d.b),ask=Number(d.a),price=(bid+ask)/2,spreadPct=price>0?((ask-bid)/price)*100:0;setTicks(prev=>({...prev,[symbol]:{symbol,bid,ask,price,spreadPct,ts:Date.now()}}))}catch{}};
      ws.onerror=()=>setStatus('offline'); ws.onclose=()=>{setStatus('offline');if(!stopped)retry.current=window.setTimeout(connect,2000)};
    };
    if(symbols.length)connect(); return()=>{stopped=true;if(retry.current)window.clearTimeout(retry.current);ws?.close()};
  },[symbols.join('|')]);
  return {ticks,status};
}
