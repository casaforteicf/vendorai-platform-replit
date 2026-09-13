import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, growthLabBacklogTable } from "@workspace/db";

const router: IRouter = Router();

function canAccessTenant(req: any, tenantId: string) {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

type MissionTemplate = {
  title: string;
  objective: string;
  actions: string[];
  kpis: string[];
  successCriteria: string[];
  experiment: {
    cohort: string;
    durationDays: number;
    baseline: string;
    primaryMetric: string;
    guardrail: string;
  };
};

const TEMPLATES: Record<string, MissionTemplate> = {
  ads: {
    title: "Completar Gestão de Anúncios",
    objective: "Fazer a promessa de campanhas pagas funcionar de ponta a ponta, da criação à leitura de resultado.",
    actions: [
      "Validar criação e ativação de campanhas Meta e Google",
      "Garantir retorno de aprovação/reprovação e motivo do erro",
      "Conectar gasto, leads, oportunidades e vendas no CRM",
      "Exibir recomendação automática de otimização com evidência",
    ],
    kpis: ["campanhas publicadas", "taxa de aprovação", "CPL", "oportunidades geradas", "receita atribuída"],
    successCriteria: [">= 95% dos fluxos sem erro operacional", "resultado rastreável até CRM", "nenhuma promessa de publicação sem confirmação da plataforma"],
    experiment: {
      cohort: "3 a 5 tenants com campanhas ativas",
      durationDays: 14,
      baseline: "taxa atual de campanhas concluídas e leads atribuídos",
      primaryMetric: "campanhas concluídas com atribuição de resultado",
      guardrail: "não aumentar reprovações nem gasto sem autorização",
    },
  },
  social: {
    title: "Publicação Multicanal Confiável",
    objective: "Transformar a promessa de publicação em várias redes em um fluxo comprovado e monitorável.",
    actions: [
      "Mapear canais realmente conectados por tenant",
      "Bloquear canais sem credencial válida",
      "Publicar com confirmação individual por canal",
      "Registrar falhas, retry e status final por postagem",
    ],
    kpis: ["publicações concluídas", "taxa de sucesso por canal", "retries", "tempo até confirmação"],
    successCriteria: [">= 98% de confirmação em canais habilitados", "falhas exibidas com motivo acionável", "nenhum canal anunciado como ativo sem integração válida"],
    experiment: {
      cohort: "5 tenants com pelo menos 2 redes conectadas",
      durationDays: 7,
      baseline: "publicações concluídas manualmente por canal",
      primaryMetric: "taxa de publicação confirmada multicanal",
      guardrail: "não duplicar postagem e não publicar sem autorização",
    },
  },
  payment: {
    title: "Cobrança e Pagamento de Ponta a Ponta",
    objective: "Fechar o ciclo entre cobrança, pagamento, baixa financeira e atualização do CRM.",
    actions: [
      "Validar Pix/cartão nos provedores habilitados",
      "Registrar status da cobrança e conciliação",
      "Atualizar oportunidade/cliente após pagamento",
      "Disparar follow-up somente quando houver atraso real",
    ],
    kpis: ["cobranças emitidas", "pagamentos confirmados", "tempo de conciliação", "inadimplência", "recuperação"],
    successCriteria: ["pagamento refletido no sistema sem baixa manual", "sem cobranças duplicadas", "follow-up financeiro baseado em status real"],
    experiment: {
      cohort: "3 tenants com cobrança recorrente",
      durationDays: 21,
      baseline: "tempo de baixa e taxa de atraso atuais",
      primaryMetric: "pagamentos conciliados automaticamente",
      guardrail: "nenhuma cobrança duplicada ou enviada a cliente quitado",
    },
  },
  automation: {
    title: "Automações por Evento Auditáveis",
    objective: "Garantir que gatilhos prometidos executem ações reais com histórico, autorização e proteção contra duplicidade.",
    actions: [
      "Catalogar eventos disponíveis",
      "Validar condições e ações suportadas",
      "Registrar execução, erro e retry",
      "Adicionar idempotência e trilha de auditoria",
    ],
    kpis: ["automações executadas", "taxa de sucesso", "duplicidades evitadas", "tempo economizado"],
    successCriteria: [">= 99% de execuções idempotentes", "cada ação com evidência no histórico", "falhas com retry seguro"],
    experiment: {
      cohort: "5 tenants com automações comerciais ativas",
      durationDays: 14,
      baseline: "execuções manuais equivalentes",
      primaryMetric: "ações concluídas automaticamente sem intervenção",
      guardrail: "zero ação externa duplicada",
    },
  },
};

function fallbackTemplate(capabilityName: string, module: string): MissionTemplate {
  return {
    title: `Completar ${capabilityName}`,
    objective: `Transformar a lacuna de ${capabilityName} em uma capacidade comprovada no módulo ${module}.`,
    actions: [
      "Mapear o fluxo prometido de ponta a ponta",
      "Identificar o trecho ainda parcial ou ausente",
      "Implementar o menor fluxo completo utilizável",
      "Instrumentar eventos e evidências de resultado",
    ],
    kpis: ["adoção", "execuções concluídas", "erros", "tempo economizado", "resultado comercial"],
    successCriteria: ["fluxo executável do início ao fim", "resultado mensurável", "evidência suficiente para liberar a promessa comercial"],
    experiment: {
      cohort: "3 tenants afetados pela lacuna",
      durationDays: 14,
      baseline: "resultado atual antes da capacidade completa",
      primaryMetric: "execuções concluídas com resultado comprovado",
      guardrail: "não ampliar promessa antes da validação",
    },
  };
}

router.get("/tenants/:tenantId/growth-lab/mission-suggestions", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const backlog = await db
    .select()
    .from(growthLabBacklogTable)
    .where(and(
      eq(growthLabBacklogTable.tenantId, tenantId),
      eq(growthLabBacklogTable.state, "open"),
    ))
    .orderBy(desc(growthLabBacklogTable.priorityScore), desc(growthLabBacklogTable.affectedPromises));

  const suggestions = backlog.map((item) => {
    const template = TEMPLATES[item.capabilityId] ?? fallbackTemplate(item.capabilityName, item.module);
    const priorityBand = item.priorityScore >= 80 ? "critical" : item.priorityScore >= 60 ? "high" : item.priorityScore >= 40 ? "medium" : "low";

    return {
      id: `mission-${item.capabilityId}`,
      capabilityId: item.capabilityId,
      capabilityName: item.capabilityName,
      module: item.module,
      affectedPromises: item.affectedPromises,
      priorityScore: item.priorityScore,
      priorityBand,
      currentStatus: item.currentStatus,
      mission: {
        title: template.title,
        objective: template.objective,
        actions: template.actions,
        kpis: template.kpis,
        successCriteria: template.successCriteria,
      },
      experiment: template.experiment,
      recommendation: item.priorityScore >= 70 ? "start_experiment" : "prepare_spec",
      evidence: {
        source: "growth_lab_backlog",
        reason: `${item.affectedPromises} promessa(s) dependem desta capacidade`,
      },
    };
  });

  res.json({
    generatedAt: new Date().toISOString(),
    count: suggestions.length,
    suggestions,
  });
});

export default router;
