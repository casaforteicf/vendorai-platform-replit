export type StrategyLibraryStatus='ACTIVE_PAPER'|'RESEARCH'|'CANDIDATE'|'OBSERVATION'|'QUARANTINED'|'RETIRED';
export type PairClass='BTC'|'ETH'|'LARGE_CAP'|'HIGH_BETA'|'MEME'|'ALL_LIQUID';
export type StrategyFamily='TREND'|'PULLBACK'|'MOMENTUM'|'BREAKOUT'|'MEAN_REVERSION'|'VWAP'|'LIQUIDITY'|'RANGE'|'VOLATILITY'|'FIBONACCI'|'DIVERGENCE'|'SESSION'|'DERIVATIVES'|'EVENT'|'MICROSTRUCTURE';

export interface StrategyLibraryEntry{
 id:string;
 name:string;
 family:StrategyFamily;
 status:StrategyLibraryStatus;
 pairClasses:PairClass[];
 preferredRegimes:string[];
 contextHorizons:string[];
 execution:string;
 confirmations:string[];
 micro:string[];
 description:string;
}

const A=(id:string,name:string,family:StrategyFamily,pairClasses:PairClass[],preferredRegimes:string[],contextHorizons:string[],execution:string,confirmations:string[],micro:string[],description:string,status:StrategyLibraryStatus='RESEARCH'):StrategyLibraryEntry=>({id,name,family,status,pairClasses,preferredRegimes,contextHorizons,execution,confirmations,micro,description});

export const STRATEGY_LIBRARY:StrategyLibraryEntry[]=[
 A('MOMENTUM_V1','Momentum','MOMENTUM',['ALL_LIQUID'],['UP','DOWN','STRONG_UP','STRONG_DOWN'],['1d','6h','1h'],'1m',['5m','15m'],['30s','15s'],'Continuação direcional com força de preço.', 'ACTIVE_PAPER'),
 A('TREND_PULLBACK_V1','Trend Pullback','PULLBACK',['ALL_LIQUID'],['UP','DOWN','STRONG_UP','STRONG_DOWN'],['30d','15d','5d','1d','6h'],'5m',['15m','1h'],[],'Retração curta dentro de tendência multi-timeframe.', 'ACTIVE_PAPER'),
 A('VWAP_REVERSION_V1','VWAP Reversion','VWAP',['BTC','ETH','LARGE_CAP'],['RANGE'],['1d','6h','1h','15m'],'1m',['5m'],['30s','15s'],'Retorno à média após afastamento do VWAP.', 'ACTIVE_PAPER'),
 A('BREAKOUT_V1','Breakout','BREAKOUT',['ALL_LIQUID'],['UP','DOWN','STRONG_UP','STRONG_DOWN'],['15d','5d','1d','6h','1h'],'5m',['15m'],['30s'],'Rompimento confirmado de estrutura recente.', 'ACTIVE_PAPER'),
 A('EMA_RIBBON_V1','EMA Ribbon Trend','TREND',['BTC','ETH','LARGE_CAP'],['UP','DOWN','STRONG_UP','STRONG_DOWN'],['30d','5d','1d','6h'],'5m',['15m','1h'],[],'Alinhamento EMA 9/21/50 em múltiplos timeframes.', 'ACTIVE_PAPER'),
 A('RSI_REVERSAL_V1','RSI Reversal','MEAN_REVERSION',['ALL_LIQUID'],['RANGE'],['1d','6h','1h'],'1m',['5m','15m'],['30s','15s'],'Exaustão de RSI com confirmação rápida.', 'ACTIVE_PAPER'),
 A('RANGE_SCALP_V1','Range Scalp','RANGE',['BTC','ETH','LARGE_CAP'],['RANGE'],['6h','1h','15m'],'1m',['5m'],['30s','15s'],'Scalp nas extremidades de range.', 'ACTIVE_PAPER'),
 A('LIQUIDITY_SWEEP_V1','Liquidity Sweep','LIQUIDITY',['ALL_LIQUID'],['RANGE','UP','DOWN'],['5d','1d','6h','1h'],'1m',['5m','15m'],['30s','15s'],'Varredura de liquidez seguida de rejeição.', 'ACTIVE_PAPER'),

 A('TREND_PULLBACK_V2','Trend Pullback V2','PULLBACK',['BTC','ETH','LARGE_CAP'],['UP','DOWN','STRONG_UP','STRONG_DOWN'],['90d','30d','15d','5d','1d','6h'],'5m',['15m','1h'],[],'Pullback seletivo com estrutura e ATR.'),
 A('BREAKOUT_RETEST_V2','Breakout Retest V2','BREAKOUT',['ALL_LIQUID'],['UP','DOWN','STRONG_UP','STRONG_DOWN'],['30d','15d','5d','1d','6h'],'5m',['15m','1h'],['30s'],'Rompimento, reteste e confirmação antes da entrada.'),
 A('VWAP_RECLAIM_V2','VWAP Reclaim V2','VWAP',['BTC','ETH','LARGE_CAP'],['RANGE','UP','DOWN'],['15d','5d','1d','6h','1h'],'1m',['5m','15m'],['30s','15s'],'Recuperação/perda de VWAP com estrutura confirmadora.'),
 A('LIQUIDITY_SWEEP_V2','Liquidity Sweep V2','LIQUIDITY',['ALL_LIQUID'],['RANGE','UP','DOWN'],['15d','5d','1d','6h','1h'],'1m',['5m','15m'],['30s','15s'],'Sweep com wick, volume e reentrada na faixa.'),
 A('ADX_TREND_V1','ADX Trend','TREND',['BTC','ETH','LARGE_CAP'],['STRONG_UP','STRONG_DOWN'],['30d','15d','5d','1d'],'15m',['1h'],[],'Tendência filtrada por força direcional.'),
 A('SUPERTREND_PULLBACK_V1','Supertrend Pullback','PULLBACK',['ALL_LIQUID'],['UP','DOWN'],['15d','5d','1d','6h'],'5m',['15m','1h'],[],'Retração até zona de supertrend.'),
 A('DONCHIAN_BREAKOUT_V1','Donchian Breakout','BREAKOUT',['BTC','ETH','LARGE_CAP'],['STRONG_UP','STRONG_DOWN'],['30d','15d','5d','1d'],'15m',['1h'],[],'Rompimento de canal Donchian.'),
 A('BOLLINGER_SQUEEZE_V1','Bollinger Squeeze','VOLATILITY',['ALL_LIQUID'],['RANGE','UP','DOWN'],['5d','1d','6h','1h'],'5m',['15m'],['30s'],'Compressão seguida de expansão de volatilidade.'),
 A('KELTNER_BREAKOUT_V1','Keltner Breakout','VOLATILITY',['BTC','ETH','LARGE_CAP'],['UP','DOWN'],['15d','5d','1d','6h'],'5m',['15m','1h'],[],'Expansão além de canal Keltner.'),
 A('ATR_EXPANSION_V1','ATR Expansion','VOLATILITY',['HIGH_BETA','MEME','ALL_LIQUID'],['STRONG_UP','STRONG_DOWN'],['5d','1d','6h','1h'],'1m',['5m','15m'],['30s'],'Aceleração quando ATR e volume expandem.'),
 A('VOL_CONTRACTION_V1','Volatility Contraction','VOLATILITY',['BTC','ETH','LARGE_CAP'],['RANGE'],['15d','5d','1d','6h'],'5m',['15m'],[],'Preparação para saída de compressão.'),
 A('FIB_PULLBACK_382_V1','Fib Pullback 38.2','FIBONACCI',['BTC','ETH','LARGE_CAP'],['UP','DOWN'],['30d','15d','5d','1d'],'15m',['1h'],[],'Retração 38,2% em tendência.'),
 A('FIB_PULLBACK_618_V1','Fib Pullback 61.8','FIBONACCI',['BTC','ETH','LARGE_CAP'],['UP','DOWN'],['30d','15d','5d','1d'],'15m',['1h'],[],'Retração profunda 61,8% com confirmação.'),
 A('FIB_EXTENSION_V1','Fib Extension','FIBONACCI',['BTC','ETH','LARGE_CAP'],['STRONG_UP','STRONG_DOWN'],['30d','15d','5d'],'15m',['1h'],[],'Continuação por projeção de extensão.'),
 A('MACD_MOMENTUM_V1','MACD Momentum','MOMENTUM',['BTC','ETH','LARGE_CAP'],['UP','DOWN'],['15d','5d','1d','6h'],'5m',['15m','1h'],[],'Aceleração de momentum confirmada por MACD.'),
 A('MACD_ZERO_RECLAIM_V1','MACD Zero Reclaim','MOMENTUM',['BTC','ETH','LARGE_CAP'],['UP','DOWN'],['15d','5d','1d'],'15m',['1h'],[],'Retomada de tendência no eixo zero do MACD.'),
 A('RSI_DIVERGENCE_V1','RSI Divergence','DIVERGENCE',['BTC','ETH','LARGE_CAP'],['RANGE','UP','DOWN'],['5d','1d','6h','1h'],'5m',['15m'],['30s'],'Divergência preço-RSI com confirmação.'),
 A('HIDDEN_DIVERGENCE_V1','Hidden Divergence','DIVERGENCE',['BTC','ETH','LARGE_CAP'],['UP','DOWN'],['15d','5d','1d','6h'],'5m',['15m','1h'],[],'Divergência oculta de continuação.'),
 A('STOCH_REVERSAL_V1','Stochastic Reversal','MEAN_REVERSION',['BTC','ETH','LARGE_CAP'],['RANGE'],['1d','6h','1h'],'1m',['5m','15m'],['30s'],'Reversão em extremos do estocástico.'),
 A('BOLLINGER_MEAN_REVERSION_V1','Bollinger Mean Reversion','MEAN_REVERSION',['BTC','ETH','LARGE_CAP'],['RANGE'],['5d','1d','6h','1h'],'1m',['5m','15m'],['30s'],'Retorno à média após desvio estatístico.'),
 A('VWAP_BANDS_REVERSION_V1','VWAP Bands Reversion','VWAP',['BTC','ETH','LARGE_CAP'],['RANGE'],['1d','6h','1h'],'1m',['5m'],['30s','15s'],'Reversão nas bandas de desvio do VWAP.'),
 A('VWAP_TREND_CONTINUATION_V1','VWAP Trend Continuation','VWAP',['BTC','ETH','LARGE_CAP'],['UP','DOWN'],['5d','1d','6h'],'5m',['15m'],[],'Continuação quando preço sustenta VWAP direcional.'),
 A('OPEN_RANGE_BREAKOUT_V1','Open Range Breakout','SESSION',['BTC','ETH','LARGE_CAP'],['UP','DOWN'],['5d','1d','6h'],'5m',['15m'],['30s'],'Rompimento da faixa inicial de sessão.'),
 A('LONDON_BREAKOUT_V1','London Breakout','SESSION',['BTC','ETH','LARGE_CAP'],['UP','DOWN'],['5d','1d','6h'],'5m',['15m'],['30s'],'Expansão na abertura europeia.'),
 A('US_OPEN_MOMENTUM_V1','US Open Momentum','SESSION',['ALL_LIQUID'],['UP','DOWN','STRONG_UP','STRONG_DOWN'],['5d','1d','6h'],'1m',['5m','15m'],['30s','15s'],'Momentum associado à abertura americana.'),
 A('ASIA_RANGE_FADE_V1','Asia Range Fade','SESSION',['BTC','ETH','LARGE_CAP'],['RANGE'],['5d','1d','6h'],'1m',['5m'],['30s'],'Fade nas extremidades da faixa asiática.'),
 A('OVERLAP_MOMENTUM_V1','Europe-US Overlap Momentum','SESSION',['ALL_LIQUID'],['UP','DOWN'],['5d','1d','6h'],'1m',['5m','15m'],['30s'],'Momentum durante overlap Europa-EUA.'),
 A('FUNDING_CONTRARIAN_V1','Funding Contrarian','DERIVATIVES',['BTC','ETH','LARGE_CAP','HIGH_BETA'],['RANGE','UP','DOWN'],['15d','5d','1d'],'5m',['15m'],[],'Contraposição a funding extremo com confirmação técnica.'),
 A('OI_BREAKOUT_V1','Open Interest Breakout','DERIVATIVES',['BTC','ETH','LARGE_CAP'],['UP','DOWN'],['15d','5d','1d','6h'],'5m',['15m'],['30s'],'Rompimento confirmado por expansão de open interest.'),
 A('OI_DIVERGENCE_V1','Open Interest Divergence','DERIVATIVES',['BTC','ETH','LARGE_CAP'],['RANGE','UP','DOWN'],['15d','5d','1d'],'5m',['15m'],[],'Divergência entre preço e open interest.'),
 A('LONG_SHORT_EXTREME_V1','Long/Short Extreme','DERIVATIVES',['BTC','ETH','LARGE_CAP'],['RANGE'],['5d','1d','6h'],'5m',['15m'],[],'Contrarian em extremos de posicionamento.'),
 A('TAKER_IMBALANCE_V1','Taker Imbalance','MICROSTRUCTURE',['BTC','ETH','LARGE_CAP'],['UP','DOWN'],['1d','6h','1h'],'1m',['5m'],['30s','15s'],'Desequilíbrio de agressão compradora/vendedora.'),
 A('ORDERFLOW_CONTINUATION_V1','Orderflow Continuation','MICROSTRUCTURE',['BTC','ETH','LARGE_CAP'],['UP','DOWN'],['1d','6h','1h'],'1m',['5m'],['30s','15s'],'Continuação após confirmação de fluxo.'),
 A('ABSORPTION_REVERSAL_V1','Absorption Reversal','MICROSTRUCTURE',['BTC','ETH','LARGE_CAP'],['RANGE','UP','DOWN'],['1d','6h','1h'],'1m',['5m'],['30s','15s'],'Reversão após absorção em nível de liquidez.'),
 A('MICRO_BREAKOUT_V1','Micro Breakout','MICROSTRUCTURE',['HIGH_BETA','MEME','ALL_LIQUID'],['STRONG_UP','STRONG_DOWN'],['6h','1h','15m'],'1m',['5m'],['30s','15s'],'Rompimento rápido confirmado por microestrutura.'),
 A('POST_NEWS_CONTINUATION_V1','Post-News Continuation','EVENT',['BTC','ETH','LARGE_CAP'],['STRONG_UP','STRONG_DOWN'],['5d','1d','6h'],'1m',['5m','15m'],['30s'],'Continuação após estabilização pós-evento.'),
 A('POST_NEWS_MEAN_REVERSION_V1','Post-News Mean Reversion','EVENT',['BTC','ETH','LARGE_CAP'],['RANGE'],['5d','1d','6h'],'1m',['5m'],['30s'],'Reversão após excesso inicial de notícia.'),
 A('BEAR_CONTINUATION_V1','Bear Continuation','TREND',['ALL_LIQUID'],['DOWN','STRONG_DOWN'],['90d','30d','15d','5d','1d'],'5m',['15m','1h'],[],'Continuação específica para mercado estruturalmente baixista.'),
 A('BULL_CONTINUATION_V1','Bull Continuation','TREND',['ALL_LIQUID'],['UP','STRONG_UP'],['90d','30d','15d','5d','1d'],'5m',['15m','1h'],[],'Continuação específica para mercado estruturalmente altista.'),
 A('LOW_VOL_BREAKOUT_V1','Low Vol Breakout','BREAKOUT',['BTC','ETH','LARGE_CAP'],['RANGE'],['15d','5d','1d','6h'],'5m',['15m'],['30s'],'Rompimento após período prolongado de baixa volatilidade.'),
 A('HIGH_BETA_MOMENTUM_V1','High Beta Momentum','MOMENTUM',['HIGH_BETA','MEME'],['STRONG_UP','STRONG_DOWN'],['5d','1d','6h'],'1m',['5m','15m'],['30s','15s'],'Momentum para ativos de alta beta com filtros fortes de liquidez.'),
 A('MEME_LIQUIDITY_SWEEP_V1','Meme Liquidity Sweep','LIQUIDITY',['MEME'],['RANGE','UP','DOWN'],['1d','6h','1h'],'1m',['5m'],['30s','15s'],'Sweep adaptado a ativos meme, exigindo liquidez e rejeição fortes.')
];

export function classifyPair(symbol:string):PairClass[]{
 const s=symbol.toUpperCase();
 if(s==='BTCUSDT')return ['BTC','ALL_LIQUID'];
 if(s==='ETHUSDT')return ['ETH','LARGE_CAP','ALL_LIQUID'];
 const meme=['DOGEUSDT','SHIBUSDT','PEPEUSDT','BONKUSDT','WIFUSDT','FLOKIUSDT'];
 const large=['BNBUSDT','SOLUSDT','XRPUSDT','ADAUSDT','AVAXUSDT','LINKUSDT','DOTUSDT','LTCUSDT','BCHUSDT','TRXUSDT'];
 if(meme.includes(s))return ['MEME','HIGH_BETA','ALL_LIQUID'];
 if(large.includes(s))return ['LARGE_CAP','ALL_LIQUID'];
 return ['HIGH_BETA','ALL_LIQUID'];
}

export function libraryForPair(symbol:string,statuses:StrategyLibraryStatus[]=['ACTIVE_PAPER','CANDIDATE','OBSERVATION','RESEARCH']){
 const classes=classifyPair(symbol);
 return STRATEGY_LIBRARY.filter(x=>statuses.includes(x.status)&&x.pairClasses.some(p=>classes.includes(p)));
}

export function strategyLibraryEntry(id:string){return STRATEGY_LIBRARY.find(x=>x.id===id)??null;}
