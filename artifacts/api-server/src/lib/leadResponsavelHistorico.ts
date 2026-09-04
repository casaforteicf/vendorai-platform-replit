import { db, leadResponsavelHistoricoTable } from "@workspace/db";

type RecordResponsavelChangeParams = {
  leadId: string;
  responsavelAnteriorId: string | null;
  responsavelNovoId: string;
  alteradoPorId: string | null;
  motivo: "automatico" | "manual";
};

/**
 * Registra uma linha de auditoria pra toda (re)atribuição de responsável de
 * lead — automática (round-robin) ou manual (admin reatribuindo). Nunca
 * lança: auditoria é best-effort, uma falha aqui não pode derrubar a
 * criação/edição do lead que a originou.
 */
export async function recordResponsavelChange(params: RecordResponsavelChangeParams, logger?: Pick<Console, "warn">): Promise<void> {
  try {
    await db.insert(leadResponsavelHistoricoTable).values(params);
  } catch (err) {
    (logger ?? console).warn?.("lead_responsavel_historico: falha ao registrar (não bloqueia o fluxo principal)", err);
  }
}
