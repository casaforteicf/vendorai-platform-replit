import type { MarketSnapshot, RiskResult } from '../types/index';
import type { SupervisorDecision } from '../supervisor/supervisor';

export interface LiveExecutionGateInput {
  liveFeatureEnabled: boolean;
  liveEnvironmentArmed: boolean;
  killSwitchActive: boolean;
  authenticated: boolean;
  adminAuthorized: boolean;
  exchangeCredentialsConfigured: boolean;
  exchangePrivateConnectivity: boolean;
  market: MarketSnapshot;
  allowedSymbols: readonly string[];
  maxMarketAgeMs: number;
  risk: RiskResult;
  riskBudgetApproved: boolean;
  robustnessApproved: boolean;
  dataHealthStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  supervisor: SupervisorDecision;
  stopProtected: boolean;
  idempotencyKey: string | null;
  now?: number;
}

export interface LiveExecutionGateResult {
  approved: boolean;
  reasons: string[];
  checkedAt: number;
}

export function evaluateLiveExecutionGate(input: LiveExecutionGateInput): LiveExecutionGateResult {
  const reasons: string[] = [];
  const now = input.now ?? Date.now();

  if (!input.liveFeatureEnabled) reasons.push('LIVE_FEATURE_DISABLED');
  if (!input.liveEnvironmentArmed) reasons.push('LIVE_ENVIRONMENT_NOT_ARMED');
  if (input.killSwitchActive) reasons.push('KILL_SWITCH_ACTIVE');
  if (!input.authenticated) reasons.push('AUTH_REQUIRED');
  if (!input.adminAuthorized) reasons.push('ADMIN_AUTHORIZATION_REQUIRED');
  if (!input.exchangeCredentialsConfigured) reasons.push('EXCHANGE_CREDENTIALS_MISSING');
  if (!input.exchangePrivateConnectivity) reasons.push('EXCHANGE_PRIVATE_CONNECTIVITY_FAILED');
  if (!input.allowedSymbols.includes(input.market.symbol)) reasons.push('SYMBOL_NOT_ALLOWED');
  if (!Number.isFinite(input.market.ts) || now - input.market.ts > input.maxMarketAgeMs) reasons.push('STALE_MARKET_DATA');
  if (!Number.isFinite(input.market.price) || input.market.price <= 0) reasons.push('INVALID_MARKET_PRICE');
  if (!input.risk.approved) reasons.push('TRADE_RISK_REJECTED');
  if (!input.riskBudgetApproved) reasons.push('RISK_BUDGET_REJECTED');
  if (!input.robustnessApproved) reasons.push('ROBUSTNESS_REJECTED');
  if (input.dataHealthStatus !== 'HEALTHY') reasons.push('DATA_HEALTH_NOT_HEALTHY');
  if (input.supervisor.state !== 'OPERATE' && input.supervisor.state !== 'REDUCE_RISK') reasons.push('SUPERVISOR_BLOCKED');
  if (input.supervisor.riskMultiplier <= 0) reasons.push('SUPERVISOR_ZERO_RISK');
  if (!input.stopProtected) reasons.push('EXCHANGE_STOP_REQUIRED');
  if (!input.idempotencyKey || !/^[.A-Z:/a-z0-9_-]{1,36}$/.test(input.idempotencyKey)) reasons.push('INVALID_IDEMPOTENCY_KEY');

  return { approved: reasons.length === 0, reasons, checkedAt: now };
}
