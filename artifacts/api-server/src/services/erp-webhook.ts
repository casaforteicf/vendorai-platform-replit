/**
 * ERP Webhook — fire-and-forget outbound dispatcher.
 *
 * Called after a proposta is accepted or a deal is won.
 * Errors are logged but never propagate to the caller.
 */
import type { Logger } from "pino";

export interface VendaWebhookPayload {
  event: "venda_realizada";
  tenantId: string;
  vendaId: string;
  tipo: "proposta" | "deal";
  produtos: Array<{
    nome: string;
    sku: string | null;
    quantidade: number;
  }>;
  valorTotal: number | null;
  realizadaEm: string;
}

export function dispatchVendaWebhook(
  webhookUrl: string,
  payload: VendaWebhookPayload,
  logger?: Logger,
): void {
  // Fire-and-forget — do not await
  void fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  })
    .then((res) => {
      if (!res.ok) {
        logger?.warn(
          { webhookUrl, status: res.status, vendaId: payload.vendaId },
          "erp-webhook: non-2xx response",
        );
      } else {
        logger?.info(
          { webhookUrl, status: res.status, vendaId: payload.vendaId },
          "erp-webhook: dispatched",
        );
      }
    })
    .catch((err: unknown) => {
      logger?.warn(
        { webhookUrl, err, vendaId: payload.vendaId },
        "erp-webhook: dispatch failed (ignored)",
      );
    });
}
