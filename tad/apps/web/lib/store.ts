import type { PaperPosition } from '@tad/core';
import { getServiceUserId, isServiceRoleToken, serviceScopedApiKey, serviceScopePayload, serviceScopeQuery } from './service-scope';

type AuditRecord = { id:string; type:string; payload:unknown; ts:number };

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ryijsscpnicjuchqvcqa.supabase.co';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_s9yVOMzsWQm4u3jxZg4i8w_CT5TQSDD';

function headers(accessToken:string, extra:Record<string,string>={}) {
  return { apikey:serviceScopedApiKey(accessToken,SUPABASE_KEY), Authorization:`Bearer ${accessToken}`, 'Content-Type':'application/json', ...extra };
}
function scope(accessToken:string){ return serviceScopeQuery(accessToken); }
function scoped<T extends Record<string,unknown>>(accessToken:string,payload:T){ return serviceScopePayload(accessToken,payload); }

export function storageMode(){ return getServiceUserId()?'SUPABASE_SERVICE_SCOPED':'SUPABASE_RLS_AUTH'; }

export async function listPositions(accessToken:string):Promise<PaperPosition[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/tad_paper_positions?select=*&order=openedAt.desc${scope(accessToken)}`, {headers:headers(accessToken),cache:'no-store'});
  if (!r.ok) throw new Error(`SUPABASE_LIST_${r.status}`);
  return await r.json();
}

export async function savePosition(accessToken:string, position:PaperPosition) {
  const payload=scoped(accessToken,position as any);
  const r=await fetch(`${SUPABASE_URL}/rest/v1/tad_paper_positions?on_conflict=id`,{method:'POST',headers:headers(accessToken,{Prefer:'resolution=merge-duplicates,return=representation'}),body:JSON.stringify(payload),cache:'no-store'});
  if(!r.ok) throw new Error(`SUPABASE_SAVE_${r.status}`);
  const rows=await r.json(); return rows[0] ?? position;
}

export async function appendAudit(accessToken:string,type:string,payload:unknown) {
  const event=scoped(accessToken,{id:`AUD-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,type,payload,ts:Date.now()});
  const r=await fetch(`${SUPABASE_URL}/rest/v1/tad_audit_events`,{method:'POST',headers:headers(accessToken,{Prefer:'return=representation'}),body:JSON.stringify(event),cache:'no-store'});
  if(!r.ok) throw new Error(`SUPABASE_AUDIT_${r.status}`);
  const rows=await r.json();return rows[0]??event;
}

export async function listAudit(accessToken:string,limit=100):Promise<AuditRecord[]> {
  const r=await fetch(`${SUPABASE_URL}/rest/v1/tad_audit_events?select=*&order=ts.desc&limit=${Math.min(500,limit)}${scope(accessToken)}`,{headers:headers(accessToken),cache:'no-store'});
  if(!r.ok)throw new Error(`SUPABASE_AUDIT_LIST_${r.status}`);
  return await r.json();
}

export type AutopilotState={enabled:boolean;minimumScore:number;cooldownMinutes:number;maxNewTradesPerCycle:number;lastScanAt:number|null;lastTradeAt:Record<string,number>;lastCycleId:string|null;updatedAt:number};
const DEFAULT_AUTOPILOT:AutopilotState={enabled:false,minimumScore:70,cooldownMinutes:30,maxNewTradesPerCycle:1,lastScanAt:null,lastTradeAt:{},lastCycleId:null,updatedAt:0};

export async function getAutopilotState(accessToken:string):Promise<AutopilotState>{
  const r=await fetch(`${SUPABASE_URL}/rest/v1/tad_autopilot_state?select=*&limit=1${scope(accessToken)}`,{headers:headers(accessToken),cache:'no-store'});
  if(!r.ok)throw new Error(`SUPABASE_AUTOPILOT_GET_${r.status}`);
  const rows=await r.json(); const row=rows[0];
  return row?{enabled:Boolean(row.enabled),minimumScore:Number(row.minimumScore??70),cooldownMinutes:Number(row.cooldownMinutes??30),maxNewTradesPerCycle:Number(row.maxNewTradesPerCycle??1),lastScanAt:row.lastScanAt??null,lastTradeAt:row.lastTradeAt??{},lastCycleId:row.lastCycleId??null,updatedAt:Number(row.updatedAt??0)}:DEFAULT_AUTOPILOT;
}
export async function saveAutopilotState(accessToken:string,state:AutopilotState){
  const payload=scoped(accessToken,{...state,updatedAt:Date.now()});
  const r=await fetch(`${SUPABASE_URL}/rest/v1/tad_autopilot_state?on_conflict=user_id`,{method:'POST',headers:headers(accessToken,{Prefer:'resolution=merge-duplicates,return=representation'}),body:JSON.stringify(payload),cache:'no-store'});
  if(!r.ok)throw new Error(`SUPABASE_AUTOPILOT_SAVE_${r.status}`);
  const rows=await r.json(); return rows[0]??payload;
}
export async function findPositionByAutopilotKey(accessToken:string,key:string):Promise<PaperPosition|null>{
  const r=await fetch(`${SUPABASE_URL}/rest/v1/tad_paper_positions?select=*&autopilotKey=eq.${encodeURIComponent(key)}&limit=1${scope(accessToken)}`,{headers:headers(accessToken),cache:'no-store'});
  if(!r.ok)throw new Error(`SUPABASE_AUTOPILOT_DEDUPE_${r.status}`); const rows=await r.json(); return rows[0]??null;
}
export async function saveShadowExecution(accessToken:string,row:any){
  const payload=scoped(accessToken,row);
  const r=await fetch(`${SUPABASE_URL}/rest/v1/tad_shadow_executions?on_conflict=id`,{method:'POST',headers:headers(accessToken,{Prefer:'resolution=merge-duplicates,return=representation'}),body:JSON.stringify(payload),cache:'no-store'});
  if(!r.ok)throw new Error(`SUPABASE_SHADOW_SAVE_${r.status}`); const rows=await r.json(); return rows[0]??row;
}
export async function listShadowExecutions(accessToken:string,limit=200):Promise<any[]>{
  const r=await fetch(`${SUPABASE_URL}/rest/v1/tad_shadow_executions?select=*&order=createdAt.desc&limit=${Math.min(500,limit)}${scope(accessToken)}`,{headers:headers(accessToken),cache:'no-store'});
  if(!r.ok)throw new Error(`SUPABASE_SHADOW_LIST_${r.status}`); return await r.json();
}
export async function findShadowByPaperPosition(accessToken:string,paperPositionId:string):Promise<any|null>{
  const r=await fetch(`${SUPABASE_URL}/rest/v1/tad_shadow_executions?select=*&paperPositionId=eq.${encodeURIComponent(paperPositionId)}&order=createdAt.desc&limit=1${scope(accessToken)}`,{headers:headers(accessToken),cache:'no-store'});
  if(!r.ok)throw new Error(`SUPABASE_SHADOW_FIND_${r.status}`); const rows=await r.json(); return rows[0]??null;
}
export async function updateShadowExecution(accessToken:string,id:string,patch:any){
  const payload=scoped(accessToken,patch);
  const r=await fetch(`${SUPABASE_URL}/rest/v1/tad_shadow_executions?id=eq.${encodeURIComponent(id)}${scope(accessToken)}`,{method:'PATCH',headers:headers(accessToken,{Prefer:'return=representation'}),body:JSON.stringify(payload),cache:'no-store'});
  if(!r.ok)throw new Error(`SUPABASE_SHADOW_UPDATE_${r.status}`); const rows=await r.json(); return rows[0]??patch;
}

export type PaperWallet={depositedCapital:number;updatedAt:number};
export async function getPaperWallet(accessToken:string):Promise<PaperWallet>{
  const r=await fetch(`${SUPABASE_URL}/rest/v1/tad_paper_wallets?select=deposited_capital,updated_at&limit=1${scope(accessToken)}`,{headers:headers(accessToken),cache:'no-store'});
  if(!r.ok)throw new Error(`SUPABASE_WALLET_GET_${r.status}`);
  const rows=await r.json(); const row=rows[0];
  return {depositedCapital:Number(row?.deposited_capital??0),updatedAt:Number(row?.updated_at??0)};
}
export async function depositPaperWallet(accessToken:string,amount:number):Promise<PaperWallet>{
  if(isServiceRoleToken(accessToken))throw new Error('SERVICE_ROLE_WALLET_DEPOSIT_BLOCKED');
  const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/tad_paper_wallet_deposit`,{method:'POST',headers:headers(accessToken,{Prefer:'return=representation'}),body:JSON.stringify({p_amount:amount}),cache:'no-store'});
  if(!r.ok)throw new Error(`SUPABASE_WALLET_DEPOSIT_${r.status}`);
  const data=await r.json(); const row=Array.isArray(data)?data[0]:data;
  return {depositedCapital:Number(row?.deposited_capital??0),updatedAt:Number(row?.updated_at??Date.now())};
}
