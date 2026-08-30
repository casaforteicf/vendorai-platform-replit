import type { Logger } from "pino";
import { vendorPool } from "../lib/vendorDb";
import { sendOutgoingMessage } from "../services/omnichannel";

type ReviewRequest = {
  id: string;
  tenant_id: string;
  cliente_id: string | null;
  cliente_nome: string | null;
  product_name: string;
  token: string;
  status: "agendada" | "enviada" | "lembrada";
};

export async function runReviewRequests(log: Logger): Promise<void> {
  const publicBaseUrl = process.env.PRACA_PUBLIC_URL;
  if (!publicBaseUrl) {
    log.warn("review-requests: PRACA_PUBLIC_URL não configurada; envios pausados");
    return;
  }

  const due = await vendorPool.query<ReviewRequest>(
    `SELECT s.id, s.tenant_id, s.cliente_id, s.cliente_nome, s.token, s.status,
            p.nome AS product_name
       FROM praca_avaliacao_solicitacoes s
       JOIN produtos_catalogo p ON p.id=s.product_id AND p.tenant_id=s.tenant_id
      WHERE (
        (s.status='agendada' AND s.solicitar_em <= now())
        OR
        (s.status='enviada' AND s.enviada_em <= now() - interval '3 days')
      )
      ORDER BY s.solicitar_em
      LIMIT 100`,
  );

  for (const request of due.rows) {
    if (!request.cliente_id) {
      log.warn({ requestId: request.id }, "review-requests: cliente_id ausente; aguardando identificação");
      continue;
    }

    const isReminder = request.status === "enviada";
    const link = `${publicBaseUrl.replace(/\/$/, "")}/avaliar/${request.token}`;
    const greeting = request.cliente_nome ? `Olá, ${request.cliente_nome}!` : "Olá!";
    const conteudo = isReminder
      ? `${greeting} Este é um lembrete único para avaliar ${request.product_name}: ${link}`
      : `${greeting} Seu produto ${request.product_name} foi entregue. Conte como foi sua experiência, dê uma nota de 1 a 10 e envie fotos: ${link}`;

    try {
      await sendOutgoingMessage(
        {
          tenantId: request.tenant_id,
          leadId: request.cliente_id,
          conteudo,
          canal: "whatsapp",
          agentName: "Pós-venda Praça.ai",
        },
        log,
      );

      await vendorPool.query(
        isReminder
          ? `UPDATE praca_avaliacao_solicitacoes
                SET status='lembrada', lembrada_em=now(), updated_at=now()
              WHERE id=$1 AND status='enviada'`
          : `UPDATE praca_avaliacao_solicitacoes
                SET status='enviada', enviada_em=now(), updated_at=now()
              WHERE id=$1 AND status='agendada'`,
        [request.id],
      );
    } catch (error) {
      log.error({ error, requestId: request.id }, "review-requests: falha no envio; será tentado novamente");
    }
  }
}
