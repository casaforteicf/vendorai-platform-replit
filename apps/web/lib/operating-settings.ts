import { getOperatingProfile, type OperatingProfileId, type TadMarketId } from '@tad/core';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ryijsscpnicjuchqvcqa.supabase.co';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_s9yVOMzsWQm4u3jxZg4i8w_CT5TQSDD';

function headers(accessToken:string, extra:Record<string,string>={}) {
  return { apikey:SUPABASE_KEY, Authorization:`Bearer ${accessToken}`, 'Content-Type':'application/json', ...extra };
}

export type OperatingSettings = {
  profile: OperatingProfileId;
  dailyTargetReferencePct: number;
  stopAfterDailyTarget: boolean;
  primaryMarket: TadMarketId;
  enabledMarkets: TadMarketId[];
  updatedAt: number;
};

export async function getOperatingSettings(accessToken:string):Promise<OperatingSettings>{
  const r=await fetch(`${SUPABASE_URL}/rest/v1/tad_operating_settings?select=*&limit=1`,{headers:headers(accessToken),cache:'no-store'});
  if(!r.ok)throw new Error(`SUPABASE_OPERATING_SETTINGS_GET_${r.status}`);
  const rows=await r.json(); const row=rows[0];
  if(!row){
    const p=getOperatingProfile('CONSERVATIVE');
    return {profile:'CONSERVATIVE',dailyTargetReferencePct:p.dailyTargetReferencePct,stopAfterDailyTarget:false,primaryMarket:'CRYPTO',enabledMarkets:['CRYPTO'],updatedAt:0};
  }
  return {
    profile: row.profile,
    dailyTargetReferencePct:Number(row.daily_target_reference_pct??getOperatingProfile(row.profile).dailyTargetReferencePct),
    stopAfterDailyTarget:Boolean(row.stop_after_daily_target),
    primaryMarket:row.primary_market,
    enabledMarkets:Array.isArray(row.enabled_markets)?row.enabled_markets:['CRYPTO'],
    updatedAt:Number(row.updated_at??0),
  };
}

export async function saveOperatingSettings(accessToken:string,settings:OperatingSettings){
  const payload={
    profile:settings.profile,
    daily_target_reference_pct:settings.dailyTargetReferencePct,
    stop_after_daily_target:settings.stopAfterDailyTarget,
    primary_market:settings.primaryMarket,
    enabled_markets:settings.enabledMarkets,
    updated_at:Date.now(),
  };
  const r=await fetch(`${SUPABASE_URL}/rest/v1/tad_operating_settings?on_conflict=user_id`,{method:'POST',headers:headers(accessToken,{Prefer:'resolution=merge-duplicates,return=representation'}),body:JSON.stringify(payload),cache:'no-store'});
  if(!r.ok)throw new Error(`SUPABASE_OPERATING_SETTINGS_SAVE_${r.status}`);
  return getOperatingSettings(accessToken);
}
