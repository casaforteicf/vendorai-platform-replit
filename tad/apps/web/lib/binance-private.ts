import 'server-only';
import { createHmac } from 'node:crypto';

export type BinanceOrderSide = 'BUY' | 'SELL';
export type BinanceOrderType = 'MARKET' | 'LIMIT';

export type BinanceOrderRequest = {
  symbol: string;
  side: BinanceOrderSide;
  type: BinanceOrderType;
  quantity: number;
  newClientOrderId: string;
  reduceOnly?: boolean;
  price?: number;
  timeInForce?: 'GTC' | 'IOC' | 'FOK' | 'GTX';
};

export type ProtectedEntryRequest = {
  symbol: string;
  side: BinanceOrderSide;
  quantity: number;
  entryClientOrderId: string;
  stopClientAlgoId: string;
  emergencyClientOrderId: string;
  stopPrice: number;
};

export type BinancePrivateReadiness = {
  configured: boolean;
  baseUrl: string | null;
  productionHost: boolean;
  productionExecutionAllowed: boolean;
  signedConnectivity: boolean;
  serverTimeSkewMs: number | null;
  error: string | null;
};

const PROD_BASE = 'https://fapi.binance.com';

function config() {
  const baseUrl = (process.env.BINANCE_FUTURES_PRIVATE_BASE_URL || '').replace(/\/$/, '');
  const apiKey = process.env.BINANCE_FUTURES_API_KEY || '';
  const apiSecret = process.env.BINANCE_FUTURES_API_SECRET || '';
  const productionHost = baseUrl === PROD_BASE;
  const productionExecutionAllowed = process.env.TAD_ALLOW_PRODUCTION_EXCHANGE === 'true';
  return { baseUrl, apiKey, apiSecret, productionHost, productionExecutionAllowed };
}

function assertConfigured() {
  const c = config();
  if (!c.baseUrl || !c.apiKey || !c.apiSecret) throw new Error('BINANCE_PRIVATE_NOT_CONFIGURED');
  return c;
}

function assertExecutionHostAllowed() {
  const c = assertConfigured();
  if (c.productionHost && !c.productionExecutionAllowed) throw new Error('BINANCE_PRODUCTION_EXECUTION_BLOCKED');
  return c;
}

function encode(params: Record<string, string | number | boolean | undefined>) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined) q.set(key, String(value));
  return q;
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store' });
  const text = await response.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) {
    const code = data?.code != null ? String(data.code) : String(response.status);
    const message = data?.msg || data?.message || 'BINANCE_REQUEST_FAILED';
    throw new Error(`BINANCE_${code}:${message}`);
  }
  return data as T;
}

async function signedRequest<T>(method: 'GET' | 'POST' | 'DELETE', path: string, params: Record<string, string | number | boolean | undefined> = {}, execution = false): Promise<T> {
  const c = execution ? assertExecutionHostAllowed() : assertConfigured();
  const q = encode({ ...params, timestamp: Date.now(), recvWindow: 5000 });
  const signature = createHmac('sha256', c.apiSecret).update(q.toString()).digest('hex');
  q.set('signature', signature);
  const headers = { 'X-MBX-APIKEY': c.apiKey, 'Content-Type': 'application/x-www-form-urlencoded' };
  if (method === 'GET' || method === 'DELETE') return requestJson<T>(`${c.baseUrl}${path}?${q.toString()}`, { method, headers });
  return requestJson<T>(`${c.baseUrl}${path}`, { method, headers, body: q.toString() });
}

export async function getBinanceServerTime(): Promise<number> {
  const c = assertConfigured();
  const result = await requestJson<{ serverTime: number }>(`${c.baseUrl}/fapi/v1/time`, { method: 'GET' });
  return Number(result.serverTime);
}

export async function getPrivateAccountV3(): Promise<unknown> { return signedRequest('GET', '/fapi/v3/account'); }
export async function getPositionRiskV3(symbol?: string): Promise<unknown> { return signedRequest('GET', '/fapi/v3/positionRisk', symbol ? { symbol } : {}); }

export async function queryOrderByClientId(symbol: string, clientOrderId: string): Promise<any | null> {
  try { return await signedRequest<any>('GET', '/fapi/v1/order', { symbol, origClientOrderId: clientOrderId }); }
  catch (error) { if (String(error).includes('BINANCE_-2013:')) return null; throw error; }
}

export async function placeIdempotentOrder(order: BinanceOrderRequest): Promise<{ idempotentReplay: boolean; order: any }> {
  if (!/^[.A-Z:/a-z0-9_-]{1,36}$/.test(order.newClientOrderId)) throw new Error('INVALID_CLIENT_ORDER_ID');
  if (!Number.isFinite(order.quantity) || order.quantity <= 0) throw new Error('INVALID_QUANTITY');
  const existing = await queryOrderByClientId(order.symbol, order.newClientOrderId);
  if (existing) return { idempotentReplay: true, order: existing };
  const params: Record<string, string | number | boolean | undefined> = {
    symbol: order.symbol, side: order.side, type: order.type, quantity: order.quantity,
    newClientOrderId: order.newClientOrderId, reduceOnly: order.reduceOnly, price: order.price,
    timeInForce: order.type === 'LIMIT' ? (order.timeInForce || 'GTC') : undefined, newOrderRespType: 'RESULT',
  };
  try {
    const created = await signedRequest<any>('POST', '/fapi/v1/order', params, true);
    return { idempotentReplay: false, order: created };
  } catch (error) {
    const reconciled = await queryOrderByClientId(order.symbol, order.newClientOrderId).catch(() => null);
    if (reconciled) return { idempotentReplay: true, order: reconciled };
    throw error;
  }
}

export async function queryAlgoOrder(clientAlgoId: string): Promise<any | null> {
  try { return await signedRequest<any>('GET', '/fapi/v1/algoOrder', { clientAlgoId }); }
  catch (error) { if (String(error).includes('BINANCE_-2013:') || String(error).includes('BINANCE_-2011:')) return null; throw error; }
}

export async function placeProtectiveStop(input: { symbol:string; side:BinanceOrderSide; quantity:number; triggerPrice:number; clientAlgoId:string }): Promise<{idempotentReplay:boolean;order:any}> {
  if (!/^[.A-Z:/a-z0-9_-]{1,36}$/.test(input.clientAlgoId)) throw new Error('INVALID_CLIENT_ALGO_ID');
  if (!Number.isFinite(input.triggerPrice) || input.triggerPrice <= 0) throw new Error('INVALID_STOP_PRICE');
  const existing = await queryAlgoOrder(input.clientAlgoId);
  if (existing) return {idempotentReplay:true,order:existing};
  const order = await signedRequest<any>('POST','/fapi/v1/algoOrder',{
    algoType:'CONDITIONAL',symbol:input.symbol,side:input.side,type:'STOP_MARKET',quantity:input.quantity,
    triggerPrice:input.triggerPrice,workingType:'MARK_PRICE',reduceOnly:true,clientAlgoId:input.clientAlgoId,newOrderRespType:'RESULT'
  },true);
  return {idempotentReplay:false,order};
}

export async function executeProtectedEntry(input: ProtectedEntryRequest): Promise<{entry:any;stop:any;emergencyFlattened:boolean}> {
  if (!Number.isFinite(input.stopPrice) || input.stopPrice <= 0) throw new Error('INVALID_STOP_PRICE');
  const entry = await placeIdempotentOrder({symbol:input.symbol,side:input.side,type:'MARKET',quantity:input.quantity,newClientOrderId:input.entryClientOrderId});
  const executedQty = Number(entry.order?.executedQty || input.quantity);
  const stopSide:BinanceOrderSide = input.side === 'BUY' ? 'SELL' : 'BUY';
  try {
    const stop = await placeProtectiveStop({symbol:input.symbol,side:stopSide,quantity:executedQty,triggerPrice:input.stopPrice,clientAlgoId:input.stopClientAlgoId});
    return {entry:entry.order,stop:stop.order,emergencyFlattened:false};
  } catch (stopError) {
    await placeIdempotentOrder({symbol:input.symbol,side:stopSide,type:'MARKET',quantity:executedQty,newClientOrderId:input.emergencyClientOrderId,reduceOnly:true});
    throw new Error(`PROTECTIVE_STOP_FAILED_POSITION_FLATTENED:${String(stopError).slice(0,160)}`);
  }
}

export async function cancelOrderByClientId(symbol: string, clientOrderId: string): Promise<any> { return signedRequest<any>('DELETE', '/fapi/v1/order', { symbol, origClientOrderId: clientOrderId }, true); }

export async function startUserDataStream(): Promise<{ listenKey: string }> {
  const c = assertConfigured();
  return requestJson<{ listenKey: string }>(`${c.baseUrl}/fapi/v1/listenKey`, { method: 'POST', headers: { 'X-MBX-APIKEY': c.apiKey } });
}
export async function keepAliveUserDataStream(): Promise<{ listenKey?: string }> {
  const c = assertConfigured();
  return requestJson<{ listenKey?: string }>(`${c.baseUrl}/fapi/v1/listenKey`, { method: 'PUT', headers: { 'X-MBX-APIKEY': c.apiKey } });
}

export async function privateReadiness(): Promise<BinancePrivateReadiness> {
  const c = config();
  if (!c.baseUrl || !c.apiKey || !c.apiSecret) return { configured: false, baseUrl: c.baseUrl || null, productionHost: c.productionHost, productionExecutionAllowed: c.productionExecutionAllowed, signedConnectivity: false, serverTimeSkewMs: null, error: 'BINANCE_PRIVATE_NOT_CONFIGURED' };
  try {
    const serverTime = await getBinanceServerTime(); await getPrivateAccountV3();
    return { configured: true, baseUrl: c.baseUrl, productionHost: c.productionHost, productionExecutionAllowed: c.productionExecutionAllowed, signedConnectivity: true, serverTimeSkewMs: Math.abs(Date.now() - serverTime), error: null };
  } catch (error) {
    return { configured: true, baseUrl: c.baseUrl, productionHost: c.productionHost, productionExecutionAllowed: c.productionExecutionAllowed, signedConnectivity: false, serverTimeSkewMs: null, error: String(error).slice(0, 180) };
  }
}
