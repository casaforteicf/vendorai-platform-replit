import type { BrainDecision, PaperCloseReason, PaperPosition, RiskResult, Side } from '../types/index';

function uid(prefix:string) {
  const rand = Math.random().toString(36).slice(2, 9).toUpperCase();
  return `${prefix}-${Date.now()}-${rand}`;
}

export function calculateQuantity(params:{accountSize:number;riskPct:number;entry:number;stop:number}) {
  const riskAmount = params.accountSize * (params.riskPct / 100);
  const stopDistance = Math.abs(params.entry - params.stop);
  if (!Number.isFinite(stopDistance) || stopDistance <= 0) throw new Error('INVALID_STOP_DISTANCE');
  const quantity = riskAmount / stopDistance;
  return { quantity, riskAmount };
}

export function unrealizedPnl(side:Side, quantity:number, entry:number, mark:number) {
  const delta = side === 'LONG' ? mark - entry : entry - mark;
  return delta * quantity;
}

export function executePaper(
  decision: BrainDecision,
  risk: RiskResult,
  options:{accountSize:number;leverage?:number}
): PaperPosition {
  if (!risk.approved) throw new Error(`Risk Gate blocked: ${risk.reasons.join(',')}`);
  const accountSize = Math.max(100, options.accountSize);
  const leverage = Math.max(1, Math.min(3, options.leverage ?? 2));
  const { quantity, riskAmount } = calculateQuantity({ accountSize, riskPct:risk.effectiveRiskPct, entry:decision.entry, stop:decision.stop });
  const notional = quantity * decision.entry;
  const now = Date.now();
  const id = uid('POS');
  return {
    id,
    orderId: uid('PAPER'),
    decisionId: decision.decisionId,
    strategyId: decision.strategyId,
    symbol: decision.symbol,
    side: decision.side,
    quantity,
    leverage,
    entry: decision.entry,
    markPrice: decision.entry,
    stop: decision.stop,
    targets: decision.targets,
    accountSize,
    riskPct: risk.effectiveRiskPct,
    riskAmount,
    notional,
    marginUsed: notional / leverage,
    unrealizedPnl: 0,
    realizedPnl: 0,
    status: 'OPEN',
    openedAt: now,
    updatedAt: now,
  };
}

export function markPaperPosition(position:PaperPosition, markPrice:number):PaperPosition {
  if (position.status === 'CLOSED') return position;
  const pnl = unrealizedPnl(position.side, position.quantity, position.entry, markPrice);
  const stopHit = position.side === 'LONG' ? markPrice <= position.stop : markPrice >= position.stop;
  const tp2 = position.targets[position.targets.length - 1];
  const tp2Hit = position.side === 'LONG' ? markPrice >= tp2 : markPrice <= tp2;
  if (stopHit) return closePaperPosition(position, markPrice, 'STOP');
  if (tp2Hit) return closePaperPosition(position, markPrice, 'TP2');
  return {...position, markPrice, unrealizedPnl:pnl, updatedAt:Date.now()};
}

export function closePaperPosition(position:PaperPosition, markPrice:number, reason:PaperCloseReason='MANUAL'):PaperPosition {
  const pnl = unrealizedPnl(position.side, position.quantity, position.entry, markPrice);
  const now = Date.now();
  return {...position, markPrice, unrealizedPnl:0, realizedPnl:pnl, status:'CLOSED', closeReason:reason, closedAt:now, updatedAt:now};
}
