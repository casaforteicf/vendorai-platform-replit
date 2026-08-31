import type { BacktestTrade } from '../backtest/engine';
import type { MarketRegime, MarketSnapshot, MultiTimeframeSnapshot } from '../types/index';

export type VolatilityRegime='LOW_VOL'|'NORMAL_VOL'|'HIGH_VOL'|'EXTREME_VOL';
export type StructureRegime='TRENDING'|'RANGING'|'TRANSITION';
export type RiskTone='RISK_ON'|'NEUTRAL'|'RISK_OFF';

export interface RegimeContext {
  direction: MarketRegime;
  volatility: VolatilityRegime;
  structure: StructureRegime;
  riskTone: RiskTone;
  label: string;
  atrPct: number;
  alignmentScore: number;
}

export interface RegimeEvidence {
  label:string;
  sampleSize:number;
  wins:number;
  winRatePct:number;
  netReturnPct:number;
  avgReturnPct:number;
  profitFactor:number|null;
}

export interface RegimeGate {
  approved:boolean;
  riskMultiplier:number;
  confidence:'LOW'|'MEDIUM'|'HIGH';
  state:'FULL_CAPITAL'|'REDUCED_CAPITAL'|'NO_NEW_CAPITAL';
  reason:string;
  evidence:RegimeEvidence;
  fallbackUsed:boolean;
}

export function volatilityRegime(atrPct=0):VolatilityRegime{
  if(atrPct>=1.1)return 'EXTREME_VOL';
  if(atrPct>=.55)return 'HIGH_VOL';
  if(atrPct<=.18)return 'LOW_VOL';
  return 'NORMAL_VOL';
}

export function classifyRegimeContext(market:Pick<MarketSnapshot,'regime'|'change24hPct'>,mtf:MultiTimeframeSnapshot,fundingRate=0):RegimeContext{
  const direction=market.regime??'RANGE';
  const atrPct=mtf.frames['5m']?.atrPct??mtf.frames['15m']?.atrPct??0;
  const volatility=volatilityRegime(atrPct);
  const directional=direction!=='RANGE';
  const structure:StructureRegime=directional&&mtf.alignment!=='MIXED'&&mtf.alignmentScore>=65?'TRENDING':direction==='RANGE'&&mtf.alignment==='MIXED'?'RANGING':'TRANSITION';
  const change=market.change24hPct??0;
  const crowded=Math.abs(fundingRate)>=.0005;
  const riskTone:RiskTone=change>=1.25&&!crowded?'RISK_ON':change<=-1.25||crowded?'RISK_OFF':'NEUTRAL';
  return {direction,volatility,structure,riskTone,label:`${direction}::${volatility}::${structure}`,atrPct,alignmentScore:mtf.alignmentScore};
}

export function contextLabel(direction:MarketRegime,atrPct:number,alignment:'BULLISH'|'BEARISH'|'MIXED',alignmentScore:number):string{
  const volatility=volatilityRegime(atrPct);
  const directional=direction!=='RANGE';
  const structure:StructureRegime=directional&&alignment!=='MIXED'&&alignmentScore>=65?'TRENDING':direction==='RANGE'&&alignment==='MIXED'?'RANGING':'TRANSITION';
  return `${direction}::${volatility}::${structure}`;
}

export function evidenceFor(trades:BacktestTrade[],label:string):RegimeEvidence{
  const selected=trades.filter(t=>t.regime===label);
  const wins=selected.filter(t=>t.netReturnPct>0);
  const losses=selected.filter(t=>t.netReturnPct<=0);
  const pos=wins.reduce((a,t)=>a+t.netReturnPct,0),neg=Math.abs(losses.reduce((a,t)=>a+t.netReturnPct,0));
  const net=selected.reduce((a,t)=>a+t.netReturnPct,0);
  return {label,sampleSize:selected.length,wins:wins.length,winRatePct:selected.length?wins.length/selected.length*100:0,netReturnPct:net,avgReturnPct:selected.length?net/selected.length:0,profitFactor:neg?pos/neg:null};
}

export function evaluateRegimeGate(trades:BacktestTrade[],context:RegimeContext):RegimeGate{
  let evidence=evidenceFor(trades,context.label),fallbackUsed=false;
  if(evidence.sampleSize<5){
    const directionRows=trades.filter(t=>(t.regime??'').startsWith(`${context.direction}::`));
    if(directionRows.length>=8){
      fallbackUsed=true;
      const wins=directionRows.filter(t=>t.netReturnPct>0),losses=directionRows.filter(t=>t.netReturnPct<=0);
      const pos=wins.reduce((a,t)=>a+t.netReturnPct,0),neg=Math.abs(losses.reduce((a,t)=>a+t.netReturnPct,0)),net=directionRows.reduce((a,t)=>a+t.netReturnPct,0);
      evidence={label:`${context.direction}::*`,sampleSize:directionRows.length,wins:wins.length,winRatePct:wins.length/directionRows.length*100,netReturnPct:net,avgReturnPct:net/directionRows.length,profitFactor:neg?pos/neg:null};
    }
  }
  const n=evidence.sampleSize,pf=evidence.profitFactor??(evidence.netReturnPct>0?2:0);
  const confidence:'LOW'|'MEDIUM'|'HIGH'=n>=20?'HIGH':n>=8?'MEDIUM':'LOW';
  if(n<5)return {approved:true,riskMultiplier:.35,confidence:'LOW',state:'REDUCED_CAPITAL',reason:'REGIME_SAMPLE_INSUFFICIENT',evidence,fallbackUsed};
  if(evidence.netReturnPct<=0||pf<.8||evidence.winRatePct<32)return {approved:false,riskMultiplier:0,confidence,state:'NO_NEW_CAPITAL',reason:'REGIME_EDGE_NEGATIVE',evidence,fallbackUsed};
  if(n<8||pf<1.15||evidence.winRatePct<42)return {approved:true,riskMultiplier:.5,confidence,state:'REDUCED_CAPITAL',reason:'REGIME_EDGE_WEAK',evidence,fallbackUsed};
  if(fallbackUsed)return {approved:true,riskMultiplier:.65,confidence,state:'REDUCED_CAPITAL',reason:'DIRECTION_FALLBACK_ONLY',evidence,fallbackUsed};
  if(pf>=1.35&&evidence.netReturnPct>0&&evidence.winRatePct>=45)return {approved:true,riskMultiplier:1,confidence,state:'FULL_CAPITAL',reason:'REGIME_EDGE_CONFIRMED',evidence,fallbackUsed};
  return {approved:true,riskMultiplier:.75,confidence,state:'REDUCED_CAPITAL',reason:'REGIME_EDGE_MODERATE',evidence,fallbackUsed};
}
