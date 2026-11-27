import { logger } from "../lib/logger.js";

/**
 * Evento de funil do Marketing. Formato estável (log estruturado) para ser
 * consumido por painel/ETL sem acoplar a uma tabela nova nesta etapa.
 */
export type MarketingFunnelEvent =
  | "piece.released"
  | "piece.approved"
  | "piece.rejected"
  | "piece.production_requested"
  | "piece.production_completed"
  | "piece.production_failed"
  | "publication.published"
  | "publication.failed";

export type MarketingFunnelProps = Record<string, unknown> & {
  tenantId: string;
  pieceId?: string;
  publicationId?: string;
  tipo?: string;
  canal?: string;
  provider?: string;
  media?: string;
  reasonCode?: string;
};

export function emitMarketingFunnelEvent(event: MarketingFunnelEvent, props: MarketingFunnelProps) {
  const payload = {
    ...props,
    event: `marketing.${event}`,
    ts: new Date().toISOString(),
  };
  logger.info(payload, `marketing.${event}`);
  return payload;
}
