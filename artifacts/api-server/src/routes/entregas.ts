import { Router, type IRouter, type Request } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod/v4";
import {
  db,
  entregasTable,
  insertEntregaSchema,
  updateEntregaSchema,
  workCardsTable,
  workCardAttachmentsTable,
  insertWorkCardSchema,
  updateWorkCardSchema,
  insertWorkCardAttachmentSchema,
  propostasTable,
  dealsTable,
  activitiesTable,
  leadsTable,
  usersTable,
  tenantsTable,
  installationChecklistTemplatesTable,
  installationVisitsTable,
  installationChecklistItemsTable,
  installationOccurrencesTable,
  insertInstallationTemplateSchema,
  updateInstallationTemplateSchema,
  updateInstallationVisitSchema,
  updateInstallationChecklistItemSchema,
  type EntregaItem,
} from "@workspace/db";
import { buildUserFunctionFilter } from "../middlewares/auth.js";
import { checkTurnoCapacity, dispatchPendingEntregas, pickNextMotorista } from "../lib/entregas.js";
import { triggerDeliveryFeedbackRequest } from "../services/post-venda.js";
import { sendDirectWhatsAppMessage } from "../services/omnichannel.js";
import { generateSupportReportDraft } from "../services/support-report.js";
import { requestSupportFeedback } from "../services/support-feedback.js";
import { canAdvanceWorkCard, TERMINAL_WORK_STAGES } from "../lib/pipeline-progress.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { generateDeliveryAcceptancePdf } from "../lib/delivery-acceptance-pdf.js";

const router: IRouter = Router();

const EXECUTION_STAGES = [
  "pedido_confirmado",
  "liberacao_financeira",
  "liberacao_medidas",
  "projeto",
  "producao_a_iniciar",
  "producao_em_andamento",
  "producao_finalizada",
  "aguardando_liberacao",
  "liberado",
  "agenda_entrega",
  "em_transporte",
  "instalacao_a_iniciar",
  "instalacao_em_andamento",
  "instalacao_finalizada",
  "entrega_obra",
  "pos_venda",
  "concluido",
  "cancelado",
] as const;

const EXECUTION_STAGE_REQUIREMENTS: Record<string, string[]> = {
  pedido_confirmado: ["pedido_contexto"],
  liberacao_financeira: ["liberacao_financeira"],
  liberacao_medidas: ["relatorio_medidas"],
  projeto: ["projeto_aprovado"],
  producao_a_iniciar: ["pre_requisitos_producao"],
  producao_em_andamento: ["registro_producao"],
  producao_finalizada: ["qualidade_producao"],
  aguardando_liberacao: ["motivo_bloqueio"],
  liberado: ["liberacao_operacional"],
  agenda_entrega: ["agenda_entrega"],
  em_transporte: ["checklist_transporte"],
  instalacao_a_iniciar: ["pre_instalacao"],
  instalacao_em_andamento: ["checklist_instalacao"],
  instalacao_finalizada: ["conferencia_instalacao"],
  entrega_obra: ["vistoria_aceite"],
  pos_venda: ["pacote_entrega"],
};

function completedStageGate(card: typeof workCardsTable.$inferSelect, key: string): boolean {
  const metadata = (card.metadata ?? {}) as Record<string, unknown>;
  const stageGates = (metadata.stageGates && typeof metadata.stageGates === "object")
    ? metadata.stageGates as Record<string, unknown>
    : {};
  const value = stageGates[key];
  return value === true || Boolean(value && typeof value === "object" && (value as Record<string, unknown>).completed === true);
}

function missingTransitionRequirements(card: typeof workCardsTable.$inferSelect, targetStage: string): Array<{ stage: string; key: string }> {
  if (card.pipeline !== "execucao") return [];
  const currentIndex = EXECUTION_STAGES.indexOf(card.etapa as typeof EXECUTION_STAGES[number]);
  const targetIndex = EXECUTION_STAGES.indexOf(targetStage as typeof EXECUTION_STAGES[number]);
  if (currentIndex < 0 || targetIndex <= currentIndex) return [];
  return EXECUTION_STAGES
    .slice(currentIndex, targetIndex)
    .flatMap((stage) => (EXECUTION_STAGE_REQUIREMENTS[stage] ?? []).map((key) => ({ stage, key })))
    .filter(({ key }) => !completedStageGate(card, key));
}

const SUPPORT_STAGES = [
  "chamado_cliente",
  "agendamento_assistencia",
  "execucao_assistencia",
  "relatorio_assistencia",
  "feedback_cliente",
  "fechamento_assistencia",
  "cancelado",
] as const;


const stageFormCompleteSchema = z.object({
  key: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
});

const inspectionStatusSchema = z.enum(["conforme", "nao_conforme", "nao_se_aplica"]);

const deliveryAcceptanceSchema = z.object({
  receiver: z.object({
    role: z.enum(["cliente", "delegado"]),
    name: z.string().trim().min(2).max(200),
    document: z.string().trim().max(100).optional().nullable(),
    phone: z.string().trim().max(50).optional().nullable(),
    email: z.string().trim().email().optional().nullable(),
    relationship: z.string().trim().max(150).optional().nullable(),
    authorization: z.string().trim().max(500).optional().nullable(),
  }),
  acceptanceType: z.enum(["sem_ressalvas", "com_ressalvas"]),
  observations: z.string().max(10000).optional().nullable(),
  items: z.array(z.object({
    name: z.string().trim().min(1),
    quantity: z.number().positive().optional().nullable(),
    installation: inspectionStatusSchema,
    functionality: inspectionStatusSchema,
    interiorFinish: inspectionStatusSchema,
    exteriorFinish: inspectionStatusSchema,
    status: inspectionStatusSchema,
    observation: z.string().max(5000).optional().nullable(),
    evidenceAttachmentIds: z.array(z.string()).default([]),
  })).min(1),
  signatures: z.object({
    client: z.object({
      name: z.string().trim().min(2),
      dataUrl: z.string().startsWith("data:image/").max(2_000_000),
    }),
    company: z.object({
      name: z.string().trim().min(2),
      dataUrl: z.string().startsWith("data:image/").max(2_000_000),
    }),
  }),
  manualAttachmentIds: z.array(z.string()).default([]),
});

function stageFormDataValid(key: string, data: Record<string, unknown>): string | null {
  const items = Array.isArray(data.items) ? data.items as Array<Record<string, unknown>> : [];
  if (["relatorio_medidas", "checklist_transporte", "checklist_instalacao"].includes(key)) {
    if (items.length === 0) return "O formulário precisa conter os itens do pedido/lote.";
    if (items.some((item) => item.checked !== true)) return "Todos os itens precisam ser conferidos antes de concluir.";
  }
  if (key === "conferencia_instalacao") {
    const checks = ["itensConferidos", "funcionamentoTestado", "acabamentoConferido", "limpezaFinal"];
    if (checks.some((field) => data[field] !== true)) return "Conclua todas as verificações da instalação antes de liberar a vistoria.";
  }
  return null;
}

const objectStorage = new ObjectStorageService();

const SUPPORT_CATEGORIES = [
  "defeito",
  "instalacao",
  "funcionamento",
  "avaria",
  "falta_material",
  "erro_medida",
  "duvida_tecnica",
  "garantia",
  "manutencao",
  "outro",
] as const;

const WORK_STAGE_LABELS: Record<string, string> = {
  pedido_confirmado: "Pedido confirmado",
  liberacao_financeira: "Liberação financeira",
  liberacao_medidas: "Liberação de medidas",
  projeto: "Projeto",
  producao_a_iniciar: "Produção — a iniciar",
  producao_em_andamento: "Produção — em andamento",
  producao_finalizada: "Produção — finalizada",
  aguardando_liberacao: "Aguardando liberação",
  liberado: "Liberado",
  agenda_entrega: "Agenda de entrega",
  em_transporte: "Em transporte",
  instalacao_a_iniciar: "Instalação — a iniciar",
  instalacao_em_andamento: "Instalação — em andamento",
  instalacao_finalizada: "Instalação — finalizada",
  entrega_obra: "Entrega da obra",
  pos_venda: "Pós-venda",
  concluido: "Concluído",
  chamado_cliente: "Chamado cliente",
  agendamento_assistencia: "Agendamento assistência",
  execucao_assistencia: "Execução da assistência",
  relatorio_assistencia: "Relatório da assistência",
  feedback_cliente: "Feedback cliente",
  fechamento_assistencia: "Fechamento assistência",
  cancelado: "Cancelado",
};

function isAdmin(req: Request) {
  return req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
}

function canAccessTenant(req: Request, tenantId: string) {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

function restrictedToOwnWork(req: Request) {
  if (isAdmin(req)) return false;
  const fn = req.user?.userFunction as string | undefined;
  return req.user?.platformRole === "tenant_seller" || fn === "vendedor" || fn === "representante_comercial" || fn === "entrega" || fn === "suporte";
}

function workCode(prefix: "PED" | "ENT" | "AST" | "OP") {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`;
}

const INSTALLATION_DONE_STATUSES = new Set(["instalado", "conferido"]);

function normalizeInstallationItemKey(item: Record<string, unknown>, index: number) {
  const productId = typeof item.produtoId === "string" ? item.produtoId : "";
  const sku = typeof item.sku === "string" ? item.sku : "";
  const proposalIndex = Number.isInteger(item.propostaItemIndex) ? String(item.propostaItemIndex) : "";
  const name = typeof item.nome === "string" ? item.nome : "";
  return [proposalIndex, productId, sku, name, index].filter(Boolean).join(":");
}

function ensureInstallationChecklist(metadataInput: unknown) {
  const metadata =
    metadataInput && typeof metadataInput === "object" && !Array.isArray(metadataInput)
      ? { ...(metadataInput as Record<string, unknown>) }
      : {};
  const sourceItems = Array.isArray(metadata.itens)
    ? (metadata.itens as Array<Record<string, unknown>>)
    : [];
  const currentRaw =
    metadata.installationChecklist &&
    typeof metadata.installationChecklist === "object" &&
    !Array.isArray(metadata.installationChecklist)
      ? (metadata.installationChecklist as Record<string, unknown>)
      : {};
  const currentItems = Array.isArray(currentRaw.items)
    ? (currentRaw.items as Array<Record<string, unknown>>)
    : [];
  const byKey = new Map(
    currentItems
      .map((item) => [String(item.key || ""), item] as const)
      .filter(([key]) => Boolean(key)),
  );

  const items = sourceItems.map((source, index) => {
    const key = normalizeInstallationItemKey(source, index);
    const existing = byKey.get(key) ?? {};
    return {
      key,
      sourceIndex: index,
      status: typeof existing.status === "string" ? existing.status : "pendente",
      observacao: typeof existing.observacao === "string" ? existing.observacao : "",
      atualizadoEm: existing.atualizadoEm ?? null,
      atualizadoPor: existing.atualizadoPor ?? null,
    };
  });

  return {
    ...metadata,
    installationChecklist: {
      version: 1,
      generatedFrom: "order_items",
      items,
      updatedAt: new Date().toISOString(),
    },
  };
}

function installationChecklistComplete(metadataInput: unknown) {
  if (!metadataInput || typeof metadataInput !== "object" || Array.isArray(metadataInput)) return false;
  const metadata = metadataInput as Record<string, unknown>;
  const sourceItems = Array.isArray(metadata.itens)
    ? (metadata.itens as Array<Record<string, unknown>>)
    : [];
  if (sourceItems.length === 0) return true;
  const checklist =
    metadata.installationChecklist &&
    typeof metadata.installationChecklist === "object" &&
    !Array.isArray(metadata.installationChecklist)
      ? (metadata.installationChecklist as Record<string, unknown>)
      : null;
  const checklistItems = checklist && Array.isArray(checklist.items)
    ? (checklist.items as Array<Record<string, unknown>>)
    : [];
  if (checklistItems.length < sourceItems.length) return false;
  return checklistItems.every((item) => INSTALLATION_DONE_STATUSES.has(String(item.status || "")));
}

const INSTALLATION_EXCEPTION_STATUSES = new Set([
  "instalado_com_ressalva",
  "nao_instalado",
  "peca_faltante",
  "produto_avariado",
  "divergencia_medida",
  "necessita_retorno",
]);

function installationAttributes(source: Record<string, unknown>) {
  const hidden = new Set([
    "nome", "name", "descricao", "produto", "quantidade", "quantity", "qtd",
    "produtoId", "sku", "propostaItemIndex", "quantidadePedido",
    "preco", "precoUnitario", "valor", "valorUnitario", "subtotal", "total", "custo",
  ]);
  return Object.fromEntries(Object.entries(source).filter(([key, value]) =>
    !hidden.has(key) && value !== null && value !== undefined && value !== ""
  ));
}

function sourceItemCategory(source: Record<string, unknown>) {
  return String(source.categoryKey || source.categoria || source.category || "").trim() || null;
}

function sourceItemProductId(source: Record<string, unknown>) {
  return String(source.produtoId || source.productId || "").trim() || null;
}

function templateScore(
  template: typeof installationChecklistTemplatesTable.$inferSelect,
  source: Record<string, unknown>,
  metadata: Record<string, unknown>,
) {
  const productId = sourceItemProductId(source);
  const category = sourceItemCategory(source);
  const segment = String(source.segmentKey || metadata.segmentKey || metadata.segmento || "").trim() || null;
  const niche = String(source.nicheKey || metadata.nicheKey || metadata.nicho || "").trim() || null;
  let score = 0;
  if (template.productId) score += template.productId === productId ? 100 : -1000;
  if (template.categoryKey) score += template.categoryKey === category ? 40 : -100;
  if (template.nicheKey) score += template.nicheKey === niche ? 20 : -50;
  if (template.segmentKey) score += template.segmentKey === segment ? 10 : -25;
  if (!template.productId && !template.categoryKey && !template.nicheKey && !template.segmentKey) score += 1;
  return score;
}

async function ensureInstallationVisitForCard(card: typeof workCardsTable.$inferSelect, metadataInput?: unknown) {
  const [existingVisit] = await db.select().from(installationVisitsTable)
    .where(and(eq(installationVisitsTable.tenantId, card.tenantId), eq(installationVisitsTable.workCardId, card.id)))
    .orderBy(desc(installationVisitsTable.visitNumber))
    .limit(1);
  if (existingVisit) return existingVisit;

  const metadata =
    metadataInput && typeof metadataInput === "object" && !Array.isArray(metadataInput)
      ? metadataInput as Record<string, unknown>
      : card.metadata ?? {};
  const sourceItems = Array.isArray(metadata.itens)
    ? metadata.itens as Array<Record<string, unknown>>
    : [];

  const [visit] = await db.insert(installationVisitsTable).values({
    tenantId: card.tenantId,
    workCardId: card.id,
    visitNumber: 1,
    status: card.etapa === "instalacao_em_andamento" ? "in_progress" : "scheduled",
    startedAt: card.etapa === "instalacao_em_andamento" ? new Date() : null,
    responsibleId: card.responsavelId,
    teamUserIds: card.responsavelId ? [card.responsavelId] : [],
    metadata: { generatedFrom: "work_card", cardCode: card.codigo },
  }).returning();

  if (sourceItems.length === 0) return visit;

  const templates = await db.select().from(installationChecklistTemplatesTable)
    .where(and(
      eq(installationChecklistTemplatesTable.tenantId, card.tenantId),
      eq(installationChecklistTemplatesTable.active, true),
    ));

  const rows: Array<typeof installationChecklistItemsTable.$inferInsert> = [];
  sourceItems.forEach((source, sourceIndex) => {
    const ranked = templates
      .map((template) => ({ template, score: templateScore(template, source, metadata) }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => b.score - a.score);
    const template = ranked[0]?.template;
    const rules = template?.rules ?? {};
    const checks = template?.checks?.length
      ? template.checks
      : [
          { key: "execution", label: "Instalação/execução conforme pedido", required: true, completed: false },
          { key: "final_check", label: "Conferência final", required: true, completed: false },
        ];
    const rawQty = Number(source.quantidade ?? source.quantity ?? source.qtd ?? 1);
    const quantity = Number.isFinite(rawQty) && rawQty > 0 ? Math.max(1, Math.floor(rawQty)) : 1;
    const expand = rules.expandQuantity === true && quantity <= 200;
    const units = expand ? quantity : 1;
    for (let unit = 0; unit < units; unit += 1) {
      rows.push({
        tenantId: card.tenantId,
        visitId: visit.id,
        workCardId: card.id,
        sourceItemKey: normalizeInstallationItemKey(source, sourceIndex),
        sourceItemIndex: sourceIndex,
        unitIndex: expand ? unit + 1 : null,
        productId: sourceItemProductId(source),
        sku: typeof source.sku === "string" ? source.sku : null,
        productName: String(source.nome || source.name || source.descricao || source.produto || "Item"),
        quantity: expand ? 1 : quantity,
        location: String(source.localizacao || source.location || source.ambiente || "").trim() || null,
        attributes: installationAttributes(source),
        checks,
        status: "pending",
        evidenceRequired: rules.evidenceRequired === true,
        required: rules.required !== false,
      });
    }
  });

  if (rows.length) await db.insert(installationChecklistItemsTable).values(rows);
  return visit;
}

async function normalizedInstallationComplete(card: typeof workCardsTable.$inferSelect) {
  const [latestVisit] = await db.select().from(installationVisitsTable).where(and(
    eq(installationVisitsTable.tenantId, card.tenantId),
    eq(installationVisitsTable.workCardId, card.id),
  )).orderBy(desc(installationVisitsTable.visitNumber)).limit(1);

  if (!latestVisit) return installationChecklistComplete(card.metadata);

  const [items, occurrences, attachments] = await Promise.all([
    db.select().from(installationChecklistItemsTable).where(and(
      eq(installationChecklistItemsTable.tenantId, card.tenantId),
      eq(installationChecklistItemsTable.visitId, latestVisit.id),
    )),
    db.select().from(installationOccurrencesTable).where(and(
      eq(installationOccurrencesTable.tenantId, card.tenantId),
      eq(installationOccurrencesTable.workCardId, card.id),
    )),
    db.select().from(workCardAttachmentsTable).where(and(
      eq(workCardAttachmentsTable.tenantId, card.tenantId),
      eq(workCardAttachmentsTable.workCardId, card.id),
    )),
  ]);

  if (items.length === 0) return installationChecklistComplete(card.metadata);

  const openOccurrence = occurrences.some((occurrence) =>
    occurrence.status === "open" || occurrence.status === "in_progress"
  );
  if (openOccurrence) return false;

  const evidenceItemIds = new Set(
    attachments.map((attachment) => {
      const metadata = attachment.metadata as Record<string, unknown> | null;
      return typeof metadata?.installationChecklistItemId === "string"
        ? metadata.installationChecklistItemId
        : null;
    }).filter(Boolean),
  );

  return items.filter((item) => item.required).every((item) => {
    if (!["installed", "verified", "instalado", "conferido"].includes(item.status)) return false;
    if (item.evidenceRequired && !evidenceItemIds.has(item.id)) return false;
    const checks = Array.isArray(item.checks) ? item.checks as Array<Record<string, unknown>> : [];
    return checks
      .filter((check) => check.required !== false)
      .every((check) => check.completed === true);
  });
}


function deliveryStage(input: {
  status: string;
  dataPrevista?: Date | string | null;
  dataLiberacaoEfetiva?: Date | string | null;
}) {
  if (input.status === "cancelada") return "cancelado";
  if (input.status === "entregue") return "concluido";
  if (input.status === "em_transito") return "em_transporte";
  if (input.dataLiberacaoEfetiva) return "liberado";
  if (input.dataPrevista || input.status === "agendada") return "agenda_entrega";
  return "aguardando_liberacao";
}

function proposalItemIndexFor(
  item: EntregaItem,
  proposalItems: Array<{ nome: string; quantidade: number; sku?: string; produtoId?: string }>,
) {
  if (item.propostaItemIndex !== undefined) {
    return proposalItems[item.propostaItemIndex] ? item.propostaItemIndex : -1;
  }
  if (item.produtoId) {
    const idx = proposalItems.findIndex((p) => p.produtoId && p.produtoId === item.produtoId);
    if (idx >= 0) return idx;
  }
  if (item.sku) {
    const idx = proposalItems.findIndex((p) => p.sku && p.sku === item.sku);
    if (idx >= 0) return idx;
  }
  const normalized = item.nome.trim().toLocaleLowerCase("pt-BR");
  return proposalItems.findIndex((p) => p.nome.trim().toLocaleLowerCase("pt-BR") === normalized);
}


type ExpeditionCheckStatus = "pendente" | "ok" | "divergencia" | "na";

function configuredExpeditionChecks(sourceItem: any): string[] {
  const deliveryConfig = sourceItem?.sourceSnapshot?.deliveryConfig;
  if (!deliveryConfig || typeof deliveryConfig !== "object") return [];
  const configured = (deliveryConfig as Record<string, unknown>).checklistExpedicao
    ?? (deliveryConfig as Record<string, unknown>).checklist;
  if (!Array.isArray(configured)) return [];
  return configured
    .map((entry) => typeof entry === "string" ? entry.trim() : "")
    .filter(Boolean);
}

function expeditionChecksFor(segmento: string | null | undefined, sourceItem: any): string[] {
  const configured = configuredExpeditionChecks(sourceItem);
  if (configured.length) return configured;

  const text = [
    segmento,
    sourceItem?.nome,
    sourceItem?.descricao,
    sourceItem?.sourceSnapshot?.descricao,
  ].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");

  const isEsquadria = [
    "esquadria", "janela", "porta", "vidro", "guarda corpo", "guarda-corpo",
    "alumínio", "aluminio", "pvc", "brise",
  ].some((term) => text.includes(term));

  if (isEsquadria) return ["Marco", "Folha", "Tela", "Vidro", "Fecho", "Acabamento"];
  return ["Identificação", "Quantidade", "Integridade", "Embalagem", "Acabamento"];
}

function buildExpeditionChecklist(input: {
  segmento?: string | null;
  vertical?: string | null;
  deliveryItems: EntregaItem[];
  proposalItems: any[];
}) {
  const checklistItems = input.deliveryItems.map((item) => {
    const sourceIndex = item.propostaItemIndex ?? -1;
    const sourceItem = sourceIndex >= 0 ? input.proposalItems[sourceIndex] : undefined;
    const deliveryConfig = sourceItem?.sourceSnapshot?.deliveryConfig;
    const config = deliveryConfig && typeof deliveryConfig === "object"
      ? deliveryConfig as Record<string, unknown>
      : {};
    const labels = expeditionChecksFor(input.segmento, sourceItem ?? item);
    return {
      propostaItemIndex: item.propostaItemIndex ?? null,
      produtoId: item.produtoId ?? null,
      sku: item.sku ?? null,
      nome: item.nome,
      quantidade: item.quantidade,
      modoConferencia: config.checklistModo === "por_unidade" || config.checklistMode === "per_unit" ? "por_unidade" : "por_lote",
      snapshot: {
        capturedAt: new Date().toISOString(),
        nome: sourceItem?.nome ?? item.nome,
        sku: sourceItem?.sku ?? item.sku ?? null,
        descricao: sourceItem?.descricao ?? sourceItem?.sourceSnapshot?.descricao ?? null,
        produtoId: sourceItem?.produtoId ?? item.produtoId ?? null,
        quantidadePedido: sourceItem?.quantidade ?? item.quantidadePedido ?? null,
      },
      contexto: {
        categoria: typeof config.categoria === "string" ? config.categoria : null,
        nicho: typeof config.nicho === "string" ? config.nicho : null,
      },
      campos: labels.map((label, fieldIndex) => ({
        id: `${item.propostaItemIndex ?? "item"}-${fieldIndex}`,
        key: label.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
        label,
        status: "pendente" as ExpeditionCheckStatus,
        obrigatorio: true,
        observacao: "",
      })),
    };
  });

  const totalCampos = checklistItems.reduce((total, item) => total + item.campos.length, 0);
  return {
    schemaVersion: 1,
    tipo: "expedicao",
    etapa: "liberado",
    status: "pendente",
    contexto: {
      segmento: input.segmento ?? null,
      vertical: input.vertical ?? null,
    },
    totalCampos,
    concluidos: 0,
    divergencias: 0,
    itens: checklistItems,
    verificacaoFinal: {
      totalVolumes: null,
      pesoTotalKg: null,
      nomeVerificador: "",
      data: null,
      observacoes: "",
    },
  };
}


function expeditionGateStatus(metadata: Record<string, unknown> | null | undefined) {
  const raw = metadata?.checklistExpedicao;
  if (!raw || typeof raw !== "object") {
    return { ready: false, reason: "Checklist de expedição ainda não foi gerado." };
  }
  const checklist = raw as {
    status?: string;
    divergencias?: number;
    concluidos?: number;
    totalCampos?: number;
    verificacaoFinal?: { nomeVerificador?: string };
  };
  const divergencias = Number(checklist.divergencias ?? 0);
  const concluidos = Number(checklist.concluidos ?? 0);
  const totalCampos = Number(checklist.totalCampos ?? 0);
  const verifier = checklist.verificacaoFinal?.nomeVerificador?.trim();
  const override = metadata?.expedicaoOverride as { aprovado?: boolean; justificativa?: string; aprovadoPor?: string; aprovadoEm?: string } | undefined;
  if (override?.aprovado && override.justificativa?.trim() && override.aprovadoPor && override.aprovadoEm) {
    return { ready: true as const, reason: null, override: true as const };
  }
  if (divergencias > 0) return { ready: false, reason: `Existem ${divergencias} divergência(s) pendentes na expedição.` };
  if (!totalCampos || concluidos < totalCampos) return { ready: false, reason: "A conferência de expedição ainda possui campos pendentes." };
  if (!verifier) return { ready: false, reason: "Informe o verificador final da expedição." };
  if (checklist.status !== "concluido") return { ready: false, reason: "Finalize o checklist de expedição antes do transporte." };
  return { ready: true as const, reason: null };
}

function buildTransportChecklist(items: Array<{ nome?: string; quantidade?: number; sku?: string | null; produtoId?: string | null }> = []) {
  const labels = [
    "Volumes carregados conferidos",
    "Integridade da carga",
    "Veículo identificado",
    "Motorista identificado",
    "Destino confirmado",
    "Fotos da carga",
  ];
  return {
    schemaVersion: 1,
    tipo: "transporte",
    status: "pendente",
    totalCampos: labels.length,
    concluidos: 0,
    divergencias: 0,
    campos: labels.map((label, index) => ({
      id: `transporte-${index}`,
      key: label.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
      label,
      status: "pendente",
      observacao: "",
    })),
    itens: items.map((item, index) => ({
      id: item.produtoId ?? item.sku ?? `item-${index}`,
      produtoId: item.produtoId ?? null,
      sku: item.sku ?? null,
      nome: item.nome ?? `Item ${index + 1}`,
      quantidadePrevista: Number(item.quantidade ?? 0),
      quantidadeCarregada: null,
      quantidadeRecebida: null,
      ocorrencia: "",
    })),
    saida: {
      veiculo: "",
      placa: "",
      motorista: "",
      horarioSaida: null,
      destino: "",
      lacre: "",
    },
    recebimento: {
      recebidoPor: "",
      recebidoEm: null,
      observacoes: "",
    },
  };
}

async function getProposalForDeal(tenantId: string, dealId: string, propostaId?: string | null) {
  if (propostaId) {
    const [proposal] = await db
      .select()
      .from(propostasTable)
      .where(and(
        eq(propostasTable.id, propostaId),
        eq(propostasTable.tenantId, tenantId),
        eq(propostasTable.dealId, dealId),
      ))
      .limit(1);
    return proposal ?? null;
  }

  const proposals = await db
    .select()
    .from(propostasTable)
    .where(and(eq(propostasTable.tenantId, tenantId), eq(propostasTable.dealId, dealId)))
    .orderBy(desc(propostasTable.createdAt));
  return proposals.find((p) => p.status === "aceita") ?? proposals[0] ?? null;
}

async function getDeliveryBalance(tenantId: string, dealId: string, propostaId?: string | null) {
  const proposal = await getProposalForDeal(tenantId, dealId, propostaId);
  if (!proposal) return { proposal: null, items: [] as Array<Record<string, unknown>> };

  const deliveries = await db
    .select()
    .from(entregasTable)
    .where(and(eq(entregasTable.tenantId, tenantId), eq(entregasTable.dealId, dealId)));

  const active = deliveries.filter((d) => d.status !== "cancelada");
  const items = proposal.itens.map((source, index) => {
    let allocated = 0;
    let delivered = 0;
    let released = 0;

    for (const delivery of active) {
      for (const rawItem of delivery.itens ?? []) {
        const itemIndex = proposalItemIndexFor(rawItem, proposal.itens);
        if (itemIndex !== index) continue;
        allocated += Number(rawItem.quantidade || 0);
        if (delivery.status === "entregue") delivered += Number(rawItem.quantidade || 0);
        if (delivery.dataLiberacaoEfetiva || delivery.status === "em_transito" || delivery.status === "entregue") {
          released += Number(rawItem.quantidade || 0);
        }
      }
    }

    const ordered = Number(source.quantidade || 0);
    return {
      index,
      nome: source.nome,
      sku: source.sku ?? null,
      produtoId: source.produtoId ?? null,
      quantidadePedido: ordered,
      quantidadeAlocada: allocated,
      quantidadeLiberada: released,
      quantidadeEntregue: delivered,
      saldoProgramar: Math.max(0, ordered - allocated),
      saldoEntregar: Math.max(0, ordered - delivered),
    };
  });

  return { proposal, items };
}

async function recordWorkHistory(input: {
  tenantId: string;
  leadId: string | null;
  dealId?: string | null;
  tipo: "tarefa" | "assistencia";
  titulo: string;
  descricao?: string | null;
  responsavelId?: string | null;
  status?: "pendente" | "concluida" | "cancelada" | "planejado";
  dataVencimento?: Date | null;
  anexo?: { nome: string; url: string; mimeType?: string | null; tamanho?: number | null };
}) {
  if (!input.leadId) return;
  await db.insert(activitiesTable).values({
    tenantId: input.tenantId,
    leadId: input.leadId,
    dealId: input.dealId ?? null,
    tipo: input.tipo,
    titulo: input.titulo,
    descricao: input.descricao ?? null,
    status: input.status ?? "concluida",
    responsavelId: input.responsavelId ?? null,
    dataVencimento: input.dataVencimento ?? null,
    ...(input.status === "concluida" || !input.status ? { concluidaEm: new Date() } : {}),
    ...(input.anexo ? {
      anexoNome: input.anexo.nome,
      anexoUrl: input.anexo.url,
      anexoMimeType: input.anexo.mimeType ?? null,
      anexoTamanho: input.anexo.tamanho ?? null,
      anexoCategoria: input.anexo.mimeType?.startsWith("image/") ? "imagem" : "documento",
    } : {}),
  });
}

const WORK_STAGE_TASKS: Record<string, string> = {
  pedido_confirmado: "Revisar pedido confirmado",
  liberacao_financeira: "Validar liberação financeira",
  liberacao_medidas: "Providenciar e confirmar medidas",
  projeto: "Desenvolver/aprovar projeto",
  producao_a_iniciar: "Preparar início da produção",
  producao_em_andamento: "Acompanhar produção",
  producao_finalizada: "Confirmar produção finalizada",
  aguardando_liberacao: "Acompanhar liberação do lote",
  liberado: "Preparar expedição do lote liberado",
  agenda_entrega: "Agendar e confirmar entrega",
  em_transporte: "Acompanhar entrega em transporte",
  instalacao_a_iniciar: "Preparar instalação",
  instalacao_em_andamento: "Acompanhar instalação",
  instalacao_finalizada: "Validar instalação finalizada",
  entrega_obra: "Realizar entrega/aceite da obra",
  pos_venda: "Realizar pós-venda e validar conclusão operacional",
  chamado_cliente: "Triar chamado e confirmar informações",
  agendamento_assistencia: "Agendar assistência",
  execucao_assistencia: "Executar assistência",
  relatorio_assistencia: "Gerar e confirmar relatório da assistência",
  feedback_cliente: "Acompanhar feedback do cliente",
  fechamento_assistencia: "Fechar assistência",
};

async function ensureWorkStageTask(card: typeof workCardsTable.$inferSelect) {
  if (!card.leadId || !card.responsavelId) return;
  const base = WORK_STAGE_TASKS[card.etapa];
  if (!base) return;
  const title = `${base} — ${card.codigo}`;
  const [existingTask] = await db.select({ id: activitiesTable.id }).from(activitiesTable).where(and(
    eq(activitiesTable.tenantId, card.tenantId),
    eq(activitiesTable.leadId, card.leadId),
    eq(activitiesTable.titulo, title),
    eq(activitiesTable.status, "planejado"),
  )).limit(1);
  if (existingTask) return;
  await db.insert(activitiesTable).values({
    tenantId: card.tenantId,
    leadId: card.leadId,
    dealId: card.dealId,
    tipo: card.pipeline === "suporte" ? "assistencia" : "tarefa",
    titulo: title,
    descricao: `Tarefa automática da etapa ${WORK_STAGE_LABELS[card.etapa] ?? card.etapa}.`,
    status: "planejado",
    responsavelId: card.responsavelId,
    dataVencimento: card.dataFimPrevista ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
}

async function maybeCompleteOrder(parentOrChild: typeof workCardsTable.$inferSelect) {
  const parentId = parentOrChild.tipo === "pedido" ? parentOrChild.id : parentOrChild.parentCardId;
  if (!parentId) return;
  const [parent] = await db.select().from(workCardsTable).where(eq(workCardsTable.id, parentId)).limit(1);
  if (!parent || parent.pipeline !== "execucao" || parent.tipo !== "pedido" || parent.etapa !== "pos_venda" || !parent.dealId) return;

  const children = await db.select().from(workCardsTable).where(and(
    eq(workCardsTable.tenantId, parent.tenantId),
    eq(workCardsTable.parentCardId, parent.id),
  ));
  const relevantChildren = children.filter((c) => c.pipeline === "execucao" && c.etapa !== "cancelado");
  const childDone = relevantChildren.every((c) => ["concluido", "instalacao_finalizada"].includes(c.etapa));
  const balance = await getDeliveryBalance(parent.tenantId, parent.dealId, parent.propostaId);
  const itemsDone = balance.proposal ? balance.items.every((item) => Number(item.saldoEntregar ?? 0) <= 0) : true;
  if (!childDone || !itemsDone) return;

  const now = new Date();
  await db.update(workCardsTable).set({ etapa: "concluido", dataFimEfetiva: now, updatedAt: now }).where(eq(workCardsTable.id, parent.id));
  await db.update(dealsTable).set({ etapa: "entregue", updatedAt: now }).where(and(eq(dealsTable.id, parent.dealId), eq(dealsTable.tenantId, parent.tenantId)));
  await recordWorkHistory({
    tenantId: parent.tenantId,
    leadId: parent.leadId,
    dealId: parent.dealId,
    tipo: "tarefa",
    titulo: `${parent.codigo}: pedido operacionalmente concluído`,
    descricao: "Todos os lotes/itens estão concluídos e o pedido já passou pelo Pós-venda.",
    responsavelId: parent.responsavelId,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTREGAS / LOTES PARCIAIS
// ─────────────────────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/entregas", async (req, res) => {
  const { status, dealId, from, to } = req.query as Record<string, string | undefined>;
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const conditions = [eq(entregasTable.tenantId, tenantId)];
  conditions.push(...buildUserFunctionFilter(req, entregasTable));

  if (status) conditions.push(eq(entregasTable.status, status as typeof entregasTable.status._.data));
  if (dealId) conditions.push(eq(entregasTable.dealId, dealId));

  const entregas = await db
    .select()
    .from(entregasTable)
    .where(and(...conditions))
    .orderBy(entregasTable.dataPrevista, entregasTable.createdAt);

  res.json(entregas.filter((e) => {
    if (from && e.dataPrevista && new Date(e.dataPrevista) < new Date(from)) return false;
    if (to && e.dataPrevista && new Date(e.dataPrevista) > new Date(to)) return false;
    return true;
  }));
});

router.get("/tenants/:tenantId/entregas/saldo", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  const dealId = String(req.query.dealId ?? "");
  const propostaId = req.query.propostaId ? String(req.query.propostaId) : undefined;
  if (!dealId) {
    res.status(422).json({ error: "dealId é obrigatório" });
    return;
  }

  const [deal] = await db.select({ id: dealsTable.id }).from(dealsTable)
    .where(and(eq(dealsTable.id, dealId), eq(dealsTable.tenantId, tenantId)));
  if (!deal) {
    res.status(404).json({ error: "Pedido/negócio não encontrado" });
    return;
  }

  const balance = await getDeliveryBalance(tenantId, dealId, propostaId);
  if (!balance.proposal) {
    res.status(404).json({ error: "Nenhum orçamento/pedido com itens foi encontrado para este negócio" });
    return;
  }
  res.json({
    propostaId: balance.proposal.id,
    propostaTitulo: balance.proposal.titulo,
    itens: balance.items,
  });
});

router.post("/tenants/:tenantId/entregas", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const parsed = insertEntregaSchema.safeParse({ ...req.body, tenantId });
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message, issues: parsed.error.issues });
    return;
  }
  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [deal] = await db.select().from(dealsTable)
    .where(and(eq(dealsTable.id, parsed.data.dealId), eq(dealsTable.tenantId, tenantId)));
  if (!deal) {
    res.status(404).json({ error: "Pedido/negócio não encontrado" });
    return;
  }

  const proposal = await getProposalForDeal(tenantId, deal.id, parsed.data.propostaId);
  const allDeliveries = await db.select().from(entregasTable)
    .where(and(eq(entregasTable.tenantId, tenantId), eq(entregasTable.dealId, deal.id)));
  const activeDeliveries = allDeliveries.filter((d) => d.status !== "cancelada");

  let items: EntregaItem[] = [...(parsed.data.itens ?? [])];
  if (!items.length) {
    res.status(422).json({ error: "Selecione ao menos um item/quantidade para este lote" });
    return;
  }

  if (proposal) {
    const normalized: EntregaItem[] = [];
    for (const item of items) {
      const index = proposalItemIndexFor(item, proposal.itens);
      if (index < 0) {
        res.status(422).json({ error: `O item “${item.nome}” não pertence ao pedido selecionado` });
        return;
      }
      const source = proposal.itens[index];
      let alreadyAllocated = 0;
      for (const existingDelivery of activeDeliveries) {
        for (const existingItem of existingDelivery.itens ?? []) {
          if (proposalItemIndexFor(existingItem, proposal.itens) === index) {
            alreadyAllocated += Number(existingItem.quantidade || 0);
          }
        }
      }
      const remaining = Math.max(0, Number(source.quantidade) - alreadyAllocated);
      if (Number(item.quantidade) > remaining + 1e-9) {
        res.status(409).json({
          error: `Quantidade excede o saldo do pedido para “${source.nome}”`,
          item: source.nome,
          quantidadePedido: Number(source.quantidade),
          quantidadeJaAlocada: alreadyAllocated,
          saldoDisponivel: remaining,
          quantidadeSolicitada: Number(item.quantidade),
        });
        return;
      }
      normalized.push({
        ...item,
        nome: source.nome,
        sku: source.sku ?? item.sku,
        produtoId: source.produtoId ?? item.produtoId,
        propostaItemIndex: index,