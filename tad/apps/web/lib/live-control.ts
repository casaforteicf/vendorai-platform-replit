import 'server-only';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ryijsscpnicjuchqvcqa.supabase.co';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_s9yVOMzsWQm4u3jxZg4i8w_CT5TQSDD';

function headers(accessToken:string, extra:Record<string,string>={}) {
  return { apikey:SUPABASE_KEY, Authorization:`Bearer ${accessToken}`, 'Content-Type':'application/json', ...extra };
}

export type LiveControl = { armed:boolean; killSwitch:boolean; lastReadinessAt:number|null; updatedAt:number };

export async function getUserRole(accessToken:string):Promise<'ADMIN'|'USER'|null>{
  const r=await fetch(`${SUPABASE_URL}/rest/v1/tad_user_profiles?select=role&limit=1`,{headers:headers(accessToken),cache:'no-store'});
  if(!r.ok)throw new Error(`SUPABASE_PROFILE_GET_${r.status}`);
  const rows=await r.json(); const role=rows[0]?.role;
  return role==='ADMIN'?'ADMIN':role==='USER'?'USER':null;
}

export async function getLiveControl(accessToken:string):Promise<LiveControl>{
  const r=await fetch(`${SUPABASE_URL}/rest/v1/tad_live_controls?select=armed,kill_switch,last_readiness_at,updated_at&limit=1`,{headers:headers(accessToken),cache:'no-store'});
  if(!r.ok)throw new Error(`SUPABASE_LIVE_CONTROL_GET_${r.status}`);
  const rows=await r.json(); const row=rows[0];
  return {armed:Boolean(row?.armed),killSwitch:row?.kill_switch!==false,lastReadinessAt:row?.last_readiness_at??null,updatedAt:Number(row?.updated_at??0)};
}

export async function saveLiveControl(accessToken:string,patch:Partial<LiveControl>):Promise<LiveControl>{
  const role=await getUserRole(accessToken);
  if(role!=='ADMIN')throw new Error('ADMIN_AUTHORIZATION_REQUIRED');
  const current=await getLiveControl(accessToken);
  const payload={
    armed:patch.armed??current.armed,
    kill_switch:patch.killSwitch??current.killSwitch,
    last_readiness_at:patch.lastReadinessAt??current.lastReadinessAt,
    updated_at:Date.now(),
  };
  const r=await fetch(`${SUPABASE_URL}/rest/v1/tad_live_controls?on_conflict=user_id`,{method:'POST',headers:headers(accessToken,{Prefer:'resolution=merge-duplicates,return=representation'}),body:JSON.stringify(payload),cache:'no-store'});
  if(!r.ok)throw new Error(`SUPABASE_LIVE_CONTROL_SAVE_${r.status}`);
  return getLiveControl(accessToken);
}
