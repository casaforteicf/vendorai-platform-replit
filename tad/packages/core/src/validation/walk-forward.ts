import type { BacktestResult } from '../backtest/engine';
export interface WalkForwardWindow { index:number; trainStart:number; trainEnd:number; testStart:number; testEnd:number; trainScore:number; testScore:number; degradationPct:number; passed:boolean; }
export interface WalkForwardSummary { windows:WalkForwardWindow[]; passRatePct:number; avgDegradationPct:number; robust:boolean; }
export function runWalkForward(params:{length:number;trainSize?:number;testSize?:number;evaluate:(start:number,end:number)=>BacktestResult}):WalkForwardSummary{
 const train=params.trainSize??360,test=params.testSize??120,windows:WalkForwardWindow[]=[]; let idx=0;
 for(let start=0;start+train+test<=params.length;start+=test){const tr=params.evaluate(start,start+train),te=params.evaluate(start+train,start+train+test);const a=tr.summary.netReturnPct,b=te.summary.netReturnPct;const degradationPct=a===0?0:((a-b)/Math.abs(a))*100;const passed=te.summary.trades>=2&&b>0&&te.summary.maxDrawdownPct<15;windows.push({index:idx++,trainStart:start,trainEnd:start+train,testStart:start+train,testEnd:start+train+test,trainScore:a,testScore:b,degradationPct,passed});}
 const passRatePct=windows.length?windows.filter(w=>w.passed).length/windows.length*100:0;const avgDegradationPct=windows.length?windows.reduce((s,w)=>s+w.degradationPct,0)/windows.length:0;return {windows,passRatePct,avgDegradationPct,robust:windows.length>=2&&passRatePct>=60};
}
