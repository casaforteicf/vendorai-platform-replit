import { Router, type IRouter } from "express";
import { and, eq, desc, sum, count, getTableColumns } from "drizzle-orm";
import {
  db,
  scoutRegrasTable,
  scoutOportunidadesTable,
  SCOUT_REGRA_TIPOS,
  leadsTable,
  insuranceProductsTable,
  insuranceAccountProductPositionsTable,
  tenantsTable,
  usersTable,
} from "@workspace/db";
import { runRevenueScoutForTenant, parseAcao } from "../services/revenueScout.js";
import { runInsuranceRenewalForTenant } from "../services/insuranceRenewalEngine.js";
import { runInsuranceWhitespaceForTenant } from "../services/insuranceWhitespaceEngine.js";
import { resolveVerticalRevenueProfile } from "../services/verticalRevenueEngine.js";
import { renderTemplate } from "../lib/proactiveMessageGuard.js";
import { sendDirectWhatsAppMessage } from "../services/omnichannel.js";
import { ensureMinimumScoutRulesForTenant } from "../services/scoutVerticalRuleLibrary.js";

const router: IRouter = Router();

function tid(req: Express.Request): string {
  return (req as any).user?.tenantId as string;
}

function isSuperAdmin(req: Express.Request) {
  return (req as any).user?.platformRole === "super_admin";
}

function canAccess(req: Express.Request, tenantId: string) {
  return isSuperAdmin(req) || tid(req) === tenantId;
}

const OPPORTUNITY_TYPE_LABELS: Record<string, string> = {
  recompra: "recompra",
  cross_sell: "venda complementar (cross-sell)",
  reativacao: "reativação",
  upgrade: "upgrade",
  aniversario: "ação de relacionamento",
  follow_up: "follow-up",
  renovacao: "renovação",
  manutencao: "manutenção",
  sequencia_produto: "próxima etapa de produto",
};

function fallbackOpportunityExplanation(op: {
  tipo?: string | null;
  descricao?: string | null;
  scoreOportunidade?: string | null;
}, regraNome?: string | null) {
  const description = op.descricao?.trim() || "A regra do Revenue Scout identificou um possível movimento comercial.";
  const signal = description.includes(":") ? description.slice(description.indexOf(":") + 1).trim() : description;
  const typeLabel = OPPORTUNITY_TYPE_LABELS[op.tipo ?? ""] ?? op.tipo ?? "oportunidade comercial";
  const imported = /importa(?:ção|cao)/i.test(description);

  return {
    inference: `O Scout percebeu potencial de ${typeLabel} porque o sinal observado — ${signal} — indica uma necessidade ainda não atendida. A confirmação humana continua necessária antes de qualquer contato.`,
    facts: {
      sinal_observado: signal,
      regra_aplicada: regraNome || "Revenue Scout",
      origem_do_sinal: imported ? "Dados importados para análise de whitespace" : "Dados e histórico disponíveis no Revenue Scout",
      ...(op.scoreOportunidade ? { score_de_prioridade: Number(op.scoreOportunidade) } : {}),
    },
  };
}

// ─── Regras ───────────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/scout/regras", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  // Regras são tenant-scoped. Ao abrir a tela, preserva tudo que o cliente já
  // cadastrou e recompõe apenas a biblioteca ausente até o mínimo por vertical.
  await ensureMinimumScoutRulesForTenant(tenantId);

  const rows = await db
    .select()
    .from(scoutRegrasTable)
    .where(eq(scoutRegrasTable.tenantId, tenantId))
    .orderBy(desc(scoutRegrasTable.createdAt));

  return res.json(rows);
});

router.post("/tenants/:tenantId/scout/regras", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { nome, tipo, condicoes, acao, ativo } = req.body as {
    nome?: string;
    tipo?: string;
    condicoes?: unknown;
    acao?: unknown;
    ativo?: boolean;
  };

  if (!nome || !tipo || !condicoes || !acao) {
    return res.status(422).json({ error: "nome, tipo, condicoes e acao são obrigatórios" });
  }

  if (!(SCOUT_REGRA_TIPOS as readonly string[]).includes(tipo)) {
    return res.status(422).json({ error: `tipo inválido. Valores: ${SCOUT_REGRA_TIPOS.join(", ")}` });
  }

  if (ativo !== undefined && typeof ativo !== "boolean") {
    return res.status(422).json({ error: "ativo precisa ser booleano" });
  }

  const [row] = await db
    .insert(scoutRegrasTable)
    .values({ tenantId, nome, tipo, condicoes, acao, ...(ativo !== undefined ? { ativo } : {}) } as any)
    .returning();

  return res.status(201).json(row);
});

router.patch("/tenants/:tenantId/scout/regras/:id", async (req, res) => {
  const { tenantId, id } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { tipo } = req.body as { tipo?: string };
  if (tipo !== undefined && !(SCOUT_REGRA_TIPOS as readonly string[]).includes(tipo)) {
    return res.status(422).json({ error: `tipo inválido. Valores: ${SCOUT_REGRA_TIPOS.join(", ")}` });
  }

  const [row] = await db
    .update(scoutRegrasTable)
    .set(req.body as any)
    .where(and(eq(scoutRegrasTable.id, id), eq(scoutRegrasTable.tenantId, tenantId)))
    .returning();

  if (!row) return res.status(404).json({ error: "Regra not found" });
  return res.json(row);
});

router.delete("/tenants/:tenantId/scout/regras/:id", async (req, res) => {
  const { tenantId, id } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  try {
    const [row] = await db
      .delete(scoutRegrasTable)
      .where(and(eq(scoutRegrasTable.id, id), eq(scoutRegrasTable.tenantId, tenantId)))
      .returning();

    if (!row) return res.status(404).json({ error: "Regra not found" });
    return res.status(204).send();
  } catch (err: any) {
    // FK restrict — regra já gerou oportunidade(s), não pode ser apagada
    // sem apagar o histórico junto. Mensagem clara em vez de 500 cru.
    if (err?.code === "23503") {
      return res.status(409).json({ error: "Essa regra já gerou oportunidades e não pode ser excluída. Desative em vez de excluir, pra manter o histórico." });
    }
    throw err;
  }
});

router.patch("/tenants/:tenantId/scout/regras/:id/toggle", async (req, res) => {
  const { tenantId, id } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [existing] = await db
    .select({ ativo: scoutRegrasTable.ativo })
    .from(scoutRegrasTable)
    .where(and(eq(scoutRegrasTable.id, id), eq(scoutRegrasTable.tenantId, tenantId)));

  if (!existing) return res.status(404).json({ error: "Regra not found" });

  const [row] = await db
    .update(scoutRegrasTable)
    .set({ ativo: !existing.ativo })
    .where(eq(scoutRegrasTable.id, id))
    .returning();

  return res.json(row);
});

// ─── Oportunidades ────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/scout/oportunidades", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const filters = [eq(scoutOportunidadesTable.tenantId, tenantId)];

  if (req.query.tipo) {
    filters.push(eq(scoutOportunidadesTable.tipo, req.query.tipo as string));
  }
  if (req.query.status) {
    filters.push(eq(scoutOportunidadesTable.status, req.query.status as string));
  }
  if (req.query.clienteId) {
    filters.push(eq(scoutOportunidadesTable.clienteId, req.query.clienteId as string));
  }

  // Keep the read endpoint compatible while migration 078 rolls out. The
  // dashboard only reads legacy columns, so selecting the whole table here
  // made it possible for the KPI to show opportunities while this endpoint
  // failed on installations that did not have the pipeline columns yet.
  const {
    pipelineStage: _pipelineStage,
    assignedTo: _assignedTo,
    approvedBy: _approvedBy,
    approvedAt: _approvedAt,
    ...readableOpportunityColumns
  } = getTableColumns(scoutOportunidadesTable);

  const rows = await db
    .select({
      op: readableOpportunityColumns,
      clienteNome: leadsTable.nome,
      regraAcao: scoutRegrasTable.acao,
      regraNome: scoutRegrasTable.nome,
      cliente: leadsTable,
    })
    .from(scoutOportunidadesTable)
    .leftJoin(leadsTable, eq(leadsTable.id, scoutOportunidadesTable.clienteId))
    .leftJoin(scoutRegrasTable, eq(scoutRegrasTable.id, scoutOportunidadesTable.regraId))
    .where(and(...filters))
    .orderBy(desc(scoutOportunidadesTable.createdAt))
    .limit(200);

  // Enrich the legacy-safe result with pipeline data whenever migration 078
  // is present. Older databases can still list opportunities instead of
  // turning a schema mismatch into an empty screen.
  const pipelineByOpportunityId = new Map<string, {
    pipelineStage: string | null;
    assignedTo: string | null;
    approvedBy: string | null;
    approvedAt: Date | null;
    responsavelNome: string | null;
  }>();
  try {
    const pipelineRows = await db
      .select({
        id: scoutOportunidadesTable.id,
        pipelineStage: scoutOportunidadesTable.pipelineStage,
        assignedTo: scoutOportunidadesTable.assignedTo,
        approvedBy: scoutOportunidadesTable.approvedBy,
        approvedAt: scoutOportunidadesTable.approvedAt,
        responsavelNome: usersTable.name,
      })
      .from(scoutOportunidadesTable)
      .leftJoin(usersTable, eq(usersTable.id, scoutOportunidadesTable.assignedTo))
      .where(and(...filters))
      .limit(200);
    for (const row of pipelineRows) pipelineByOpportunityId.set(row.id, row);
  } catch (error) {
    const dbError = error as { code?: string; cause?: { code?: string }; message?: string };
    const isMissingPipelineColumn = dbError.code === "42703"
      || dbError.cause?.code === "42703"
      || dbError.message?.includes("does not exist");
    if (!isMissingPipelineColumn) throw error;
  }

  const enriched = rows.map(({ op, clienteNome, regraAcao, regraNome, cliente }) => {
    const pipeline = pipelineByOpportunityId.get(op.id);
    const acao = parseAcao(regraAcao);
    const hasNegotiation = !!op.propostaId || !!op.dealId;
    const normalizedStatus = op.status === "em_negociacao" && !hasNegotiation
      ? "pendente"
      : op.status;
    let mensagemPreview: string | null = op.mensagemEnviada ?? null;
    if (!mensagemPreview && normalizedStatus === "pendente" && acao.mensagem) {
      const rendered = renderTemplate(acao.mensagem, { nome: clienteNome ?? "", nome_cliente: clienteNome ?? "" });
      mensagemPreview = rendered.ok ? rendered.mensagem : null;
    }
    const fallbackExplanation = fallbackOpportunityExplanation(op, regraNome);
    return {
      ...op,
      status: normalizedStatus,
      clienteNome,
      cliente,
      regraNome,
      pipelineStage: pipeline?.pipelineStage ?? "identificada",
      assignedTo: pipeline?.assignedTo ?? null,
      approvedBy: pipeline?.approvedBy ?? null,
      approvedAt: pipeline?.approvedAt ?? null,
      responsavelNome: pipeline?.responsavelNome ?? null,
      mensagemPreview,
      requerAprovacao: !!(acao as { requiresApproval?: boolean }).requiresApproval,
      percepcao: op.explanation?.inference ?? fallbackExplanation.inference,
      justificativa: op.explanation?.facts ?? fallbackExplanation.facts,
    };
  });

  return res.json(enriched);
});

router.delete("/tenants/:tenantId/scout/oportunidades/:id", async (req, res) => {
  const { tenantId, id } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const role = (req as any).user?.platformRole;
  if (role !== "super_admin" && role !== "tenant_admin") {
    return res.status(403).json({ error: "Somente administradores podem excluir oportunidades do Scout." });
  }

  const [deleted] = await db.delete(scoutOportunidadesTable)
    .where(and(eq(scoutOportunidadesTable.id, id), eq(scoutOportunidadesTable.tenantId, tenantId)))
    .returning({ id: scoutOportunidadesTable.id });
  if (!deleted) return res.status(404).json({ error: "Oportunidade não encontrada." });
  return res.json({ ok: true, id: deleted.id });
});
router.patch("/tenants/:tenantId/scout/oportunidades/:id/encaminhar", async (req, res) => {
  const { tenantId, id } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const { userId } = req.body as { userId?: string | null };
  if (userId) {
    const [user] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(and(eq(usersTable.id, userId), eq(usersTable.tenantId, tenantId), eq(usersTable.active, true)));
    if (!user) return res.status(422).json({ error: "Usuario nao pertence a este tenant ou esta inativo." });
  }
  const [updated] = await db.update(scoutOportunidadesTable)
    .set({ assignedTo: userId ?? null, pipelineStage: userId ? "encaminhada" : "identificada" })
    .where(and(eq(scoutOportunidadesTable.id, id), eq(scoutOportunidadesTable.tenantId, tenantId)))
    .returning();
  if (!updated) return res.status(404).json({ error: "Oportunidade not found" });
  return res.json(updated);
});

router.patch("/tenants/:tenantId/scout/oportunidades/:id/etapa", async (req, res) => {
  const { tenantId, id } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const allowed = ["identificada", "em_analise", "encaminhada", "ia_aprovada", "em_contato", "convertida", "descartada"];
  const { etapa } = req.body as { etapa?: string };
  if (!etapa || !allowed.includes(etapa)) return res.status(422).json({ error: "Etapa invalida." });
  const [updated] = await db.update(scoutOportunidadesTable).set({ pipelineStage: etapa })
    .where(and(eq(scoutOportunidadesTable.id, id), eq(scoutOportunidadesTable.tenantId, tenantId))).returning();
  if (!updated) return res.status(404).json({ error: "Oportunidade not found" });
  return res.json(updated);
});

// Confirma o achado do Scout sem iniciar contato. A oportunidade so passa a
// integrar o Pipeline Scout depois desta validacao humana.
router.post("/tenants/:tenantId/scout/oportunidades/:id/confirmar", async (req, res) => {
  const { tenantId, id } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [op] = await db.select({
    id: scoutOportunidadesTable.id,
    status: scoutOportunidadesTable.status,
    propostaId: scoutOportunidadesTable.propostaId,
    dealId: scoutOportunidadesTable.dealId,
  })
    .from(scoutOportunidadesTable)
    .where(and(eq(scoutOportunidadesTable.id, id), eq(scoutOportunidadesTable.tenantId, tenantId)));
  if (!op) return res.status(404).json({ error: "Oportunidade não encontrada." });
  const awaitingConfirmation = op.status === "pendente"
    || (op.status === "em_negociacao" && !op.propostaId && !op.dealId);
  if (!awaitingConfirmation) return res.status(409).json({ error: "Essa oportunidade já foi validada." });

  const [updated] = await db.update(scoutOportunidadesTable)
    .set({ status: "aprovado", pipelineStage: "identificada", approvedBy: (req as any).user?.sub ?? null, approvedAt: new Date() })
    .where(and(eq(scoutOportunidadesTable.id, id), eq(scoutOportunidadesTable.tenantId, tenantId)))
    .returning();

  req.log.info({ tenantId, opportunityId: id }, "scout: oportunidade confirmada por humano");
  return res.json(updated);
});

// Depois da confirmacao, aprova a sequencia automatizada e dispara a mensagem.
router.post("/tenants/:tenantId/scout/oportunidades/:id/aprovar", async (req, res) => {
  const { tenantId, id } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [op] = await db.select().from(scoutOportunidadesTable)
    .where(and(eq(scoutOportunidadesTable.id, id), eq(scoutOportunidadesTable.tenantId, tenantId)));
  if (!op) return res.status(404).json({ error: "Oportunidade not found" });
  if (op.status !== "aprovado") return res.status(409).json({ error: "Confirme primeiro se este achado é uma oportunidade real." });

  const [lead] = await db.select({ nome: leadsTable.nome, telefone: leadsTable.telefone })
    .from(leadsTable).where(eq(leadsTable.id, op.clienteId));
  if (!lead?.telefone) {
    await db.update(scoutOportunidadesTable).set({ status: "ignorado" }).where(eq(scoutOportunidadesTable.id, id));
    return res.status(422).json({ error: "Lead sem telefone cadastrado — oportunidade marcada como ignorada." });
  }

  const { mensagem: mensagemEditada } = req.body as { mensagem?: string };
  let mensagem = mensagemEditada;
  if (!mensagem) {
    const [regra] = await db.select({ acao: scoutRegrasTable.acao }).from(scoutRegrasTable).where(eq(scoutRegrasTable.id, op.regraId));
    const acao = parseAcao(regra?.acao);
    const rendered = renderTemplate(acao.mensagem ?? "Olá {nome}, temos uma novidade para você!", { nome: lead.nome ?? "", nome_cliente: lead.nome ?? "" });
    if (!rendered.ok) return res.status(422).json({ error: `Mensagem com placeholder quebrado: ${rendered.motivoFalha}` });
    mensagem = rendered.mensagem;
  }

  await sendDirectWhatsAppMessage(tenantId, lead.telefone, mensagem, req.log as any);
  const [updated] = await db.update(scoutOportunidadesTable)
    .set({ status: "enviado", pipelineStage: "em_contato", approvedBy: (req as any).user?.sub ?? null, approvedAt: new Date(), mensagemEnviada: mensagem, canal: "whatsapp", enviadoEm: new Date() })
    .where(eq(scoutOportunidadesTable.id, id))
    .returning();
  return res.json(updated);
});

router.post("/tenants/:tenantId/scout/oportunidades/:id/rejeitar", async (req, res) => {
  const { tenantId, id } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [op] = await db.select().from(scoutOportunidadesTable)
    .where(and(eq(scoutOportunidadesTable.id, id), eq(scoutOportunidadesTable.tenantId, tenantId)));
  if (!op) return res.status(404).json({ error: "Oportunidade not found" });

  const awaitingConfirmation = op.status === "pendente"
    || (op.status === "em_negociacao" && !op.propostaId && !op.dealId);
  if (!awaitingConfirmation) {
    return res.status(409).json({ error: "Somente oportunidades aguardando confirmação podem ser rejeitadas." });
  }

  const [deleted] = await db.delete(scoutOportunidadesTable)
    .where(and(eq(scoutOportunidadesTable.id, id), eq(scoutOportunidadesTable.tenantId, tenantId)))
    .returning({ id: scoutOportunidadesTable.id });
  req.log.info({ tenantId, opportunityId: id }, "scout: achado rejeitado e excluído");
  return res.json({ ok: true, id: deleted.id });
});

// ─── Seguros Corporativos: Renovações e matriz conta × produto ────────────────

router.get("/tenants/:tenantId/scout/insurance/renewals", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const rows = await db
    .select({
      id: scoutOportunidadesTable.id,
      accountId: insuranceAccountProductPositionsTable.accountId,
      accountName: leadsTable.nome,
      productName: insuranceProductsTable.name,
      insurerName: insuranceAccountProductPositionsTable.insurerName,
      policyNumber: insuranceAccountProductPositionsTable.policyNumber,
      effectiveTo: insuranceAccountProductPositionsTable.effectiveTo,
      premium: insuranceAccountProductPositionsTable.premium,
      renewalWindow: scoutOportunidadesTable.renewalWindow,
      score: scoutOportunidadesTable.scoreOportunidade,
      status: scoutOportunidadesTable.status,
      blocked: scoutOportunidadesTable.blocked,
      humanRequired: scoutOportunidadesTable.humanRequired,
      explanation: scoutOportunidadesTable.explanation,
    })
    .from(scoutOportunidadesTable)
    .innerJoin(
      insuranceAccountProductPositionsTable,
      and(
        eq(insuranceAccountProductPositionsTable.id, scoutOportunidadesTable.insurancePositionId),
        eq(insuranceAccountProductPositionsTable.tenantId, tenantId),
      ),
    )
    .innerJoin(
      leadsTable,
      and(
        eq(leadsTable.id, insuranceAccountProductPositionsTable.accountId),
        eq(leadsTable.tenantId, tenantId),
      ),
    )
    .innerJoin(
      insuranceProductsTable,
      and(
        eq(insuranceProductsTable.id, insuranceAccountProductPositionsTable.productId),
        eq(insuranceProductsTable.tenantId, tenantId),
      ),
    )
    .where(eq(scoutOportunidadesTable.tenantId, tenantId))
    .orderBy(desc(scoutOportunidadesTable.scoreOportunidade));

  return res.json(rows);
});

router.post("/tenants/:tenantId/scout/insurance/renewals/run", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const result = await runInsuranceRenewalForTenant(tenantId, req.log);
  return res.json({ ok: true, ...result });
});

router.get("/tenants/:tenantId/scout/insurance/whitespace", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const rows = await db
    .select({
      id: scoutOportunidadesTable.id,
      accountId: insuranceAccountProductPositionsTable.accountId,
      accountName: leadsTable.nome,
      productName: insuranceProductsTable.name,
      productCode: insuranceProductsTable.code,
      stage: insuranceAccountProductPositionsTable.stage,
      score: scoutOportunidadesTable.scoreOportunidade,
      status: scoutOportunidadesTable.status,
      explanation: scoutOportunidadesTable.explanation,
    })
    .from(scoutOportunidadesTable)
    .innerJoin(
      insuranceAccountProductPositionsTable,
      and(
        eq(insuranceAccountProductPositionsTable.id, scoutOportunidadesTable.insurancePositionId),
        eq(insuranceAccountProductPositionsTable.tenantId, tenantId),
      ),
    )
    .innerJoin(leadsTable, and(
      eq(leadsTable.id, insuranceAccountProductPositionsTable.accountId),
      eq(leadsTable.tenantId, tenantId),
    ))
    .innerJoin(insuranceProductsTable, and(
      eq(insuranceProductsTable.id, insuranceAccountProductPositionsTable.productId),
      eq(insuranceProductsTable.tenantId, tenantId),
    ))
    .where(and(
      eq(scoutOportunidadesTable.tenantId, tenantId),
      eq(insuranceAccountProductPositionsTable.stage, "whitespace"),
    ))
    .orderBy(desc(scoutOportunidadesTable.scoreOportunidade));

  return res.json(rows);
});

router.post("/tenants/:tenantId/scout/insurance/whitespace/run", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const result = await runInsuranceWhitespaceForTenant(tenantId, req.log);
  return res.json({ ok: true, ...result });
});

router.post("/tenants/:tenantId/scout/insurance/renewals/:id/approve", async (req, res) => {
  const { tenantId, id } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [existing] = await db
    .select({
      id: scoutOportunidadesTable.id,
      blocked: scoutOportunidadesTable.blocked,
      insurancePositionId: scoutOportunidadesTable.insurancePositionId,
    })
    .from(scoutOportunidadesTable)
    .where(and(
      eq(scoutOportunidadesTable.id, id),
      eq(scoutOportunidadesTable.tenantId, tenantId),
    ));

  if (!existing?.insurancePositionId) return res.status(404).json({ error: "Renovação não encontrada" });
  if (existing.blocked) {
    return res.status(409).json({
      error: "A renovação está bloqueada por sinistro, reclamação ou outra exceção e precisa de tratamento humano.",
    });
  }

  const [row] = await db
    .update(scoutOportunidadesTable)
    .set({ status: "aprovado", humanRequired: true })
    .where(and(
      eq(scoutOportunidadesTable.id, id),
      eq(scoutOportunidadesTable.tenantId, tenantId),
    ))
    .returning();

  req.log.info({ tenantId, opportunityId: id }, "insurance-renewal: preparação aprovada por humano");
  return res.json(row);
});

router.get("/tenants/:tenantId/scout/insurance/accounts/:accountId/matrix", async (req, res) => {
  const { tenantId, accountId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const rows = await db
    .select({
      positionId: insuranceAccountProductPositionsTable.id,
      productId: insuranceProductsTable.id,
      productName: insuranceProductsTable.name,
      productCode: insuranceProductsTable.code,
      stage: insuranceAccountProductPositionsTable.stage,
      policyNumber: insuranceAccountProductPositionsTable.policyNumber,
      insurerName: insuranceAccountProductPositionsTable.insurerName,
      effectiveFrom: insuranceAccountProductPositionsTable.effectiveFrom,
      effectiveTo: insuranceAccountProductPositionsTable.effectiveTo,
      premium: insuranceAccountProductPositionsTable.premium,
      competitiveRisk: insuranceAccountProductPositionsTable.competitiveRisk,
      renewalRisk: insuranceAccountProductPositionsTable.renewalRisk,
    })
    .from(insuranceAccountProductPositionsTable)
    .innerJoin(
      insuranceProductsTable,
      and(
        eq(insuranceProductsTable.id, insuranceAccountProductPositionsTable.productId),
        eq(insuranceProductsTable.tenantId, tenantId),
      ),
    )
    .where(and(
      eq(insuranceAccountProductPositionsTable.tenantId, tenantId),
      eq(insuranceAccountProductPositionsTable.accountId, accountId),
    ))
    .orderBy(insuranceProductsTable.name);

  return res.json(rows);
});

// ─── Dashboard ────────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/scout/dashboard", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  await ensureMinimumScoutRulesForTenant(tenantId);

  const [tenant] = await db.select({ vertical: tenantsTable.vertical })
    .from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1);
  const profile = resolveVerticalRevenueProfile(tenant?.vertical);

  const todas = await db
    .select({
      status:        scoutOportunidadesTable.status,
      valorEstimado: scoutOportunidadesTable.valorEstimado,
      converteu:     scoutOportunidadesTable.converteu,
    })
    .from(scoutOportunidadesTable)
    .where(eq(scoutOportunidadesTable.tenantId, tenantId));

  const totalOportunidades = todas.length;
  const enviadas    = todas.filter((o) => o.status === "enviado" || o.status === "respondeu" || o.status === "converteu").length;
  const convertidas = todas.filter((o) => o.converteu === true).length;
  const taxaConversao = enviadas > 0 ? Number(((convertidas / enviadas) * 100).toFixed(1)) : 0;

  const receitaEstimada = todas.reduce((acc, o) => acc + Number(o.valorEstimado ?? 0), 0);
  const receitaGerada   = todas
    .filter((o) => o.converteu === true)
    .reduce((acc, o) => acc + Number(o.valorEstimado ?? 0), 0);

  return res.json({
    totalOportunidades,
    enviadas,
    convertidas,
    taxaConversao,
    receitaEstimada: Number(receitaEstimada.toFixed(2)),
    receitaGerada:   Number(receitaGerada.toFixed(2)),
    verticalProfile: profile ? {
      key: profile.key,
      label: profile.label,
      focus: profile.focus,
      cycleDays: profile.cycleDays,
      dormantDays: profile.dormantDays,
      cycleType: profile.cycleType,
      signals: profile.signals,
    } : null,
  });
});

// ─── Disparo manual do Revenue Scout ─────────────────────────────────────────

router.post("/tenants/:tenantId/scout/run", async (req, res) => {
  const { tenantId } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const log = (req as any).log ?? console;

  const result = await runRevenueScoutForTenant(tenantId, log);
  return res.json({ ok: true, ...result });
});

// ─── Converter oportunidade ───────────────────────────────────────────────────

router.post("/tenants/:tenantId/scout/oportunidades/:id/converter", async (req, res) => {
  const { tenantId, id } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [row] = await db
    .update(scoutOportunidadesTable)
    .set({ converteu: true, status: "converteu" })
    .where(and(eq(scoutOportunidadesTable.id, id), eq(scoutOportunidadesTable.tenantId, tenantId)))
    .returning();

  if (!row) return res.status(404).json({ error: "Oportunidade not found" });
  return res.json(row);
});

// ── POST /tenants/:tenantId/scout/oportunidades/:id/resultado ─────────────────
// Marca o resultado final de uma oportunidade: "won" → converteu / "lost" → ignorado
router.post("/tenants/:tenantId/scout/oportunidades/:id/resultado", async (req, res) => {
  const { tenantId, id } = req.params;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const { resultado } = req.body as { resultado?: string };
  if (resultado !== "won" && resultado !== "lost") {
    return res.status(422).json({ error: "resultado deve ser 'won' ou 'lost'" });
  }

  const updates =
    resultado === "won"
      ? { converteu: true, status: "converteu" as const }
      : { status: "ignorado" as const };

  const [row] = await db
    .update(scoutOportunidadesTable)
    .set(updates)
    .where(and(eq(scoutOportunidadesTable.id, id), eq(scoutOportunidadesTable.tenantId, tenantId)))
    .returning();

  if (!row) return res.status(404).json({ error: "Oportunidade not found" });

  req.log.info({ tenantId, id, resultado }, "scout: oportunidade resultado registrado");
  return res.json(row);
});

export default router;
