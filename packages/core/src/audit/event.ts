export interface AuditEvent {
  id: string;
  type: 'MARKET_SNAPSHOT' | 'SIGNAL' | 'BRAIN_DECISION' | 'RISK_GATE' | 'PAPER_EXECUTION';
  ts: number;
  payload: unknown;
}

export function auditEvent(type: AuditEvent['type'], payload: unknown): AuditEvent {
  return { id: crypto.randomUUID(), type, ts: Date.now(), payload };
}
