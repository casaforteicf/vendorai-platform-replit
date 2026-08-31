import type { MarketSnapshot, MultiTimeframeSnapshot, StrategySignal } from '../types/index';
export function vwapReversionSignal(m:MarketSnapshot, mtf:MultiTimeframeSnapshot):StrategySignal|null {
  const f=mtf.frames['5m']; if(!f || mtf.alignment!=='MIXED' || f.atrPct<0.15) return null;
  const dev=(f.close-f.vwap)/f.vwap*100; if(Math.abs(dev)<0.35 || Math.abs(dev)>1.8) return null;
  const side=dev<0?'LONG':'SHORT'; if(side==='LONG' && f.rsi14>42) return null; if(side==='SHORT' && f.rsi14<58) return null;
  const d=Math.max(.0035,Math.min(.009,f.atrPct/100));
  return {strategyId:'VWAP_REVERSION_V1',symbol:m.symbol,side,confidence:Math.min(.86,.55+Math.abs(dev)/10+Math.abs(f.rsi14-50)/100),entry:m.price,stop:m.price*(side==='LONG'?1-d:1+d),targets:[f.vwap,m.price*(side==='LONG'?1+d*1.6:1-d*1.6)],rationale:[`VWAP dev ${dev.toFixed(2)}%`,`RSI ${f.rsi14.toFixed(1)}`,'regime MTF mixed']};
}
