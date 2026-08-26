import type { Logger } from "pino";
import { vendorPool } from "../lib/vendorDb";
import { sendEvolutionWhatsAppMessage } from "./evolution-whatsapp.js";

function publicBaseUrl(): string {
  const value = (process.env["PUBLIC_APP_URL"] ?? process.env["APP_URL"] ?? "").replace(/\/$/, "");
  if (!value) throw new Error("PUBLIC_APP_URL não configurada para links de rastreamento.");
  return value;
}

function render(template: string, payload: any): string {
  if (template === "falha_entrega") {
    return `Não conseguimos concluir sua entrega. Motivo: ${payload.motivo}. Acompanhe e fale com a equipe: ${publicBaseUrl()}/acompanhar-entrega/${payload.trackingToken}`;
  }
  if (template === "reentrega_agendada") {
    return `Sua nova tentativa de entrega foi solicitada para ${payload.dataServico}. Acompanhe as atualizações no link de rastreamento recebido.`;
  }
  if (template === "mensagem_entregador") return String(payload.mensagem ?? "");
  throw new Error(`Template logístico desconhecido: ${template}`);
}

export async function processDeliveryNotificationOutbox(log: Logger): Promise<void> {
  await vendorPool.query(
    `UPDATE praca_entrega_notificacoes
        SET status='falhou',erro='Processamento interrompido; nova tentativa liberada.',
            proxima_tentativa_em=now(),processing_started_at=NULL
      WHERE status='processando' AND processing_started_at<now()-interval '10 minutes'`,
  );
  const claimed = await vendorPool.query(
    `WITH candidates AS (
       SELECT id FROM praca_entrega_notificacoes
        WHERE status IN ('pendente','falhou')
          AND proxima_tentativa_em<=now() AND tentativas<6
        ORDER BY proxima_tentativa_em,id
        LIMIT 20 FOR UPDATE SKIP LOCKED
     )
     UPDATE praca_entrega_notificacoes n
        SET status='processando',processing_started_at=now()
       FROM candidates c WHERE n.id=c.id
     RETURNING n.*`,
  );

  for (const notification of claimed.rows) {
    try {
      const config = await vendorPool.query(
        `SELECT evolution_instance_name FROM agent_configs
          WHERE tenant_id=$1 AND evolution_connected=true
          LIMIT 1`,
        [notification.tenant_id],
      );
      const instance = config.rows[0]?.evolution_instance_name;
      if (!instance) throw new Error("WhatsApp Evolution não conectado para o tenant.");
      const text = render(notification.template, notification.payload);
      await sendEvolutionWhatsAppMessage(instance, notification.destinatario_whatsapp, text, log);
      await vendorPool.query(
        `UPDATE praca_entrega_notificacoes
            SET status='enviada',tentativas=tentativas+1,sent_at=now(),erro=NULL,processing_started_at=NULL
          WHERE id=$1`,
        [notification.id],
      );
      if (!notification.interacao_id) {
        await vendorPool.query(
          `INSERT INTO praca_entrega_interacoes
            (tenant_id,pedido_id,remetente_tipo,canal,mensagem,metadata)
           VALUES ($1,$2,'sistema','whatsapp',$3,$4)`,
          [notification.tenant_id, notification.pedido_id, text, { notificationId: notification.id }],
        );
      }
    } catch (error) {
      const attempts = Number(notification.tentativas) + 1;
      const retryMinutes = Math.min(60, 2 ** attempts);
      const failure = error instanceof Error ? error.message : String(error);
      await vendorPool.query(
        `UPDATE praca_entrega_notificacoes
            SET status='falhou',tentativas=$2,erro=$3,processing_started_at=NULL,
                proxima_tentativa_em=now()+($4::text || ' minutes')::interval
          WHERE id=$1`,
        [notification.id, attempts, failure.slice(0, 1000), retryMinutes],
      );
      log.error({ error, notificationId: notification.id, attempts }, "praca/delivery-notification: send failed");
    }
  }
}
