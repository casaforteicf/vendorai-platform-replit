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

function hit(side:Side, price:number, level:number, direction:'PROFIT'|'STOP') {
  if (direction === 'PROFIT') return side === 'LONG' ? price >= level : price <= level;
  return side === 'LONG' ? price <= level : price >= level;
}

function stopCloseReason(position:PaperPosition):PaperCloseReason {
  const eps=Math.max(Math.abs(position.entry)*1e-8,1e-10);
  if (Math.abs(position.stop-position.entry)<=eps) return 'BREAK_EVEN';
  const profitableStop=position.side==='LONG'?position.stop>position.entry:position.stop<position.entry;
  return profitableStop?'TRAILING_STOP':'STOP';
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

  const originalQuantity=position.entry>0?position.notional/position.entry:position.quantity;
  const hasPartial=position.quantity < originalQuantity*0.75;
  const targets=position.targets||[];
  const firstTarget=targets[0];
  const finalTarget=targets[targets.length-1];

  const stopHit=hit(position.side,markPrice,position.stop,'STOP');
  if(stopHit)return closePaperPosition(position,position.stop,stopCloseReason(position));

  const firstHit=firstTarget!=null&&hit(position.side,markPrice,firstTarget,'PROFIT');
  const finalHit=finalTarget!=null&&hit(position.side,markPrice,finalTarget,'PROFIT');

  if(finalHit){
    if(!hasPartial&&targets.length>1){
      const partialQty=originalQuantity*.5;
      const remainingQty=Math.max(0,position.quantity-partialQty);
      const partialPnl=unrealizedPnl(position.side,partialQty,position.entry,firstTarget);
      const finalPnl=unrealizedPnl(position.side,remainingQty,position.entry,finalTarget);
      const now=Date.now();
      return {...position,quantity:remainingQty,markPrice:finalTarget,unrealizedPnl:0,realizedPnl:position.realizedPnl+partialPnl+finalPnl,status:'CLOSED',closeReason:'TP2',closedAt:now,updatedAt:now,marginUsed:0};
    }
    return closePaperPosition(position,finalTarget,'TP2');
  }

  if(firstHit&&!hasPartial&&targets.length>1){
    const partialQty=originalQuantity*.5;
    const remainingQty=Math.max(0,position.quantity-partialQty);
    const partialPnl=unrealizedPnl(position.side,partialQty,position.entry,firstTarget);
    const pnl=unrealizedPnl(position.side,remainingQty,position.entry,markPrice);
    return {...position,quantity:remainingQty,markPrice,stop:position.entry,marginUsed:(remainingQty*position.entry)/position.leverage,unrealizedPnl:pnl,realizedPnl:position.realizedPnl+partialPnl,updatedAt:Date.now()};
  }

  let nextStop=position.stop;
  if(hasPartial){
    const baseDistance=Math.max(Math.abs((firstTarget??position.entry)-position.entry)*.5,Math.abs(position.entry)*.001);
    const candidate=position.side==='LONG'?markPrice-baseDistance:markPrice+baseDistance;
    nextStop=position.side==='LONG'?Math.max(position.stop,position.entry,candidate):Math.min(position.stop,position.entry,candidate);
  }

  const pnl=unrealizedPnl(position.side,position.quantity,position.entry,markPrice);
  return {...position,markPrice,stop:nextStop,unrealizedPnl:pnl,updatedAt:Date.now()};
}

export function closePaperPosition(position:PaperPosition, markPrice:number, reason:PaperCloseReason='MANUAL'):PaperPosition {
  const pnl = unrealizedPnl(position.side, position.quantity, position.entry, markPrice);
  const now = Date.now();
  return {...position, markPrice, marginUsed:0, unrealizedPnl:0, realizedPnl:position.realizedPnl+pnl, status:'CLOSED', closeReason:reason, closedAt:now, updatedAt:now};
}
