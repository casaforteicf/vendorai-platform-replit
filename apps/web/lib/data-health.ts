import { evaluateDataHealth, type Candle, type DerivativesIntelligence, type MarketSnapshot } from '@tad/core';

export function derivativesCoverage(d:DerivativesIntelligence){
  const values=[d.openInterest,d.openInterestChangePct,d.globalLongShortRatio,d.topTraderLongShortRatio,d.takerBuySellRatio,d.basisRate,d.annualizedBasisRate];
  return {available:values.filter(v=>v!=null&&Number.isFinite(Number(v))).length,expected:values.length};
}
export function restWsDivergencePct(clientPrice:number|undefined,restPrice:number|undefined){
  if(!clientPrice||!restPrice||restPrice<=0)return undefined;
  return Math.abs(clientPrice/restPrice-1)*100;
}
export function assessDataHealth(input:{market?:MarketSnapshot;candles5m?:Candle[];derivatives?:DerivativesIntelligence;eventProvider?:'CONFIGURED'|'UNCONFIGURED';restPrice?:number;criticalEndpointFailure?:boolean}){
  const coverage=input.derivatives?derivativesCoverage(input.derivatives):{available:0,expected:7};
  return evaluateDataHealth({
    marketTs:input.market?.ts,
    candles:input.candles5m,
    candleIntervalMs:300_000,
    derivativesAvailable:coverage.available,
    derivativesExpected:coverage.expected,
    eventProvider:input.eventProvider,
    restWsDivergencePct:restWsDivergencePct(input.market?.price,input.restPrice),
    criticalEndpointFailure:input.criticalEndpointFailure,
  });
}
