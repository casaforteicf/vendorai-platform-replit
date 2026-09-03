import type { CandleInterval, MultiTimeframeSnapshot, Side, StrategySignal } from '../types/index';

export type TimingStyle='TREND_CONFIRMATION'|'REVERSAL_TRIGGER'|'BREAKOUT_TRIGGER'|'RANGE_TRIGGER';
export type AnalysisHorizon='90d'|'60d'|'45d'|'30d'|'15d'|'5d'|'1d'|'12h'|'6h'|'3h'|'1h'|'30m'|'15m'|'5m'|'1m'|'30s'|'15s';

export interface StrategyTimingProfile {
  strategyId:string;
  execution:CandleInterval;
  confirmations:CandleInterval[];
  context:AnalysisHorizon[];
  micro?:Array<'30s'|'15s'>;
  style:TimingStyle;
  minimumTimingScore:number;
  description:string;
}

export const STRATEGY_TIMING_PROFILES:Record<string,StrategyTimingProfile>={
  MOMENTUM_V1:{strategyId:'MOMENTUM_V1',execution:'1m',confirmations:['5m','15m'],context:['1h','6h','1d','5d'],micro:['30s','15s'],style:'TREND_CONFIRMATION',minimumTimingScore:58,description:'Momentum usa contexto amplo, confirmação 15m/5m e timing rápido em 1m.'},
  TREND_PULLBACK_V1:{strategyId:'TREND_PULLBACK_V1',execution:'5m',confirmations:['15m','1h'],context:['6h','1d','5d','15d','30d'],style:'TREND_CONFIRMATION',minimumTimingScore:62,description:'Pullback exige tendência confirmada em 1h/15m e gatilho na retração de 5m.'},
  VWAP_REVERSION_V1:{strategyId:'VWAP_REVERSION_V1',execution:'1m',confirmations:['5m'],context:['15m','1h','6h','1d'],micro:['30s','15s'],style:'REVERSAL_TRIGGER',minimumTimingScore:55,description:'Reversão à VWAP usa 5m para contexto local e 1m/microestrutura para confirmar retorno à média.'},
  BREAKOUT_V1:{strategyId:'BREAKOUT_V1',execution:'5m',confirmations:['15m'],context:['1h','6h','1d','5d','15d'],micro:['30s'],style:'BREAKOUT_TRIGGER',minimumTimingScore:60,description:'Breakout nasce na estrutura 15m/1h e usa fechamento/expansão no 5m como gatilho.'},
  EMA_RIBBON_V1:{strategyId:'EMA_RIBBON_V1',execution:'5m',confirmations:['15m','1h'],context:['6h','1d','5d','30d'],style:'TREND_CONFIRMATION',minimumTimingScore:64,description:'EMA Ribbon exige alinhamento de tendência em 1h/15m e execução no 5m.'},
  RSI_REVERSAL_V1:{strategyId:'RSI_REVERSAL_V1',execution:'1m',confirmations:['5m','15m'],context:['1h','6h','1d'],micro:['30s','15s'],style:'REVERSAL_TRIGGER',minimumTimingScore:56,description:'RSI Reversal identifica exaustão no contexto e usa 1m/microestrutura para gatilho de reversão.'},
  RANGE_SCALP_V1:{strategyId:'RANGE_SCALP_V1',execution:'1m',confirmations:['5m'],context:['15m','1h','6h'],micro:['30s','15s'],style:'RANGE_TRIGGER',minimumTimingScore:54,description:'Range Scalp depende de lateralidade no 5m/15m e entrada curta em 1m.'},
  LIQUIDITY_SWEEP_V1:{strategyId:'LIQUIDITY_SWEEP_V1',execution:'1m',confirmations:['5m','15m'],context:['1h','6h','1d','5d'],micro:['30s','15s'],style:'REVERSAL_TRIGGER',minimumTimingScore:58,description:'Liquidity Sweep usa níveis de 15m/1h e confirmação rápida após a varredura.'},
};

function aligned(structure:string|undefined,side:Side){
  return side==='LONG'?structure==='BULLISH':structure==='BEARISH';
}
function opposite(structure:string|undefined,side:Side){
  return side==='LONG'?structure==='BEARISH':structure==='BULLISH';
}

export function evaluateStrategyTiming(signal:StrategySignal,mtf:MultiTimeframeSnapshot){
  const profile=STRATEGY_TIMING_PROFILES[signal.strategyId];
  if(!profile)return {approved:true,score:50,profile:null,reasons:['TIMING_PROFILE_NOT_DEFINED'],coverage:'NONE' as const};
  const execution=mtf.frames[profile.execution];
  const confirmations=profile.confirmations.map(tf=>({tf,frame:mtf.frames[tf]}));
  const availableConfirmations=confirmations.filter(x=>Boolean(x.frame));
  const missing=[...(execution?[]:[profile.execution]),...confirmations.filter(x=>!x.frame).map(x=>x.tf)];

  let score=50;
  const reasons:string[]=[];
  if(execution){
    reasons.push(`EXECUTION_${profile.execution}`);
    if(aligned(execution.structure,signal.side)){score+=12;reasons.push('EXECUTION_STRUCTURE_ALIGNED');}
    else if(opposite(execution.structure,signal.side)&&profile.style==='TREND_CONFIRMATION'){score-=18;reasons.push('EXECUTION_STRUCTURE_OPPOSED');}
    else reasons.push('EXECUTION_STRUCTURE_NEUTRAL_OR_REVERSAL');
  }else{
    score-=4;
    reasons.push(`EXECUTION_FRAME_UNAVAILABLE:${profile.execution}`);
  }
  for(const {tf,frame} of availableConfirmations){
    if(!frame)continue;
    if(aligned(frame.structure,signal.side)){score+=10;reasons.push(`${tf}_CONFIRMS`);}
    else if(opposite(frame.structure,signal.side)){
      const penalty=profile.style==='TREND_CONFIRMATION'?14:profile.style==='BREAKOUT_TRIGGER'?10:4;
      score-=penalty;reasons.push(`${tf}_OPPOSES`);
    } else {score+=2;reasons.push(`${tf}_NEUTRAL`);}
  }
  if(mtf.alignment!=='MIXED'){
    const mtfAligned=signal.side==='LONG'?mtf.alignment==='BULLISH':mtf.alignment==='BEARISH';
    score+=mtfAligned?8:(profile.style==='TREND_CONFIRMATION'?-10:-2);
    reasons.push(mtfAligned?'MTF_ALIGNED':'MTF_NOT_ALIGNED');
  }
  if(missing.length)reasons.push(`TIMING_PARTIAL_COVERAGE:${missing.join(',')}`);
  score=Math.max(0,Math.min(100,score));
  const coverage=missing.length===0?'FULL':availableConfirmations.length>0?'PARTIAL':'LOW';
  const threshold=coverage==='FULL'?profile.minimumTimingScore:Math.max(48,profile.minimumTimingScore-8);
  return {approved:score>=threshold,score,profile,reasons,coverage};
}

export function applyStrategyTiming(signal:StrategySignal|null,mtf:MultiTimeframeSnapshot):StrategySignal|null{
  if(!signal)return null;
  const timing=evaluateStrategyTiming(signal,mtf);
  if(!timing.approved)return null;
  const multiplier=timing.coverage==='FULL'?(.82+timing.score/500):(.78+timing.score/550);
  const confidence=Math.max(.05,Math.min(.99,signal.confidence*multiplier));
  return {...signal,confidence,rationale:[...signal.rationale,`Timing ${timing.profile?.execution??'N/D'} ${timing.score}/100 (${timing.coverage})`,...(timing.profile?.confirmations?.length?[`Confirmações ${timing.profile.confirmations.join('/')}`]:[])]};
}
