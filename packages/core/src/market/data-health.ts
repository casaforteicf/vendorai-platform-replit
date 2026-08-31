import type { Candle } from '../types/index';

export type DataHealthStatus='HEALTHY'|'DEGRADED'|'CRITICAL';
export interface DataHealthInput{
  now?:number;
  marketTs?:number;
  candles?:Candle[];
  candleIntervalMs?:number;
  derivativesAvailable?:number;
  derivativesExpected?:number;
  eventProvider?:'CONFIGURED'|'UNCONFIGURED';
  restWsDivergencePct?:number;
  criticalEndpointFailure?:boolean;
}
export interface DataHealthAssessment{
  status:DataHealthStatus;
  score:number;
  allowNewEntries:boolean;
  supervisorStateFloor:'NONE'|'OBSERVE'|'STOP';
  marketAgeMs:number|null;
  candleAgeMs:number|null;
  candleGapCount:number;
  derivativesAvailabilityPct:number;
  restWsDivergencePct:number|null;
  eventProvider:'CONFIGURED'|'UNCONFIGURED'|'UNKNOWN';
  reasons:string[];
}
const clamp=(x:number,a=0,b=100)=>Math.max(a,Math.min(b,x));
export function countCandleGaps(candles:Candle[],intervalMs:number):number{
  let gaps=0;
  for(let i=1;i<candles.length;i++){
    const d=candles[i].openTime-candles[i-1].openTime;
    if(d>intervalMs*1.5)gaps+=Math.max(1,Math.round(d/intervalMs)-1);
  }
  return gaps;
}
export function evaluateDataHealth(i:DataHealthInput):DataHealthAssessment{
  const now=i.now??Date.now(), reasons:string[]=[];
  let score=100;
  const marketAgeMs=i.marketTs?Math.max(0,now-i.marketTs):null;
  const interval=i.candleIntervalMs??300_000;
  const candles=i.candles??[];
  const lastClose=candles.at(-1)?.closeTime;
  const candleAgeMs=lastClose?Math.max(0,now-lastClose):null;
  const candleGapCount=countCandleGaps(candles,interval);
  const expected=Math.max(0,i.derivativesExpected??0), available=Math.max(0,i.derivativesAvailable??expected);
  const derivativesAvailabilityPct=expected?clamp(available/expected*100):100;
  const divergence=i.restWsDivergencePct==null?null:Math.abs(i.restWsDivergencePct);
  if(i.criticalEndpointFailure){score-=100;reasons.push('CRITICAL_MARKET_ENDPOINT_FAILURE')}
  if(marketAgeMs==null){score-=35;reasons.push('MARKET_TIMESTAMP_MISSING')}
  else if(marketAgeMs>60_000){score-=60;reasons.push('MARKET_DATA_STALE_CRITICAL')}
  else if(marketAgeMs>15_000){score-=25;reasons.push('MARKET_DATA_STALE')}
  if(candleAgeMs==null){score-=45;reasons.push('CANDLE_DATA_MISSING')}
  else if(candleAgeMs>interval*3){score-=60;reasons.push('CANDLE_DATA_STALE_CRITICAL')}
  else if(candleAgeMs>interval*1.5){score-=25;reasons.push('CANDLE_DATA_STALE')}
  if(candleGapCount>=4){score-=55;reasons.push('MULTIPLE_CANDLE_GAPS')}
  else if(candleGapCount>0){score-=20;reasons.push('CANDLE_GAP_DETECTED')}
  if(derivativesAvailabilityPct<40){score-=35;reasons.push('DERIVATIVES_COVERAGE_CRITICAL')}
  else if(derivativesAvailabilityPct<70){score-=15;reasons.push('DERIVATIVES_COVERAGE_DEGRADED')}
  if(divergence!=null){
    if(divergence>.5){score-=60;reasons.push('REST_WS_DIVERGENCE_CRITICAL')}
    else if(divergence>.15){score-=25;reasons.push('REST_WS_DIVERGENCE_ELEVATED')}
  }
  if(i.eventProvider==='UNCONFIGURED')reasons.push('EVENT_FEED_UNCONFIGURED_NEUTRAL');
  score=clamp(score);
  const critical=i.criticalEndpointFailure||score<40||(marketAgeMs!=null&&marketAgeMs>60_000)||(candleAgeMs!=null&&candleAgeMs>interval*3)||(divergence!=null&&divergence>.5);
  const degraded=!critical&&(score<75||candleGapCount>0||(divergence!=null&&divergence>.15));
  const status:DataHealthStatus=critical?'CRITICAL':degraded?'DEGRADED':'HEALTHY';
  return {status,score,allowNewEntries:status!=='CRITICAL',supervisorStateFloor:status==='CRITICAL'?'STOP':status==='DEGRADED'?'OBSERVE':'NONE',marketAgeMs,candleAgeMs,candleGapCount,derivativesAvailabilityPct,restWsDivergencePct:divergence,eventProvider:i.eventProvider??'UNKNOWN',reasons};
}
