import type { PaperPosition, PortfolioSummary } from '../types/index';

export function summarizePortfolio(positions:PaperPosition[], startingBalance:number):PortfolioSummary {
  const open = positions.filter(p=>p.status==='OPEN');
  const closed = positions.filter(p=>p.status==='CLOSED');
  const realizedPnl = positions.reduce((s,p)=>s+p.realizedPnl,0);
  const unrealizedPnl = open.reduce((s,p)=>s+p.unrealizedPnl,0);
  const wins = closed.filter(p=>p.realizedPnl>0).length;
  return {
    startingBalance,
    realizedPnl,
    unrealizedPnl,
    equity: startingBalance + realizedPnl + unrealizedPnl,
    openPositions: open.length,
    closedPositions: closed.length,
    winRatePct: closed.length ? (wins/closed.length)*100 : 0,
    grossExposure: open.reduce((s,p)=>s+p.quantity*p.markPrice,0),
  };
}
