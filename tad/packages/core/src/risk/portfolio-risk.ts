import type { PaperPosition } from '../types/index';
import type { CorrelationRisk } from './correlation';
export interface PortfolioRiskSnapshot { totalRiskPct:number; grossExposure:number; marginUsed:number; correlationPenalty:number; effectiveRiskPct:number; approved:boolean; reasons:string[]; }
export function evaluatePortfolioRisk(params:{positions:PaperPosition[];accountSize:number;correlation:CorrelationRisk;maxPortfolioRiskPct?:number;maxGrossExposureMultiple?:number}):PortfolioRiskSnapshot{
 const open=params.positions.filter(p=>p.status==='OPEN'); const totalRiskPct=open.reduce((s,p)=>s+p.riskPct,0); const grossExposure=open.reduce((s,p)=>s+p.notional,0); const marginUsed=open.reduce((s,p)=>s+p.marginUsed,0);
 const effectiveRiskPct=totalRiskPct*(1+params.correlation.concentrationPenalty); const reasons:string[]=[]; const maxRisk=params.maxPortfolioRiskPct??1.2; const maxExp=params.maxGrossExposureMultiple??4;
 if(effectiveRiskPct>maxRisk)reasons.push('PORTFOLIO_RISK_LIMIT'); if(grossExposure>params.accountSize*maxExp)reasons.push('GROSS_EXPOSURE_LIMIT'); if(params.correlation.maxPairCorrelation>.9&&open.length>1)reasons.push('EXTREME_CORRELATION');
 return {totalRiskPct,grossExposure,marginUsed,correlationPenalty:params.correlation.concentrationPenalty,effectiveRiskPct,approved:reasons.length===0,reasons};
}
