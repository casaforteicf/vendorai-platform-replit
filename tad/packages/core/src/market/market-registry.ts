export type TadMarketId = 'CRYPTO' | 'B3' | 'US' | 'FOREX' | 'COMMODITIES';
export type MarketFeedStatus = 'ACTIVE' | 'READY_FOR_FEED';

export interface TadMarketDefinition {
  id: TadMarketId;
  label: string;
  timezone: string;
  session: string;
  status: MarketFeedStatus;
  adapter: string;
  symbols: string[];
  notes: string;
}

export const TAD_MARKETS: Record<TadMarketId, TadMarketDefinition> = {
  CRYPTO: {
    id: 'CRYPTO',
    label: 'Cripto',
    timezone: 'UTC',
    session: '24x7',
    status: 'ACTIVE',
    adapter: 'BINANCE_FUTURES_PUBLIC',
    symbols: ['BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','BNBUSDT','DOGEUSDT','SUIUSDT','ADAUSDT'],
    notes: 'Feed público Binance Futures já integrado ao TAD.',
  },
  B3: {
    id: 'B3',
    label: 'B3',
    timezone: 'America/Sao_Paulo',
    session: 'Sessão B3',
    status: 'READY_FOR_FEED',
    adapter: 'B3_ADAPTER',
    symbols: ['WIN','WDO','IBOV','PETR4','VALE3'],
    notes: 'Estrutura preparada. Requer feed/corretora homologada antes de produzir sinais reais.',
  },
  US: {
    id: 'US',
    label: 'EUA',
    timezone: 'America/New_York',
    session: 'NYSE/Nasdaq',
    status: 'READY_FOR_FEED',
    adapter: 'US_MARKET_ADAPTER',
    symbols: ['SPY','QQQ','AAPL','MSFT','NVDA'],
    notes: 'Estrutura preparada para ações/ETFs dos EUA. Feed real ainda precisa ser conectado.',
  },
  FOREX: {
    id: 'FOREX',
    label: 'Forex',
    timezone: 'UTC',
    session: '24x5',
    status: 'READY_FOR_FEED',
    adapter: 'FOREX_ADAPTER',
    symbols: ['EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD'],
    notes: 'Estrutura preparada. Requer provedor de cotações confiável e definição de custos/spread por venue.',
  },
  COMMODITIES: {
    id: 'COMMODITIES',
    label: 'Commodities',
    timezone: 'America/Chicago',
    session: 'CME/COMEX/NYMEX',
    status: 'READY_FOR_FEED',
    adapter: 'COMMODITIES_ADAPTER',
    symbols: ['GC','CL','SI','ZC','ZS'],
    notes: 'Estrutura preparada para ouro, petróleo e futuros agrícolas. Feed real ainda precisa ser conectado.',
  },
};

export function getMarketDefinition(id?: string | null): TadMarketDefinition {
  if (id && id in TAD_MARKETS) return TAD_MARKETS[id as TadMarketId];
  return TAD_MARKETS.CRYPTO;
}

export function listMarkets(): TadMarketDefinition[] {
  return Object.values(TAD_MARKETS);
}
