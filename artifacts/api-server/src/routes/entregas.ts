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
        quantidadePedido: Number(source.quantidade),
      });
    }
    items = normalized;
  }

  const nextLot = Math.max(0, ...allDeliveries.map((d) => d.loteNumero ?? 0)) + 1;
  const data = {
    ...parsed.data,
    propostaId: proposal?.id ?? parsed.data.propostaId ?? null,
    leadId: parsed.data.leadId ?? deal.leadId ?? null,
    loteNumero: parsed.data.loteNumero ?? nextLot,
    itens: items,
  };

  if (data.modo === "agendada" && !data.assignedTo && data.dataPrevista && data.periodo) {
    const motoristaId = await pickNextMotorista(tenantId, new Date(data.dataPrevista), data.periodo);
    if (!motoristaId) {
      res.status(409).json({ error: "Nenhum motorista disponível para esse turno" });
      return;
    }
    data.assignedTo = motoristaId;
    data.status = "agendada";
  } else if (data.assignedTo && data.dataPrevista && data.periodo) {
    const capacity = await checkTurnoCapacity(data.assignedTo, new Date(data.dataPrevista), data.periodo);
    if (!capacity.ok) {
      res.status(409).json({ error: capacity.reason });
      return;
    }
  }

  let [parentCard] = await db.select().from(workCardsTable)
    .where(and(
      eq(workCardsTable.tenantId, tenantId),
      eq(workCardsTable.dealId, deal.id),
      eq(workCardsTable.tipo, "pedido"),
    ))
    .limit(1);
  if (!parentCard) {
    [parentCard] = await db.insert(workCardsTable).values({
      tenantId,
      codigo: `PED-${deal.id.replaceAll("-", "").slice(0, 8).toUpperCase()}`,
      pipeline: "execucao",
      tipo: "pedido",
      etapa: "pedido_confirmado",
      titulo: `Pedido • ${deal.titulo}`,
      leadId: deal.leadId,
      dealId: deal.id,
      responsavelId: deal.assignedTo,
      metadata: { origem: "entrega_parcial" },
    }).returning();
  }

  const [entrega] = await db.insert(entregasTable).values(data).returning();
  const stage = deliveryStage(entrega);
  const [tenantContext] = await db.select({
    segmento: tenantsTable.segmento,
    vertical: tenantsTable.vertical,
  }).from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1);
  const checklistExpedicao = buildExpeditionChecklist({
    segmento: tenantContext?.segmento,
    vertical: tenantContext?.vertical,
    deliveryItems: entrega.itens,
    proposalItems: proposal?.itens ?? [],
  });
  const [card] = await db.insert(workCardsTable).values({
    tenantId,
    codigo: workCode("ENT"),
    pipeline: "execucao",
    tipo: "entrega",
    etapa: stage,
    titulo: `Entrega ${String(entrega.loteNumero ?? nextLot).padStart(2, "0")} • ${deal.titulo}`,
    descricao: entrega.observacoes,
    prioridade: "normal",
    leadId: entrega.leadId,
    dealId: deal.id,
    propostaId: entrega.propostaId,
    entregaId: entrega.id,
    parentCardId: parentCard.id,
    responsavelId: entrega.assignedTo,
    dataInicioPrevista: entrega.dataLiberacaoPrevista,
    dataInicioEfetiva: entrega.dataLiberacaoEfetiva,
    dataFimPrevista: entrega.dataPrevista,
    dataFimEfetiva: entrega.dataEntregue,
    metadata: {
      loteNumero: entrega.loteNumero,
      itens: entrega.itens,
      saldoParcial: true,
      checklistExpedicao,
    },
  }).returning();

  if (entrega.assignedTo && entrega.leadId) {
    await recordWorkHistory({
      tenantId,
      leadId: entrega.leadId,
      dealId: deal.id,
      tipo: "tarefa",
      titulo: `Acompanhar ${card.codigo} — ${card.titulo}`,
      descricao: `Lote parcial criado com ${entrega.itens.length} item(ns). Etapa inicial: ${WORK_STAGE_LABELS[stage] ?? stage}.`,
      responsavelId: entrega.assignedTo,
      status: "planejado",
      dataVencimento: entrega.dataPrevista,
    });
  }

  res.status(201).json({ ...entrega, workCard: card });
});

const dispatchBodySchema = z.object({
  data: z.coerce.date().optional(),
  periodo: z.enum(["manha", "tarde"]).default("tarde"),
});

router.post("/tenants/:tenantId/entregas/dispatch", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const admin = isAdmin(req);
  if (!admin || !canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Apenas administradores podem gerar rotas" });
    return;
  }

  const parsed = dispatchBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message, issues: parsed.error.issues });
    return;
  }

  const deliveryDate = parsed.data.data ?? new Date();
  if (!parsed.data.data && parsed.data.periodo === "manha" && deliveryDate.getHours() >= 12) {
    deliveryDate.setDate(deliveryDate.getDate() + 1);
  }
  if (deliveryDate.getDay() === 0) deliveryDate.setDate(deliveryDate.getDate() + 1);
  deliveryDate.setHours(parsed.data.periodo === "manha" ? 9 : 14, 0, 0, 0);
  const result = await dispatchPendingEntregas(tenantId, deliveryDate, parsed.data.periodo, req.log);
  res.json(result);
});

router.get("/entregas/:id", async (req, res) => {
  const [entrega] = await db.select().from(entregasTable).where(eq(entregasTable.id, String(req.params.id)));
  if (!entrega) {
    res.status(404).json({ error: "Entrega not found" });
    return;
  }
  if (!canAccessTenant(req, entrega.tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  const userFn = req.user?.userFunction as string | undefined;
  if (!isAdmin(req) && userFn === "entrega" && entrega.assignedTo !== req.user?.sub) {
    res.status(403).json({ error: "Access denied to this entrega" });
    return;
  }
  res.json(entrega);
});

router.patch("/entregas/:id", async (req, res) => {
  const parsed = updateEntregaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message, issues: parsed.error.issues });
    return;
  }

  const [existing] = await db.select().from(entregasTable).where(eq(entregasTable.id, String(req.params.id)));
  if (!existing) {
    res.status(404).json({ error: "Entrega not found" });
    return;
  }
  if (!canAccessTenant(req, existing.tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  const userFn = req.user?.userFunction as string | undefined;
  if (!isAdmin(req) && userFn === "entrega" && existing.assignedTo !== req.user?.sub) {
    res.status(403).json({ error: "Acesso negado: esta entrega pertence a outro motorista" });
    return;
  }

  const data = { ...parsed.data };

  if (data.status === "em_transito" && existing.status !== "em_transito") {
    const [preflightCard] = await db.select().from(workCardsTable)
      .where(eq(workCardsTable.entregaId, existing.id)).limit(1);
    if (preflightCard) {
      const gate = expeditionGateStatus(preflightCard.metadata);
      if (!gate.ready) {
        res.status(409).json({
          error: "EXPEDITION_CHECKLIST_REQUIRED_DELIVERY",
          message: gate.reason,
        });
        return;
      }
    }
  }

  if (data.assignedTo && (data.dataPrevista || existing.dataPrevista) && (data.periodo || existing.periodo)) {
    const dataPrevista = new Date(data.dataPrevista ?? existing.dataPrevista!);
    const periodo = (data.periodo ?? existing.periodo) as "manha" | "tarde";
    if (data.assignedTo !== existing.assignedTo) {
      const capacity = await checkTurnoCapacity(data.assignedTo, dataPrevista, periodo);
      if (!capacity.ok) {
        res.status(409).json({ error: capacity.reason });
        return;
      }
    }
  }
  if (data.status === "entregue" && !data.dataEntregue) data.dataEntregue = new Date();

  const [entrega] = await db.update(entregasTable)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(entregasTable.id, existing.id))
    .returning();

  const [linkedCard] = await db.select().from(workCardsTable)
    .where(eq(workCardsTable.entregaId, entrega.id)).limit(1);
  if (linkedCard) {
    const requestedStage = deliveryStage(entrega);
    const nextStage = canAdvanceWorkCard("execucao", linkedCard.etapa, requestedStage) ? requestedStage : linkedCard.etapa;
    const stageChanged = nextStage !== linkedCard.etapa;
    const [updatedCard] = await db.update(workCardsTable).set({
      etapa: nextStage,
      responsavelId: entrega.assignedTo,
      dataInicioPrevista: entrega.dataLiberacaoPrevista,
      dataInicioEfetiva: entrega.dataLiberacaoEfetiva,
      dataFimPrevista: entrega.dataPrevista,
      dataFimEfetiva: entrega.dataEntregue,
      metadata: {
        ...(linkedCard.metadata ?? {}),
        loteNumero: entrega.loteNumero,
        itens: entrega.itens,
        ...(nextStage === "em_transporte" && linkedCard.etapa !== "em_transporte"
          ? { checklistTransporte: (linkedCard.metadata as Record<string, unknown> | null)?.checklistTransporte ?? buildTransportChecklist(entrega.itens) }
          : {}),
      },
      updatedAt: new Date(),
    }).where(eq(workCardsTable.id, linkedCard.id)).returning();

    if (stageChanged) {
      await recordWorkHistory({
        tenantId: entrega.tenantId,
        leadId: entrega.leadId,
        dealId: entrega.dealId,
        tipo: "tarefa",
        titulo: `${updatedCard.codigo}: ${WORK_STAGE_LABELS[nextStage] ?? nextStage}`,
        descricao: `A entrega avançou de ${WORK_STAGE_LABELS[linkedCard.etapa] ?? linkedCard.etapa} para ${WORK_STAGE_LABELS[nextStage] ?? nextStage}.`,
        responsavelId: updatedCard.responsavelId,
      });
    }
  }

  if (entrega && data.status === "entregue" && existing.status !== "entregue") {
    triggerDeliveryFeedbackRequest({ tenantId: entrega.tenantId, entregaId: entrega.id, log: req.log }).catch((err) => {
      req.log.warn({ err, entregaId: entrega.id }, "entregas: falha ao disparar pesquisa de satisfação pós-venda");
    });
  }

  if (linkedCard) await maybeCompleteOrder(linkedCard);
  res.json(entrega);
});

// ─────────────────────────────────────────────────────────────────────────────
// CARDS OPERACIONAIS — EXECUÇÃO E SUPORTE
// ─────────────────────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/work-cards", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  const { pipeline, etapa, leadId, dealId, entregaId, includeClosed } = req.query as Record<string, string | undefined>;
  const conditions = [eq(workCardsTable.tenantId, tenantId)];
  if (pipeline) conditions.push(eq(workCardsTable.pipeline, pipeline));
  if (etapa) conditions.push(eq(workCardsTable.etapa, etapa));
  if (leadId) conditions.push(eq(workCardsTable.leadId, leadId));
  if (dealId) conditions.push(eq(workCardsTable.dealId, dealId));
  if (entregaId) conditions.push(eq(workCardsTable.entregaId, entregaId));
  if (restrictedToOwnWork(req) && req.user?.sub) conditions.push(eq(workCardsTable.responsavelId, req.user.sub));

  const storedCards = await db.select().from(workCardsTable)
    .where(and(...conditions))
    .orderBy(workCardsTable.updatedAt, workCardsTable.createdAt);
  const cards = includeClosed === "1" ? storedCards : storedCards.filter((card) => !TERMINAL_WORK_STAGES.has(card.etapa));

  const leadIds = [...new Set(cards.map((card) => card.leadId).filter((id): id is string => Boolean(id)))];
  const userIds = [...new Set(cards.map((card) => card.responsavelId).filter((id): id is string => Boolean(id)))];
  const dealIds = [...new Set(cards.map((card) => card.dealId).filter((id): id is string => Boolean(id)))];
  const [leadRows, userRows, dealRows] = await Promise.all([
    leadIds.length ? db.select({ id: leadsTable.id, nome: leadsTable.nome, empresa: leadsTable.empresa }).from(leadsTable).where(inArray(leadsTable.id, leadIds)) : Promise.resolve([]),
    userIds.length ? db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email }).from(usersTable).where(inArray(usersTable.id, userIds)) : Promise.resolve([]),
    dealIds.length ? db.select({ id: dealsTable.id, titulo: dealsTable.titulo }).from(dealsTable).where(inArray(dealsTable.id, dealIds)) : Promise.resolve([]),
  ]);
  const leadLabels = new Map(leadRows.map((lead) => [lead.id, lead.nome || lead.empresa || "Cliente"]));
  const userLabels = new Map(userRows.map((user) => [user.id, user.name || user.email || "Responsável"]));
  const dealLabels = new Map(dealRows.map((deal) => [deal.id, deal.titulo]));

  res.json(cards.map((card) => ({
    ...card,
    leadLabel: card.leadId ? leadLabels.get(card.leadId) ?? null : null,
    responsavelLabel: card.responsavelId ? userLabels.get(card.responsavelId) ?? null : null,
    dealTitle: card.dealId ? dealLabels.get(card.dealId) ?? null : null,
  })));
});

router.get("/tenants/:tenantId/leads-overview-context", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const dealConditions = [eq(dealsTable.tenantId, tenantId), ...buildUserFunctionFilter(req, dealsTable)];
  const workConditions = [eq(workCardsTable.tenantId, tenantId)];
  if (restrictedToOwnWork(req) && req.user?.sub) workConditions.push(eq(workCardsTable.responsavelId, req.user.sub));

  const [deals, workCards, proposals, users] = await Promise.all([
    db.select({
      id: dealsTable.id,
      leadId: dealsTable.leadId,
      titulo: dealsTable.titulo,
      etapa: dealsTable.etapa,
      aquecimentoTipo: dealsTable.aquecimentoTipo,
      relationshipStage: dealsTable.relationshipStage,
    }).from(dealsTable).where(and(...dealConditions)),
    db.select({
      id: workCardsTable.id,
      leadId: workCardsTable.leadId,
      codigo: workCardsTable.codigo,
      pipeline: workCardsTable.pipeline,
      etapa: workCardsTable.etapa,
    }).from(workCardsTable).where(and(...workConditions)),
    db.select({ leadId: propostasTable.leadId, valorTotal: propostasTable.valorTotal }).from(propostasTable).where(eq(propostasTable.tenantId, tenantId)),
    db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email }).from(usersTable).where(eq(usersTable.tenantId, tenantId)),
  ]);

  const byLeadId: Record<string, Array<{ pipeline: string; etapa: string; label: string; id: string; codigo?: string }>> = {};
  const push = (leadId: string | null, process: { pipeline: string; etapa: string; label: string; id: string; codigo?: string }) => {
    if (!leadId) return;
    (byLeadId[leadId] ??= []).push(process);
  };
  const commercialLabels: Record<string, string> = {
    novo: "Novo", qualificado: "Qualificado", proposta: "Orçamento", negociacao: "Negociação",
    conferencia_estoque: "Fechamento", contrato: "Contrato",
  };
  const partnerLabels: Record<string, string> = {
    parceiro_identificado: "Parceiro identificado", contato: "Contato", qualificacao: "Qualificação",
    proposta_parceria: "Proposta de parceria", negociacao: "Negociação",
  };

  for (const deal of deals) {
    if (!deal.leadId) continue;
    if (commercialLabels[deal.etapa]) {
      push(deal.leadId, { pipeline: "comercial", etapa: deal.etapa, label: commercialLabels[deal.etapa], id: deal.id });
      continue;
    }
    if (deal.etapa === "em_aquecimento" && deal.relationshipStage !== "aquecimento_retomado") {
      push(deal.leadId, { pipeline: "aquecimento", etapa: deal.relationshipStage || "aquecimento_lead", label: deal.aquecimentoTipo === "cliente" ? "Cliente em aquecimento" : "Lead em aquecimento", id: deal.id });
      continue;
    }
    if (deal.etapa === "parceiro" && !["parceiro_ativo", "inativo"].includes(deal.relationshipStage || "parceiro_identificado")) {
      const relationshipStage = deal.relationshipStage || "parceiro_identificado";
      push(deal.leadId, { pipeline: "parceiros", etapa: relationshipStage, label: partnerLabels[relationshipStage] || relationshipStage, id: deal.id });
    }
  }
  for (const card of workCards) {
    if (!card.leadId || TERMINAL_WORK_STAGES.has(card.etapa)) continue;
    push(card.leadId, {
      pipeline: card.pipeline,
      etapa: card.etapa,
      label: WORK_STAGE_LABELS[card.etapa] ?? card.etapa,
      id: card.id,
      codigo: card.codigo,
    });
  }

  const proposalTotalsByLeadId: Record<string, string> = {};
  for (const proposal of proposals) {
    if (!proposal.leadId || !proposal.valorTotal) continue;
    const current = Number(proposalTotalsByLeadId[proposal.leadId] || 0);
    const next = Number(proposal.valorTotal || 0);
    if (next > current) proposalTotalsByLeadId[proposal.leadId] = proposal.valorTotal;
  }
  const userLabelsById = Object.fromEntries(users.map((user) => [user.id, user.name || user.email || user.id]));
  res.json({ activeProcessesByLeadId: byLeadId, proposalTotalsByLeadId, userLabelsById });
});

router.post("/tenants/:tenantId/work-cards", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  const parsed = insertWorkCardSchema.safeParse({ ...req.body, tenantId });
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message, issues: parsed.error.issues });
    return;
  }
  if (parsed.data.pipeline === "suporte" && !parsed.data.responsavelId) {
    res.status(422).json({ error: "Assistência/suporte exige um responsável" });
    return;
  }
  if (parsed.data.pipeline === "execucao" && !EXECUTION_STAGES.includes(parsed.data.etapa as typeof EXECUTION_STAGES[number])) {
    res.status(422).json({ error: "Etapa inválida para pipeline de execução" });
    return;
  }
  if (parsed.data.pipeline === "suporte" && !SUPPORT_STAGES.includes(parsed.data.etapa as typeof SUPPORT_STAGES[number])) {
    res.status(422).json({ error: "Etapa inválida para pipeline de suporte" });
    return;
  }

  const [card] = await db.insert(workCardsTable).values(parsed.data).returning();
  if (card.leadId) {
    await recordWorkHistory({
      tenantId,
      leadId: card.leadId,
      dealId: card.dealId,
      tipo: card.pipeline === "suporte" ? "assistencia" : "tarefa",
      titulo: `${card.codigo} — ${card.titulo}`,
      descricao: card.descricao,
      responsavelId: card.responsavelId,
      status: "planejado",
      dataVencimento: card.dataFimPrevista,
    });
  }
  res.status(201).json(card);
});

const supportCaseSchema = z.object({
  leadId: z.string().min(1),
  dealId: z.string().optional().nullable(),
  propostaId: z.string().optional().nullable(),
  titulo: z.string().trim().min(2).max(200),
  relato: z.string().trim().min(10).max(10000),
  categoria: z.enum(SUPPORT_CATEGORIES),
  produtos: z.array(z.string().trim().min(1)).max(50).default([]),
  responsavelId: z.string().min(1),
  prioridade: z.enum(["baixa", "normal", "alta", "urgente"]).default("normal"),
  dataVencimento: z.coerce.date().optional(),
  origem: z.enum(["humano", "ia", "whatsapp", "telefone", "presencial"]).default("humano"),
});

router.post("/tenants/:tenantId/support-cases", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  const parsed = supportCaseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message, issues: parsed.error.issues });
    return;
  }

  const [lead] = await db.select({
    id: leadsTable.id,
    nome: leadsTable.nome,
    empresa: leadsTable.empresa,
    telefone: leadsTable.telefone,
    endereco: leadsTable.endereco,
    tipoPessoa: leadsTable.tipoPessoa,
    dadosPj: leadsTable.dadosPj,
  })
    .from(leadsTable)
    .where(and(eq(leadsTable.id, parsed.data.leadId), eq(leadsTable.tenantId, tenantId)));
  if (!lead) {
    res.status(404).json({ error: "Cliente não encontrado" });
    return;
  }
  const [responsavel] = await db.select({ id: usersTable.id, name: usersTable.name, telefone: usersTable.telefone })
    .from(usersTable)
    .where(and(eq(usersTable.id, parsed.data.responsavelId), eq(usersTable.tenantId, tenantId)));
  if (!responsavel) {
    res.status(422).json({ error: "Responsável não pertence a este tenant" });
    return;
  }

  if (parsed.data.dealId) {
    const [deal] = await db.select({ id: dealsTable.id }).from(dealsTable)
      .where(and(eq(dealsTable.id, parsed.data.dealId), eq(dealsTable.tenantId, tenantId)));
    if (!deal) {
      res.status(422).json({ error: "Pedido/negócio informado não pertence a este cliente/tenant" });
      return;
    }
  }

  const codigo = workCode("AST");
  const [card] = await db.insert(workCardsTable).values({
    tenantId,
    codigo,
    pipeline: "suporte",
    tipo: "assistencia",
    etapa: "chamado_cliente",
    titulo: parsed.data.titulo,
    descricao: parsed.data.relato,
    prioridade: parsed.data.prioridade,
    leadId: parsed.data.leadId,
    dealId: parsed.data.dealId ?? null,
    propostaId: parsed.data.propostaId ?? null,
    responsavelId: parsed.data.responsavelId,
    dataFimPrevista: parsed.data.dataVencimento ?? null,
    metadata: {
      categoria: parsed.data.categoria,
      relato: parsed.data.relato,
      produtos: parsed.data.produtos,
      origem: parsed.data.origem,
      substatus: null,
    },
  }).returning();

  const [activity] = await db.insert(activitiesTable).values({
    tenantId,
    leadId: parsed.data.leadId,
    dealId: parsed.data.dealId ?? null,
    tipo: "assistencia",
    titulo: `${codigo} — ${parsed.data.titulo}`,
    descricao: [
      `Categoria: ${parsed.data.categoria}`,
      parsed.data.produtos.length ? `Itens/produtos: ${parsed.data.produtos.join(", ")}` : null,
      `Relato: ${parsed.data.relato}`,
    ].filter(Boolean).join("\n"),
    status: "planejado",
    dataVencimento: parsed.data.dataVencimento ?? null,
    responsavelId: parsed.data.responsavelId,
  }).returning();

  if (responsavel.telefone) {
    const clienteNome = lead.empresa || lead.nome || "Cliente";
    const socios = Array.isArray((lead.dadosPj as { socios?: unknown } | null)?.socios)
      ? ((lead.dadosPj as { socios?: Array<{ nome?: string | null; telefone?: string | null }> }).socios ?? [])
      : [];
    const contatoNome = lead.empresa ? lead.nome : (lead.tipoPessoa === "juridica" ? socios[0]?.nome ?? null : null);
    const contatoTelefone = lead.telefone || socios[0]?.telefone || null;
    const dataPrevista = parsed.data.dataVencimento
      ? parsed.data.dataVencimento.toLocaleDateString("pt-BR", { timeZone: "UTC" })
      : "Não informada";
    const whatsappText = [
      `🛠️ Nova assistência ${codigo}`,
      `Cliente: ${clienteNome}`,
      contatoNome && contatoNome !== clienteNome ? `Contato: ${contatoNome}` : null,
      contatoTelefone ? `Telefone: ${contatoTelefone}` : null,
      lead.endereco ? `Endereço: ${lead.endereco}` : null,
      `Data prevista: ${dataPrevista}`,
      `Categoria: ${parsed.data.categoria}`,
      `Prioridade: ${parsed.data.prioridade}`,
      `Responsável: ${responsavel.name || "não informado"}`,
      `Relato: ${parsed.data.relato}`,
      `🔗 Abrir atendimento: https://app.appvendorai.com/pipeline-operacional/suporte?card=${encodeURIComponent(card.id)}`,
    ].filter(Boolean).join("\n");
    sendDirectWhatsAppMessage(tenantId, responsavel.telefone, whatsappText, req.log).catch((err) => {
      req.log.warn({ err, workCardId: card.id }, "support-case: WhatsApp do responsável não enviado (não fatal)");
    });
  }

  res.status(201).json({ card, activity });
});

router.get("/work-cards/:id", async (req, res) => {
  const [card] = await db.select().from(workCardsTable).where(eq(workCardsTable.id, String(req.params.id)));
  if (!card) {
    res.status(404).json({ error: "Card operacional não encontrado" });
    return;
  }
  if (!canAccessTenant(req, card.tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  if (restrictedToOwnWork(req) && card.responsavelId && card.responsavelId !== req.user?.sub) {
    res.status(403).json({ error: "Este card pertence a outro responsável" });
    return;
  }
  res.json(card);
});

router.patch("/work-cards/:id", async (req, res) => {
  const parsed = updateWorkCardSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message, issues: parsed.error.issues });
    return;
  }
  const [existing] = await db.select().from(workCardsTable).where(eq(workCardsTable.id, String(req.params.id)));
  if (!existing) {
    res.status(404).json({ error: "Card operacional não encontrado" });
    return;
  }
  if (!canAccessTenant(req, existing.tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  if (restrictedToOwnWork(req) && existing.responsavelId && existing.responsavelId !== req.user?.sub) {
    res.status(403).json({ error: "Este card pertence a outro responsável" });
    return;
  }

  const targetPipeline = parsed.data.pipeline ?? existing.pipeline;
  const targetStage = parsed.data.etapa ?? existing.etapa;
  if (parsed.data.pipeline && parsed.data.pipeline !== existing.pipeline) {
    res.status(409).json({ error: "CARD_PIPELINE_IMMUTABLE", message: "Um card não muda de pipeline. A transferência cria um novo processo vinculado ao anterior." });
    return;
  }
  const manualAdminCorrection =
    targetStage !== existing.etapa
    && !canAdvanceWorkCard(existing.pipeline, existing.etapa, targetStage)
    && isAdmin(req);

  if (targetStage !== existing.etapa && !canAdvanceWorkCard(existing.pipeline, existing.etapa, targetStage) && !manualAdminCorrection) {
    res.status(409).json({ error: "CARD_BACKWARD_FORBIDDEN", message: "O card só pode avançar. Administradores podem corrigir manualmente a etapa quando necessário." });
    return;
  }
  if (targetPipeline === "execucao" && !EXECUTION_STAGES.includes(targetStage as typeof EXECUTION_STAGES[number])) {
    res.status(422).json({ error: "Etapa inválida para pipeline de execução" });
    return;
  }
  if (targetPipeline === "suporte" && !SUPPORT_STAGES.includes(targetStage as typeof SUPPORT_STAGES[number])) {
    res.status(422).json({ error: "Etapa inválida para pipeline de suporte" });
    return;
  }
  if (targetPipeline === "suporte" && parsed.data.responsavelId === null) {
    res.status(422).json({ error: "Card de suporte não pode ficar sem responsável" });
    return;
  }

  const advancingExecutionStage =
    targetPipeline === "execucao"
    && targetStage !== existing.etapa
    && targetStage !== "cancelado"
    && canAdvanceWorkCard(existing.pipeline, existing.etapa, targetStage)
    && !manualAdminCorrection;
  if (advancingExecutionStage) {
    const missing = missingTransitionRequirements(existing, targetStage);
    if (missing.length > 0) {
      res.status(409).json({
        error: "STAGE_REQUIREMENTS_PENDING",
        message: "Conclua os requisitos obrigatórios das etapas anteriores antes de avançar.",
        stage: existing.etapa,
        missing,
      });
      return;
    }
  }

  const data: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  if (existing.pipeline === "execucao" && existing.tipo === "entrega" && targetStage === "em_transporte" && existing.etapa !== "em_transporte") {
    const metadata = (data.metadata as Record<string, unknown> | undefined) ?? existing.metadata ?? {};
    data.metadata = {
      ...metadata,
      checklistTransporte: metadata.checklistTransporte ?? buildTransportChecklist(
        Array.isArray(metadata.itens) ? metadata.itens as Array<{ nome?: string; quantidade?: number; sku?: string | null; produtoId?: string | null }> : [],
      ),
    };
  }
  const starting = ["producao_em_andamento", "em_transporte", "instalacao_em_andamento", "execucao_assistencia"].includes(targetStage);
  const finishing = ["concluido", "entrega_obra", "instalacao_finalizada", "fechamento_assistencia"].includes(targetStage);
  if (starting && !existing.dataInicioEfetiva && !parsed.data.dataInicioEfetiva) data.dataInicioEfetiva = new Date();
  if (finishing && !existing.dataFimEfetiva && !parsed.data.dataFimEfetiva) data.dataFimEfetiva = new Date();

  if (parsed.data.metadata) {
    const previousMetadata = existing.metadata ?? {};
    const nextMetadata = data.metadata as Record<string, unknown>;
    const expeditionChanged = JSON.stringify(previousMetadata.checklistExpedicao ?? null) !== JSON.stringify(nextMetadata.checklistExpedicao ?? null);
    const transportChanged = JSON.stringify(previousMetadata.checklistTransporte ?? null) !== JSON.stringify(nextMetadata.checklistTransporte ?? null);
    if (expeditionChanged || transportChanged) {
      const previousAudit = Array.isArray(previousMetadata.operationalAudit) ? previousMetadata.operationalAudit : [];
      data.metadata = {
        ...nextMetadata,
        operationalAudit: [
          ...previousAudit,
          {
            at: new Date().toISOString(),
            userId: req.user?.sub ?? null,
            action: (nextMetadata.expedicaoOverride && JSON.stringify(previousMetadata.expedicaoOverride ?? null) !== JSON.stringify(nextMetadata.expedicaoOverride ?? null))
              ? "expedicao_liberada_com_ressalva"
              : expeditionChanged ? "checklist_expedicao_atualizado" : "checklist_transporte_atualizado",
          },
        ].slice(-200),
      };
    }
  }

  const [card] = await db.update(workCardsTable).set(data).where(eq(workCardsTable.id, existing.id)).returning();

  if (
    card.pipeline === "execucao"
    && ["instalacao_a_iniciar", "instalacao_em_andamento"].includes(card.etapa)
  ) {
    await ensureInstallationVisitForCard(card, normalizedMetadata);
  }

  if (card.etapa !== existing.etapa && card.leadId) {
    await recordWorkHistory({
      tenantId: card.tenantId,
      leadId: card.leadId,
      dealId: card.dealId,
      tipo: card.pipeline === "suporte" ? "assistencia" : "tarefa",
      titulo: `${card.codigo}: ${WORK_STAGE_LABELS[card.etapa] ?? card.etapa}`,
      descricao: [
        `Etapa anterior: ${WORK_STAGE_LABELS[existing.etapa] ?? existing.etapa}. Nova etapa: ${WORK_STAGE_LABELS[card.etapa] ?? card.etapa}.`,
        manualAdminCorrection ? "Alteração manual/correção realizada por administrador." : null,
      ].filter(Boolean).join(" "),
      responsavelId: card.responsavelId,
    });
    await ensureWorkStageTask(card);
    if (card.pipeline === "suporte" && card.etapa === "feedback_cliente") {
      void requestSupportFeedback(card.tenantId, card.id, req.log);
    }
    if (card.pipeline === "execucao") await maybeCompleteOrder(card);
  }

  if (card.leadId && card.etapa === existing.etapa) {
    const changedFields: string[] = [];
    if (card.titulo !== existing.titulo) changedFields.push("título");
    if (card.descricao !== existing.descricao) changedFields.push("observações");
    if (card.prioridade !== existing.prioridade) changedFields.push("prioridade");
    if (card.responsavelId !== existing.responsavelId) changedFields.push("responsável");
    if (String(card.dataInicioPrevista ?? "") !== String(existing.dataInicioPrevista ?? "")) changedFields.push("início previsto");
    if (String(card.dataInicioEfetiva ?? "") !== String(existing.dataInicioEfetiva ?? "")) changedFields.push("início efetivo");
    if (String(card.dataFimPrevista ?? "") !== String(existing.dataFimPrevista ?? "")) changedFields.push("fim previsto");
    if (String(card.dataFimEfetiva ?? "") !== String(existing.dataFimEfetiva ?? "")) changedFields.push("fim efetivo");
    if (JSON.stringify((card.metadata as any)?.stageGates ?? {}) !== JSON.stringify((existing.metadata as any)?.stageGates ?? {})) changedFields.push("requisitos da etapa");
    if (changedFields.length > 0) {
      await recordWorkHistory({
        tenantId: card.tenantId,
        leadId: card.leadId,
        dealId: card.dealId,
        tipo: card.pipeline === "suporte" ? "assistencia" : "tarefa",
        titulo: `${card.codigo}: edição manual`,
        descricao: `Campos alterados manualmente: ${changedFields.join(", ")}.`,
        responsavelId: card.responsavelId,
      });
    }
  }

  res.json(card);
});


router.post("/work-cards/:id/stage-form/complete", async (req, res) => {
  const parsed = stageFormCompleteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message, issues: parsed.error.issues });
    return;
  }
  const [card] = await db.select().from(workCardsTable).where(eq(workCardsTable.id, String(req.params.id))).limit(1);
  if (!card || card.pipeline !== "execucao") {
    res.status(404).json({ error: "Card de execução não encontrado" });
    return;
  }
  if (!canAccessTenant(req, card.tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  if (restrictedToOwnWork(req) && card.responsavelId && card.responsavelId !== req.user?.sub) {
    res.status(403).json({ error: "Este card pertence a outro responsável" });
    return;
  }
  const required = EXECUTION_STAGE_REQUIREMENTS[card.etapa] ?? [];
  if (!required.includes(parsed.data.key)) {
    res.status(409).json({ error: "FORM_NOT_REQUIRED_FOR_STAGE", message: "Este formulário não pertence à etapa atual." });
    return;
  }
  const validationError = stageFormDataValid(parsed.data.key, parsed.data.data);
  if (validationError) {
    res.status(422).json({ error: "FORM_INCOMPLETE", message: validationError });
    return;
  }

  const metadata = (card.metadata ?? {}) as Record<string, unknown>;
  const currentForms = metadata.stageForms && typeof metadata.stageForms === "object"
    ? { ...(metadata.stageForms as Record<string, unknown>) }
    : {};
  const currentGates = metadata.stageGates && typeof metadata.stageGates === "object"
    ? { ...(metadata.stageGates as Record<string, unknown>) }
    : {};
  const previous = currentForms[parsed.data.key] && typeof currentForms[parsed.data.key] === "object"
    ? currentForms[parsed.data.key] as Record<string, unknown>
    : {};
  const version = Number(previous.version ?? 0) + 1;
  const completedAt = new Date().toISOString();

  currentForms[parsed.data.key] = {
    version,
    data: parsed.data.data,
    completedAt,
    completedBy: req.user?.sub ?? null,
    stage: card.etapa,
  };
  currentGates[parsed.data.key] = {
    completed: true,
    completedAt,
    completedBy: req.user?.sub ?? null,
    stage: card.etapa,
    source: "stage_form",
    version,
  };

  const [updated] = await db.update(workCardsTable).set({
    metadata: { ...metadata, stageForms: currentForms, stageGates: currentGates },
    updatedAt: new Date(),
  }).where(eq(workCardsTable.id, card.id)).returning();

  if (card.leadId) {
    await recordWorkHistory({
      tenantId: card.tenantId,
      leadId: card.leadId,
      dealId: card.dealId,
      tipo: "tarefa",
      titulo: `${card.codigo}: formulário da etapa concluído`,
      descricao: `Requisito ${parsed.data.key} concluído pela versão ${version} do formulário.`,
      responsavelId: card.responsavelId,
    });
  }
  res.json({ card: updated, key: parsed.data.key, version });
});

router.post("/work-cards/:id/delivery-acceptance/confirm", async (req, res) => {
  const parsed = deliveryAcceptanceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message, issues: parsed.error.issues });
    return;
  }
  const [card] = await db.select().from(workCardsTable).where(eq(workCardsTable.id, String(req.params.id))).limit(1);
  if (!card || card.pipeline !== "execucao") {
    res.status(404).json({ error: "Card de execução não encontrado" });
    return;
  }
  if (!canAccessTenant(req, card.tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  if (restrictedToOwnWork(req) && card.responsavelId && card.responsavelId !== req.user?.sub) {
    res.status(403).json({ error: "Este card pertence a outro responsável" });
    return;
  }
  if (card.etapa !== "entrega_obra") {
    res.status(409).json({ error: "DELIVERY_ACCEPTANCE_STAGE_REQUIRED", message: "O aceite só pode ser concluído na etapa Entrega da obra." });
    return;
  }
  const nonConforming = parsed.data.items.filter((item) =>
    [item.installation, item.functionality, item.interiorFinish, item.exteriorFinish, item.status].includes("nao_conforme")
  );
  if (nonConforming.some((item) => !item.observation?.trim())) {
    res.status(422).json({ error: "NON_CONFORMITY_OBSERVATION_REQUIRED", message: "Toda não conformidade exige observação." });
    return;
  }
  if (nonConforming.some((item) => item.evidenceAttachmentIds.length === 0)) {
    res.status(422).json({ error: "NON_CONFORMITY_EVIDENCE_REQUIRED", message: "Toda não conformidade exige ao menos uma evidência anexada." });
    return;
  }
  if (parsed.data.receiver.role === "delegado" && !parsed.data.receiver.authorization?.trim()) {
    res.status(422).json({ error: "DELEGATE_AUTHORIZATION_REQUIRED", message: "Informe como a pessoa foi autorizada pelo cliente." });
    return;
  }

  const [lead] = card.leadId
    ? await db.select({
        nome: leadsTable.nome, empresa: leadsTable.empresa, telefone: leadsTable.telefone, endereco: leadsTable.endereco,
      }).from(leadsTable).where(and(eq(leadsTable.id, card.leadId), eq(leadsTable.tenantId, card.tenantId))).limit(1)
    : [];
  const signedAt = new Date();
  const metadata = (card.metadata ?? {}) as Record<string, unknown>;
  const previous = metadata.deliveryAcceptance && typeof metadata.deliveryAcceptance === "object"
    ? metadata.deliveryAcceptance as Record<string, unknown>
    : {};
  const version = Number(previous.version ?? 0) + 1;
  const acceptanceId = randomUUID();

  const pdf = await generateDeliveryAcceptancePdf({
    code: `${card.codigo}-R${version}`,
    title: card.titulo,
    client: lead?.empresa || lead?.nome || card.leadId || "Cliente",
    order: card.dealId,
    address: lead?.endereco ?? null,
    receiverName: parsed.data.receiver.name,
    receiverDocument: parsed.data.receiver.document,
    receiverRole: parsed.data.receiver.role,
    acceptanceType: parsed.data.acceptanceType,
    observations: parsed.data.observations,
    items: parsed.data.items,
    clientSignatureDataUrl: parsed.data.signatures.client.dataUrl,
    companySignatureDataUrl: parsed.data.signatures.company.dataUrl,
    companySignerName: parsed.data.signatures.company.name,
    signedAt,
  });

  let documentUrl: string | null = null;
  let attachmentId: string | null = null;
  try {
    const stored = await objectStorage.savePrivateBuffer(
      pdf,
      "application/pdf",
      `Termo-de-Entrega-e-Aceite-${card.codigo}-R${version}.pdf`,
    );
    documentUrl = `/api/storage${stored}`;
    const [attachment] = await db.insert(workCardAttachmentsTable).values({
      tenantId: card.tenantId,
      workCardId: card.id,
      leadId: card.leadId,
      criadoPor: req.user?.sub ?? null,
      origem: "entrega_aceite",
      nome: `Termo de Entrega e Aceite - ${card.codigo} - R${version}.pdf`,
      url: documentUrl,
      mimeType: "application/pdf",
      tamanho: pdf.length,
      descricao: "Termo de entrega, vistoria e aceite assinado digitalmente.",
      metadata: { kind: "termo_entrega_aceite", acceptanceId, version, immutable: true },
    }).returning();
    attachmentId = attachment.id;
  } catch (error) {
    req.log.warn({ err: error, workCardId: card.id }, "delivery-acceptance: storage indisponível; arquivando PDF como data URL");
    documentUrl = `data:application/pdf;base64,${pdf.toString("base64")}`;
    const [attachment] = await db.insert(workCardAttachmentsTable).values({
      tenantId: card.tenantId,
      workCardId: card.id,
      leadId: card.leadId,
      criadoPor: req.user?.sub ?? null,
      origem: "entrega_aceite",
      nome: `Termo de Entrega e Aceite - ${card.codigo} - R${version}.pdf`,
      url: documentUrl,
      mimeType: "application/pdf",
      tamanho: pdf.length,
      descricao: "Termo de entrega, vistoria e aceite assinado digitalmente.",
      metadata: { kind: "termo_entrega_aceite", acceptanceId, version, immutable: true, storageFallback: "data_url" },
    }).returning();
    attachmentId = attachment.id;
  }

  const completedAt = signedAt.toISOString();
  const currentGates = metadata.stageGates && typeof metadata.stageGates === "object"
    ? { ...(metadata.stageGates as Record<string, unknown>) }
    : {};
  currentGates.vistoria_aceite = {
    completed: true,
    completedAt,
    completedBy: req.user?.sub ?? null,
    stage: card.etapa,
    source: "delivery_acceptance",
    version,
  };
  const acceptance = {
    id: acceptanceId,
    version,
    immutable: true,
    ...parsed.data,
    signedAt: completedAt,
    signedBy: req.user?.sub ?? null,
    generatedDocumentAttachmentId: attachmentId,
    documentUrl,
  };

  const manualAttachments = parsed.data.manualAttachmentIds.length
    ? await db.select().from(workCardAttachmentsTable).where(and(
        eq(workCardAttachmentsTable.workCardId, card.id),
        inArray(workCardAttachmentsTable.id, parsed.data.manualAttachmentIds),
      ))
    : [];
  let packageSent = false;
  let packageSendError: string | null = null;
  const publicDocumentUrl = Boolean(documentUrl && !documentUrl.startsWith("data:"));
  if (
    lead?.telefone
    && publicDocumentUrl
    && parsed.data.manualAttachmentIds.length > 0
    && manualAttachments.length === parsed.data.manualAttachmentIds.length
  ) {
    try {
      await sendDirectWhatsAppMessage(
        card.tenantId,
        lead.telefone,
        [
          "✅ Entrega e vistoria concluídas.",
          `Termo assinado: ${documentUrl}`,
          ...manualAttachments.map((attachment) => `Manual: ${attachment.url}`),
        ].join("\n"),
        req.log,
      );
      packageSent = true;
      currentGates.pacote_entrega = {
        completed: true,
        completedAt,
        completedBy: req.user?.sub ?? null,
        stage: "pos_venda",
        source: "delivery_acceptance_auto_package",
      };
    } catch (error) {
      packageSendError = error instanceof Error ? error.message : String(error);
      req.log.warn({ err: error, workCardId: card.id }, "delivery-acceptance: pacote automático não enviado; pós-venda ficará pendente");
    }
  }

  const deliveryPackage = {
    status: packageSent ? "sent" : "pending",
    attemptedAt: completedAt,
    sentAt: packageSent ? completedAt : null,
    sentBy: packageSent ? (req.user?.sub ?? null) : null,
    channel: "whatsapp",
    termAttachmentId: attachmentId,
    manualAttachmentIds: parsed.data.manualAttachmentIds,
    error: packageSendError,
  };

  const [updated] = await db.update(workCardsTable).set({
    etapa: "pos_venda",
    metadata: {
      ...metadata,
      stageGates: currentGates,
      deliveryAcceptance: acceptance,
      deliveryPackage,
    },
    updatedAt: signedAt,
  }).where(eq(workCardsTable.id, card.id)).returning();

  if (card.leadId) {
    await recordWorkHistory({
      tenantId: card.tenantId,
      leadId: card.leadId,
      dealId: card.dealId,
      tipo: "tarefa",
      titulo: `${card.codigo}: entrega vistoriada e assinada`,
      descricao: [
        `Aceite ${parsed.data.acceptanceType === "sem_ressalvas" ? "sem ressalvas" : "com ressalvas"} · versão R${version} · recebedor: ${parsed.data.receiver.name}.`,
        "Card avançado automaticamente para Pós-venda.",
        packageSent ? `Pacote com termo e ${manualAttachments.length} manual(is) enviado automaticamente.` : "Pacote de entrega pendente de envio.",
      ].join(" "),
      responsavelId: card.responsavelId,
    });
  }

  res.json({
    card: updated,
    acceptance,
    pdfStored: Boolean(documentUrl),
    publicDocumentUrl,
    documentUrl,
    attachmentId,
    advancedToPostSale: true,
    packageSent,
    packagePending: !packageSent,
  });
});

router.post("/work-cards/:id/delivery-package/send", async (req, res) => {
  const bodySchema = z.object({ manualAttachmentIds: z.array(z.string()).min(1) });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "MANUAL_REQUIRED", message: "Selecione ao menos um manual para o pacote de entrega." });
    return;
  }
  const [card] = await db.select().from(workCardsTable).where(eq(workCardsTable.id, String(req.params.id))).limit(1);
  if (!card || card.pipeline !== "execucao") { res.status(404).json({ error: "Card não encontrado" }); return; }
  if (!canAccessTenant(req, card.tenantId)) { res.status(403).json({ error: "Access denied to this tenant" }); return; }
  if (card.etapa !== "pos_venda") {
    res.status(409).json({ error: "POST_SALE_STAGE_REQUIRED", message: "O pacote de entrega é enviado na etapa Pós-venda." });
    return;
  }
  const acceptance = (card.metadata as Record<string, unknown> | null)?.deliveryAcceptance as any;
  if (!acceptance?.generatedDocumentAttachmentId) {
    res.status(409).json({ error: "SIGNED_TERM_REQUIRED", message: "O termo de entrega assinado precisa existir antes do envio do pacote." });
    return;
  }
  const [lead] = card.leadId
    ? await db.select({ nome: leadsTable.nome, empresa: leadsTable.empresa, telefone: leadsTable.telefone })
        .from(leadsTable).where(and(eq(leadsTable.id, card.leadId), eq(leadsTable.tenantId, card.tenantId))).limit(1)
    : [];
  if (!lead?.telefone) {
    res.status(422).json({ error: "CLIENT_PHONE_REQUIRED", message: "O cliente precisa ter telefone para receber o pacote pelo WhatsApp." });
    return;
  }
  const attachmentIds = [acceptance.generatedDocumentAttachmentId, ...parsed.data.manualAttachmentIds];
  const attachments = await db.select().from(workCardAttachmentsTable).where(and(
    eq(workCardAttachmentsTable.workCardId, card.id),
    inArray(workCardAttachmentsTable.id, attachmentIds),
  ));
  const term = attachments.find((a) => a.id === acceptance.generatedDocumentAttachmentId);
  const manuals = attachments.filter((a) => parsed.data.manualAttachmentIds.includes(a.id));
  if (!term || manuals.length !== parsed.data.manualAttachmentIds.length) {
    res.status(422).json({ error: "PACKAGE_ATTACHMENTS_INVALID", message: "Um ou mais documentos do pacote não foram encontrados neste card." });
    return;
  }
  if (term.url.startsWith("data:")) {
    res.status(409).json({
      error: "PUBLIC_DOCUMENT_URL_REQUIRED",
      message: "O PDF está arquivado internamente, mas o storage público de homologação não está disponível para envio por WhatsApp.",
    });
    return;
  }

  await sendDirectWhatsAppMessage(
    card.tenantId,
    lead.telefone,
    [
      "✅ Pacote de entrega",
      `Cliente: ${lead.empresa || lead.nome || "Cliente"}`,
      `Termo assinado: ${term.url}`,
      ...manuals.map((attachment) => `Manual: ${attachment.url}`),
    ].join("\n"),
    req.log,
  );

  const metadata = (card.metadata ?? {}) as Record<string, unknown>;
  const currentGates = metadata.stageGates && typeof metadata.stageGates === "object"
    ? { ...(metadata.stageGates as Record<string, unknown>) }
    : {};
  const sentAt = new Date().toISOString();
  currentGates.pacote_entrega = {
    completed: true, completedAt: sentAt, completedBy: req.user?.sub ?? null,
    stage: card.etapa, source: "delivery_package",
  };
  const deliveryPackage = {
    sentAt, sentBy: req.user?.sub ?? null, channel: "whatsapp",
    termAttachmentId: term.id, manualAttachmentIds: parsed.data.manualAttachmentIds,
  };
  const [updated] = await db.update(workCardsTable).set({
    metadata: { ...metadata, stageGates: currentGates, deliveryPackage },
    updatedAt: new Date(),
  }).where(eq(workCardsTable.id, card.id)).returning();

  if (card.leadId) {
    await recordWorkHistory({
      tenantId: card.tenantId, leadId: card.leadId, dealId: card.dealId, tipo: "tarefa",
      titulo: `${card.codigo}: pacote de entrega enviado`,
      descricao: `Termo assinado + ${manuals.length} manual(is) enviados ao cliente por WhatsApp.`,
      responsavelId: card.responsavelId,
    });
  }
  res.json({ card: updated, sent: true, manualCount: manuals.length });
});

router.get("/work-cards/:id/delivery-acceptance/pdf", async (req, res) => {
  const [card] = await db.select().from(workCardsTable).where(eq(workCardsTable.id, String(req.params.id))).limit(1);
  if (!card) { res.status(404).json({ error: "Card não encontrado" }); return; }
  if (!canAccessTenant(req, card.tenantId)) { res.status(403).json({ error: "Access denied to this tenant" }); return; }
  const acceptance = (card.metadata as Record<string, unknown> | null)?.deliveryAcceptance as any;
  if (!acceptance?.signatures?.client?.dataUrl || !acceptance?.signatures?.company?.dataUrl) {
    res.status(404).json({ error: "Aceite assinado não encontrado" });
    return;
  }
  const [lead] = card.leadId
    ? await db.select({ nome: leadsTable.nome, empresa: leadsTable.empresa, endereco: leadsTable.endereco })
        .from(leadsTable).where(and(eq(leadsTable.id, card.leadId), eq(leadsTable.tenantId, card.tenantId))).limit(1)
    : [];
  const pdf = await generateDeliveryAcceptancePdf({
    code: `${card.codigo}-R${acceptance.version ?? 1}`,
    title: card.titulo,
    client: lead?.empresa || lead?.nome || card.leadId || "Cliente",
    order: card.dealId,
    address: lead?.endereco ?? null,
    receiverName: acceptance.receiver.name,
    receiverDocument: acceptance.receiver.document,
    receiverRole: acceptance.receiver.role,
    acceptanceType: acceptance.acceptanceType,
    observations: acceptance.observations,
    items: acceptance.items,
    clientSignatureDataUrl: acceptance.signatures.client.dataUrl,
    companySignatureDataUrl: acceptance.signatures.company.dataUrl,
    companySignerName: acceptance.signatures.company.name,
    signedAt: new Date(acceptance.signedAt),
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="Termo-Entrega-${card.codigo}-R${acceptance.version ?? 1}.pdf"`);
  res.send(pdf);
});

const supportReportSchema = z.object({
  problemaRelatado: z.string().trim().min(1).max(10000),
  diagnostico: z.string().max(10000).default(""),
  servicoExecutado: z.string().max(10000).default(""),
  materiaisUtilizados: z.array(z.string().trim().min(1)).max(100).default([]),
  situacaoFinal: z.enum(["resolvido", "parcial", "nao_resolvido", "aguardando_peca", "aguardando_retorno"]),
  clienteAcompanhou: z.boolean().nullable().default(null),
  recomendacoes: z.string().max(10000).default(""),
  observacoes: z.string().max(10000).default(""),
});

router.post("/work-cards/:id/support-report/draft", async (req, res) => {
  const [card] = await db.select().from(workCardsTable).where(eq(workCardsTable.id, String(req.params.id))).limit(1);
  if (!card || card.pipeline !== "suporte") { res.status(404).json({ error: "Assistência não encontrada" }); return; }
  if (!canAccessTenant(req, card.tenantId)) { res.status(403).json({ error: "Access denied to this tenant" }); return; }
  if (restrictedToOwnWork(req) && card.responsavelId && card.responsavelId !== req.user?.sub) { res.status(403).json({ error: "Este card pertence a outro responsável" }); return; }
  try {
    const draft = await generateSupportReportDraft(card.tenantId, card.id, req.log);
    res.json({ draft });
  } catch (error) {
    req.log.error({ err: error, workCardId: card.id }, "support-report: falha ao gerar rascunho");
    res.status(500).json({ error: "Não foi possível gerar o relatório da assistência" });
  }
});

router.post("/work-cards/:id/support-report/confirm", async (req, res) => {
  const parsed = supportReportSchema.safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: parsed.error.message, issues: parsed.error.issues }); return; }
  const [card] = await db.select().from(workCardsTable).where(eq(workCardsTable.id, String(req.params.id))).limit(1);
  if (!card || card.pipeline !== "suporte") { res.status(404).json({ error: "Assistência não encontrada" }); return; }
  if (!canAccessTenant(req, card.tenantId)) { res.status(403).json({ error: "Access denied to this tenant" }); return; }
  if (restrictedToOwnWork(req) && card.responsavelId && card.responsavelId !== req.user?.sub) { res.status(403).json({ error: "Este card pertence a outro responsável" }); return; }

  const solved = parsed.data.situacaoFinal === "resolvido";
  const now = new Date();
  if (solved) {
    const [updated] = await db.update(workCardsTable).set({
      etapa: "feedback_cliente",
      metadata: {
        ...(card.metadata ?? {}),
        supportReport: parsed.data,
        supportReportConfirmed: true,
        supportReportConfirmedAt: now.toISOString(),
        supportReportConfirmedBy: req.user?.sub ?? null,
      },
      updatedAt: now,
    }).where(eq(workCardsTable.id, card.id)).returning();
    await recordWorkHistory({
      tenantId: card.tenantId, leadId: card.leadId, dealId: card.dealId, tipo: "assistencia",
      titulo: `${card.codigo}: relatório da assistência confirmado`,
      descricao: `Diagnóstico: ${parsed.data.diagnostico || "não informado"}
Serviço: ${parsed.data.servicoExecutado || "não informado"}
Situação: resolvido.`,
      responsavelId: card.responsavelId,
    });
    await ensureWorkStageTask(updated);
    void requestSupportFeedback(card.tenantId, card.id, req.log);
    res.json({ card: updated, feedbackRequested: true });
    return;
  }

  const [closedAttempt] = await db.update(workCardsTable).set({
    etapa: "fechamento_assistencia",
    dataFimEfetiva: now,
    metadata: {
      ...(card.metadata ?? {}),
      supportReport: parsed.data,
      supportReportConfirmed: true,
      supportReportConfirmedAt: now.toISOString(),
      supportReportConfirmedBy: req.user?.sub ?? null,
      supportCycleOutcome: "necessita_continuidade",
      substatus: parsed.data.situacaoFinal,
    },
    updatedAt: now,
  }).where(eq(workCardsTable.id, card.id)).returning();
  const [continuation] = await db.insert(workCardsTable).values({
    tenantId: card.tenantId,
    codigo: workCode("AST"),
    pipeline: "suporte",
    tipo: "assistencia_retorno",
    etapa: "execucao_assistencia",
    titulo: `Retorno • ${card.titulo}`,
    descricao: parsed.data.observacoes || parsed.data.recomendacoes || card.descricao,
    prioridade: card.prioridade,
    leadId: card.leadId,
    dealId: card.dealId,
    propostaId: card.propostaId,
    parentCardId: card.id,
    responsavelId: card.responsavelId,
    dataInicioEfetiva: now,
    metadata: {
      categoria: (card.metadata as any)?.categoria ?? null,
      produtos: (card.metadata as any)?.produtos ?? [],
      origem: "continuidade_relatorio",
      continuationOf: card.codigo,
      previousWorkCardId: card.id,
      previousOutcome: parsed.data.situacaoFinal,
      supportCycle: Number((card.metadata as any)?.supportCycle ?? 1) + 1,
    },
  }).returning();
  await recordWorkHistory({
    tenantId: card.tenantId, leadId: card.leadId, dealId: card.dealId, tipo: "assistencia",
    titulo: `${closedAttempt.codigo}: ciclo encerrado com necessidade de continuidade`,
    descricao: `O card não retrocedeu. Foi criado o retorno ${continuation.codigo} para continuar a execução. Situação: ${parsed.data.situacaoFinal}.`,
    responsavelId: card.responsavelId,
  });
  await ensureWorkStageTask(continuation);
  res.json({ card: continuation, previousCard: closedAttempt, feedbackRequested: false, continuationCreated: true });
});


router.get("/tenants/:tenantId/installation-metrics", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId)) { res.status(403).json({ error: "Access denied to this tenant" }); return; }

  const [visits, items, occurrences] = await Promise.all([
    db.select().from(installationVisitsTable).where(eq(installationVisitsTable.tenantId, tenantId)),
    db.select().from(installationChecklistItemsTable).where(eq(installationChecklistItemsTable.tenantId, tenantId)),
    db.select().from(installationOccurrencesTable).where(eq(installationOccurrencesTable.tenantId, tenantId)),
  ]);

  const cards = new Map<string, { visits: number; accepted: boolean }>();
  for (const visit of visits) {
    const current = cards.get(visit.workCardId) ?? { visits: 0, accepted: false };
    current.visits = Math.max(current.visits, visit.visitNumber);
    current.accepted = current.accepted || visit.customerAcceptanceStatus === "accepted";
    cards.set(visit.workCardId, current);
  }
  const occurrenceTypes: Record<string, number> = {};
  for (const occurrence of occurrences) occurrenceTypes[occurrence.type] = (occurrenceTypes[occurrence.type] ?? 0) + 1;
  const doneItems = items.filter((item) => ["installed", "verified", "instalado", "conferido"].includes(item.status)).length;

  res.json({
    installations: cards.size,
    accepted: Array.from(cards.values()).filter((value) => value.accepted).length,
    firstVisitAccepted: Array.from(cards.values()).filter((value) => value.accepted && value.visits === 1).length,
    returns: Array.from(cards.values()).filter((value) => value.visits > 1).length,
    visits: visits.length,
    checklistItems: items.length,
    completedChecklistItems: doneItems,
    completionRate: items.length ? Number(((doneItems / items.length) * 100).toFixed(1)) : 0,
    occurrences: occurrences.length,
    openOccurrences: occurrences.filter((occurrence) => occurrence.status === "open" || occurrence.status === "in_progress").length,
    occurrenceTypes,
  });
});

router.get("/tenants/:tenantId/installation-templates", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId)) { res.status(403).json({ error: "Access denied to this tenant" }); return; }
  const rows = await db.select().from(installationChecklistTemplatesTable)
    .where(eq(installationChecklistTemplatesTable.tenantId, tenantId))
    .orderBy(desc(installationChecklistTemplatesTable.updatedAt));
  res.json(rows);
});

router.post("/tenants/:tenantId/installation-templates", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId) || !isAdmin(req)) { res.status(403).json({ error: "Apenas administradores podem configurar templates." }); return; }
  const parsed = insertInstallationTemplateSchema.safeParse({ ...req.body, tenantId });
  if (!parsed.success) { res.status(422).json({ error: parsed.error.message, issues: parsed.error.issues }); return; }
  const [row] = await db.insert(installationChecklistTemplatesTable).values(parsed.data).returning();
  res.status(201).json(row);
});

router.patch("/tenants/:tenantId/installation-templates/:templateId", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccessTenant(req, tenantId) || !isAdmin(req)) { res.status(403).json({ error: "Apenas administradores podem configurar templates." }); return; }
  const parsed = updateInstallationTemplateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: parsed.error.message, issues: parsed.error.issues }); return; }
  const [row] = await db.update(installationChecklistTemplatesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(
      eq(installationChecklistTemplatesTable.id, String(req.params.templateId)),
      eq(installationChecklistTemplatesTable.tenantId, tenantId),
    )).returning();
  if (!row) { res.status(404).json({ error: "Template não encontrado" }); return; }
  res.json(row);
});

router.get("/work-cards/:id/installation", async (req, res) => {
  const [card] = await db.select().from(workCardsTable).where(eq(workCardsTable.id, String(req.params.id))).limit(1);
  if (!card) { res.status(404).json({ error: "Card operacional não encontrado" }); return; }
  if (!canAccessTenant(req, card.tenantId)) { res.status(403).json({ error: "Access denied to this tenant" }); return; }
  if (restrictedToOwnWork(req) && card.responsavelId && card.responsavelId !== req.user?.sub) { res.status(403).json({ error: "Este card pertence a outro responsável" }); return; }
  if (card.pipeline !== "execucao") { res.status(422).json({ error: "Instalação disponível apenas na pipeline de execução" }); return; }
  if (!["instalacao_a_iniciar", "instalacao_em_andamento", "instalacao_finalizada"].includes(card.etapa)) {
    res.status(409).json({ error: "INSTALLATION_NOT_STARTED", message: "O checklist detalhado é criado quando o pedido entra na etapa de instalação." });
    return;
  }

  const visit = await ensureInstallationVisitForCard(card);
  const [visits, items, occurrences] = await Promise.all([
    db.select().from(installationVisitsTable).where(and(
      eq(installationVisitsTable.tenantId, card.tenantId),
      eq(installationVisitsTable.workCardId, card.id),
    )).orderBy(installationVisitsTable.visitNumber),
    db.select().from(installationChecklistItemsTable).where(and(
      eq(installationChecklistItemsTable.tenantId, card.tenantId),
      eq(installationChecklistItemsTable.workCardId, card.id),
    )).orderBy(installationChecklistItemsTable.sourceItemIndex, installationChecklistItemsTable.unitIndex),
    db.select().from(installationOccurrencesTable).where(and(
      eq(installationOccurrencesTable.tenantId, card.tenantId),
      eq(installationOccurrencesTable.workCardId, card.id),
    )).orderBy(desc(installationOccurrencesTable.createdAt)),
  ]);
  res.json({ currentVisitId: visit.id, visits, items, occurrences });
});

router.post("/work-cards/:id/installation/visits", async (req, res) => {
  const [card] = await db.select().from(workCardsTable).where(eq(workCardsTable.id, String(req.params.id))).limit(1);
  if (!card) { res.status(404).json({ error: "Card operacional não encontrado" }); return; }
  if (!canAccessTenant(req, card.tenantId)) { res.status(403).json({ error: "Access denied to this tenant" }); return; }
  const visits = await db.select().from(installationVisitsTable).where(and(
    eq(installationVisitsTable.tenantId, card.tenantId),
    eq(installationVisitsTable.workCardId, card.id),
  )).orderBy(desc(installationVisitsTable.visitNumber));
  const visitNumber = (visits[0]?.visitNumber ?? 0) + 1;
  const [visit] = await db.insert(installationVisitsTable).values({
    tenantId: card.tenantId,
    workCardId: card.id,
    visitNumber,
    status: "scheduled",
    scheduledAt: req.body?.scheduledAt ? new Date(req.body.scheduledAt) : null,
    responsibleId: req.body?.responsibleId || card.responsavelId,
    teamUserIds: Array.isArray(req.body?.teamUserIds) ? req.body.teamUserIds : (card.responsavelId ? [card.responsavelId] : []),
    notes: typeof req.body?.notes === "string" ? req.body.notes : null,
    metadata: { reason: req.body?.reason || "return_or_additional_visit" },
  }).returning();

  const previousVisit = visits[0];
  const previousItems = previousVisit
    ? await db.select().from(installationChecklistItemsTable).where(and(
        eq(installationChecklistItemsTable.tenantId, card.tenantId),
        eq(installationChecklistItemsTable.visitId, previousVisit.id),
      ))
    : [];
  const pending = previousItems.filter((item) => !["installed", "verified", "instalado", "conferido"].includes(item.status));
  if (pending.length) {
    await db.insert(installationChecklistItemsTable).values(pending.map((item) => ({
      tenantId: item.tenantId, visitId: visit.id, workCardId: item.workCardId,
      sourceItemKey: item.sourceItemKey, sourceItemIndex: item.sourceItemIndex, unitIndex: item.unitIndex,
      productId: item.productId, sku: item.sku, productName: item.productName, quantity: item.quantity,
      location: item.location, attributes: item.attributes, checks: item.checks,
      status: "pending", observation: item.observation, evidenceRequired: item.evidenceRequired, required: item.required,
    })));
  }
  res.status(201).json(visit);
});

router.patch("/installation-visits/:visitId", async (req, res) => {
  const [visit] = await db.select().from(installationVisitsTable).where(eq(installationVisitsTable.id, String(req.params.visitId))).limit(1);
  if (!visit) { res.status(404).json({ error: "Visita não encontrada" }); return; }
  if (!canAccessTenant(req, visit.tenantId)) { res.status(403).json({ error: "Access denied to this tenant" }); return; }
  if (visit.customerAcceptanceStatus === "accepted") {
    res.status(409).json({ error: "INSTALLATION_ACCEPTANCE_IMMUTABLE", message: "Visita com aceite concluído não pode mais ser alterada." });
    return;
  }
  const parsed = updateInstallationVisitSchema.safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: parsed.error.message, issues: parsed.error.issues }); return; }
  const [row] = await db.update(installationVisitsTable).set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(installationVisitsTable.id, visit.id)).returning();
  res.json(row);
});

router.patch("/installation-checklist-items/:itemId", async (req, res) => {
  const [item] = await db.select().from(installationChecklistItemsTable)
    .where(eq(installationChecklistItemsTable.id, String(req.params.itemId))).limit(1);
  if (!item) { res.status(404).json({ error: "Item do checklist não encontrado" }); return; }
  if (!canAccessTenant(req, item.tenantId)) { res.status(403).json({ error: "Access denied to this tenant" }); return; }
  const parsed = updateInstallationChecklistItemSchema.safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: parsed.error.message, issues: parsed.error.issues }); return; }

  const status = parsed.data.status ?? item.status;
  const now = new Date();
  const done = ["installed", "verified", "instalado", "conferido"].includes(status);
  const [row] = await db.update(installationChecklistItemsTable).set({
    ...parsed.data,
    ...(done ? { completedAt: parsed.data.completedAt ?? now, completedBy: parsed.data.completedBy ?? req.user?.sub ?? null } : {}),
    updatedAt: now,
  }).where(eq(installationChecklistItemsTable.id, item.id)).returning();

  if (INSTALLATION_EXCEPTION_STATUSES.has(status)) {
    const [openOccurrence] = await db.select().from(installationOccurrencesTable).where(and(
      eq(installationOccurrencesTable.tenantId, item.tenantId),
      eq(installationOccurrencesTable.checklistItemId, item.id),
      eq(installationOccurrencesTable.status, "open"),
    )).limit(1);
    if (!openOccurrence) {
      await db.insert(installationOccurrencesTable).values({
        tenantId: item.tenantId,
        workCardId: item.workCardId,
        visitId: item.visitId,
        checklistItemId: item.id,
        type: status,
        status: "open",
        description: parsed.data.observation || item.observation || `Ocorrência gerada automaticamente para ${item.productName}.`,
        responsibleId: req.user?.sub ?? null,
        metadata: { source: "installation_checklist", automatic: true },
      });
    }
  }
  res.json(row);
});

router.patch("/installation-occurrences/:occurrenceId", async (req, res) => {
  const [occurrence] = await db.select().from(installationOccurrencesTable)
    .where(eq(installationOccurrencesTable.id, String(req.params.occurrenceId))).limit(1);
  if (!occurrence) { res.status(404).json({ error: "Ocorrência não encontrada" }); return; }
  if (!canAccessTenant(req, occurrence.tenantId)) { res.status(403).json({ error: "Access denied to this tenant" }); return; }
  const schema = z.object({
    status: z.enum(["open", "in_progress", "resolved", "cancelled"]).optional(),
    description: z.string().max(10000).optional(),
    responsibleId: z.string().nullable().optional(),
    dueAt: z.coerce.date().nullable().optional(),
    resolution: z.string().max(10000).nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: parsed.error.message, issues: parsed.error.issues }); return; }
  const [row] = await db.update(installationOccurrencesTable).set({
    ...parsed.data,
    resolvedAt: parsed.data.status === "resolved" ? new Date() : occurrence.resolvedAt,
    updatedAt: new Date(),
  }).where(eq(installationOccurrencesTable.id, occurrence.id)).returning();
  res.json(row);
});


async function acceptanceSignatureData(storage: ObjectStorageService, url: string) {
  const objectPath = url.startsWith("/api/storage/") ? url.slice("/api/storage".length) : url;
  if (!objectPath.startsWith("/objects/")) {
    return { dataUrl: url, digest: createHash("sha256").update(url).digest("hex") };
  }
  const file = await storage.getObjectEntityFile(objectPath);
  const [[buffer], [metadata]] = await Promise.all([file.download(), file.getMetadata()]);
  const contentType = metadata.contentType || "image/png";
  return {
    dataUrl: `data:${contentType};base64,${buffer.toString("base64")}`,
    digest: createHash("sha256").update(buffer).digest("hex"),
  };
}

const installationAcceptanceSchema = z.object({
  receiverName: z.string().trim().min(2).max(200),
  receiverDocument: z.string().trim().max(100).nullable().optional(),
  receiverRelationship: z.string().trim().max(120).nullable().optional(),
  customerSignatureUrl: z.string().trim().min(1),
  companySignatureUrl: z.string().trim().min(1),
});

router.post("/installation-visits/:visitId/accept", async (req, res) => {
  const parsed = installationAcceptanceSchema.safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: parsed.error.message, issues: parsed.error.issues }); return; }

  const [visit] = await db.select().from(installationVisitsTable)
    .where(eq(installationVisitsTable.id, String(req.params.visitId))).limit(1);
  if (!visit) { res.status(404).json({ error: "Visita não encontrada" }); return; }
  if (!canAccessTenant(req, visit.tenantId)) { res.status(403).json({ error: "Access denied to this tenant" }); return; }
  if (visit.customerAcceptanceStatus === "accepted") {
    res.status(409).json({ error: "INSTALLATION_ACCEPTANCE_IMMUTABLE", message: "Este aceite já foi concluído e não pode ser alterado." });
    return;
  }

  const [card] = await db.select().from(workCardsTable).where(and(
    eq(workCardsTable.id, visit.workCardId),
    eq(workCardsTable.tenantId, visit.tenantId),
  )).limit(1);
  if (!card) { res.status(404).json({ error: "Card operacional não encontrado" }); return; }
  if (restrictedToOwnWork(req) && card.responsavelId && card.responsavelId !== req.user?.sub) {
    res.status(403).json({ error: "Este card pertence a outro responsável" }); return;
  }
  if (!["instalacao_finalizada", "entrega_obra", "pos_venda", "concluido"].includes(card.etapa)) {
    res.status(409).json({
      error: "INSTALLATION_NOT_TECHNICALLY_FINALIZED",
      message: "Finalize tecnicamente a instalação antes de registrar o aceite do cliente.",
    });
    return;
  }

  const complete = await normalizedInstallationComplete(card);
  if (!complete) {
    res.status(409).json({
      error: "INSTALLATION_NOT_READY_FOR_ACCEPTANCE",
      message: "O aceite só pode ser concluído após finalizar itens, verificações, evidências obrigatórias e ocorrências.",
    });
    return;
  }

  const [tenant, lead, deal, responsible, items] = await Promise.all([
    db.select({ name: tenantsTable.name }).from(tenantsTable).where(eq(tenantsTable.id, card.tenantId)).limit(1).then((rows) => rows[0] ?? null),
    card.leadId ? db.select({ nome: leadsTable.nome, empresa: leadsTable.empresa, telefone: leadsTable.telefone }).from(leadsTable).where(eq(leadsTable.id, card.leadId)).limit(1).then((rows) => rows[0] ?? null) : Promise.resolve(null),
    card.dealId ? db.select({ titulo: dealsTable.titulo }).from(dealsTable).where(eq(dealsTable.id, card.dealId)).limit(1).then((rows) => rows[0] ?? null) : Promise.resolve(null),
    card.responsavelId ? db.select({ name: usersTable.name, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, card.responsavelId)).limit(1).then((rows) => rows[0] ?? null) : Promise.resolve(null),
    db.select().from(installationChecklistItemsTable).where(and(
      eq(installationChecklistItemsTable.tenantId, card.tenantId),
      eq(installationChecklistItemsTable.visitId, visit.id),
    )).orderBy(installationChecklistItemsTable.sourceItemIndex, installationChecklistItemsTable.unitIndex),
  ]);

  const templates = await db.select().from(installationChecklistTemplatesTable).where(and(
    eq(installationChecklistTemplatesTable.tenantId, card.tenantId),
    eq(installationChecklistTemplatesTable.active, true),
  ));
  const documentUrls = new Set<string>();
  const postSaleDays: number[] = [];
  for (const item of items) {
    const source: Record<string, unknown> = {
      ...(item.attributes ?? {}),
      produtoId: item.productId,
      sku: item.sku,
    };
    const ranked = templates
      .map((template) => ({ template, score: templateScore(template, source, card.metadata ?? {}) }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => b.score - a.score);
    const rules = ranked[0]?.template.rules ?? {};
    const manuals = Array.isArray(rules.manualUrls) ? rules.manualUrls : [];
    const warranties = Array.isArray(rules.warrantyUrls) ? rules.warrantyUrls : [];
    for (const value of [...manuals, ...warranties]) {
      if (typeof value === "string" && value.trim()) documentUrls.add(value.trim());
    }
    const days = Number(rules.postSaleAfterDays);
    if (Number.isFinite(days) && days > 0) postSaleDays.push(Math.floor(days));
  }

  const acceptedAt = new Date().toISOString();
  const snapshotWithoutHash = {
    acceptedAt,
    tenantName: tenant?.name || "Empresa",
    cardCode: card.codigo,
    cardTitle: card.titulo,
    customerName: lead?.nome || lead?.empresa || "Cliente",
    orderTitle: deal?.titulo || card.titulo,
    receiverName: parsed.data.receiverName,
    receiverDocument: parsed.data.receiverDocument ?? null,
    receiverRelationship: parsed.data.receiverRelationship ?? null,
    customerSignatureUrl: parsed.data.customerSignatureUrl,
    companySignatureUrl: parsed.data.companySignatureUrl,
    responsibleName: responsible?.name || responsible?.email || null,
    visitNumber: visit.visitNumber,
    documents: Array.from(documentUrls),
    items: items.map((item) => ({
      productName: item.productName,
      quantity: item.quantity,
      unitIndex: item.unitIndex,
      location: item.location,
      status: item.status,
      observation: item.observation,
      attributes: item.attributes,
    })),
  };
  const storage = new ObjectStorageService();
  const [customerSignature, companySignature] = await Promise.all([
    acceptanceSignatureData(storage, parsed.data.customerSignatureUrl),
    acceptanceSignatureData(storage, parsed.data.companySignatureUrl),
  ]);
  const hash = createHash("sha256")
    .update(JSON.stringify(snapshotWithoutHash))
    .update(customerSignature.digest)
    .update(companySignature.digest)
    .digest("hex");
  const snapshot: InstallationAcceptanceSnapshot = { hash, ...snapshotWithoutHash };
  const pdf = await generateInstallationAcceptancePdf({
    ...snapshot,
    customerSignatureUrl: customerSignature.dataUrl,
    companySignatureUrl: companySignature.dataUrl,
  });
  const objectPath = await storage.savePrivateBuffer(pdf, "application/pdf", `termo-instalacao-${card.codigo}.pdf`);
  const servedUrl = `/api/storage${objectPath}`;

  const [attachment] = await db.insert(workCardAttachmentsTable).values({
    tenantId: card.tenantId,
    workCardId: card.id,
    leadId: card.leadId,
    criadoPor: req.user?.sub ?? null,
    origem: "installation_acceptance",
    nome: `Termo de Instalação e Aceite - ${card.codigo}.pdf`,
    url: servedUrl,
    mimeType: "application/pdf",
    tamanho: pdf.byteLength,
    descricao: "Documento final imutável de instalação e aceite.",
    metadata: {
      immutable: true,
      installationVisitId: visit.id,
      acceptanceHash: hash,
      acceptedAt,
    },
  }).returning();

  const [updatedVisit] = await db.update(installationVisitsTable).set({
    receiverName: parsed.data.receiverName,
    receiverDocument: parsed.data.receiverDocument ?? null,
    receiverRelationship: parsed.data.receiverRelationship ?? null,
    customerAcceptanceStatus: "accepted",
    customerSignatureUrl: parsed.data.customerSignatureUrl,
    companySignatureUrl: parsed.data.companySignatureUrl,
    metadata: {
      ...(visit.metadata ?? {}),
      acceptanceSnapshot: snapshot,
      acceptanceHash: hash,
      acceptedAt,
      acceptedBy: req.user?.sub ?? null,
      acceptanceDocumentAttachmentId: attachment.id,
      acceptanceDocumentUrl: attachment.url,
    },
    updatedAt: new Date(),
  }).where(eq(installationVisitsTable.id, visit.id)).returning();

  if (card.leadId) {
    await recordWorkHistory({
      tenantId: card.tenantId,
      leadId: card.leadId,
      dealId: card.dealId,
      tipo: "tarefa",
      titulo: `${card.codigo}: termo de instalação e aceite concluído`,
      descricao: `Aceite registrado por ${parsed.data.receiverName}. Integridade: ${hash}.`,
      responsavelId: card.responsavelId,
      anexo: { nome: attachment.nome, url: attachment.url, mimeType: attachment.mimeType, tamanho: attachment.tamanho },
    });
  }

  if (card.leadId && postSaleDays.length > 0) {
    const days = Math.min(...postSaleDays);
    const title = `Pós-venda pós-instalação — ${card.codigo}`;
    const [existingPostSale] = await db.select({ id: activitiesTable.id }).from(activitiesTable).where(and(
      eq(activitiesTable.tenantId, card.tenantId),
      eq(activitiesTable.leadId, card.leadId),
      eq(activitiesTable.titulo, title),
      eq(activitiesTable.status, "planejado"),
    )).limit(1);
    if (!existingPostSale) {
      await db.insert(activitiesTable).values({
        tenantId: card.tenantId,
        leadId: card.leadId,
        dealId: card.dealId,
        tipo: "tarefa",
        titulo: title,
        descricao: "Retorno automático configurado pelo template do produto após a instalação.",
        status: "planejado",
        responsavelId: card.responsavelId,
        dataVencimento: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      });
    }
  }

  if (lead?.telefone) {
    const links = Array.from(documentUrls);
    const acceptanceUrl = `https://app.appvendorai.com${attachment.url}`;
    const message = [
      `Olá, ${lead.nome || "cliente"}. A instalação do pedido ${deal?.titulo || card.codigo} foi concluída e aceita.`,
      `Termo de instalação e aceite: ${acceptanceUrl}`,
      links.length ? "Manuais/garantias aplicáveis:" : null,
      ...links,
    ].filter(Boolean).join("\n");
    sendDirectWhatsAppMessage(card.tenantId, lead.telefone, message, req.log).catch((err) => {
      req.log.warn({ err, workCardId: card.id }, "installation-acceptance: não foi possível enviar documentos ao cliente");
    });
  }

  res.status(201).json({
    visit: updatedVisit,
    attachment,
    hash,
    documents: Array.from(documentUrls),
    postSaleAfterDays: postSaleDays.length ? Math.min(...postSaleDays) : null,
  });
});

router.get("/installation-visits/:visitId/acceptance", async (req, res) => {
  const [visit] = await db.select().from(installationVisitsTable)
    .where(eq(installationVisitsTable.id, String(req.params.visitId))).limit(1);
  if (!visit) { res.status(404).json({ error: "Visita não encontrada" }); return; }
  if (!canAccessTenant(req, visit.tenantId)) { res.status(403).json({ error: "Access denied to this tenant" }); return; }
  const metadata = visit.metadata as Record<string, unknown> | null;
  if (visit.customerAcceptanceStatus !== "accepted" || !metadata?.acceptanceHash) {
    res.status(404).json({ error: "Aceite final ainda não foi concluído" }); return;
  }
  res.json({
    status: visit.customerAcceptanceStatus,
    hash: metadata.acceptanceHash,
    acceptedAt: metadata.acceptedAt,
    documentUrl: metadata.acceptanceDocumentUrl,
    receiverName: visit.receiverName,
  });
});

router.get("/work-cards/:id/attachments", async (req, res) => {
  const [card] = await db.select().from(workCardsTable).where(eq(workCardsTable.id, String(req.params.id)));
  if (!card) {
    res.status(404).json({ error: "Card operacional não encontrado" });
    return;
  }
  if (!canAccessTenant(req, card.tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  if (restrictedToOwnWork(req) && card.responsavelId && card.responsavelId !== req.user?.sub) {
    res.status(403).json({ error: "Este card pertence a outro responsável" });
    return;
  }
  const attachments = await db.select().from(workCardAttachmentsTable)
    .where(eq(workCardAttachmentsTable.workCardId, card.id))
    .orderBy(desc(workCardAttachmentsTable.createdAt));
  res.json(attachments);
});

router.post("/work-cards/:id/attachments", async (req, res) => {
  const [card] = await db.select().from(workCardsTable).where(eq(workCardsTable.id, String(req.params.id)));
  if (!card) {
    res.status(404).json({ error: "Card operacional não encontrado" });
    return;
  }
  if (!canAccessTenant(req, card.tenantId)) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }
  if (restrictedToOwnWork(req) && card.responsavelId && card.responsavelId !== req.user?.sub) {
    res.status(403).json({ error: "Este card pertence a outro responsável" });
    return;
  }

  const parsed = insertWorkCardAttachmentSchema.safeParse({
    ...req.body,
    tenantId: card.tenantId,
    workCardId: card.id,
    leadId: card.leadId,
    criadoPor: req.user?.sub ?? null,
  });
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message, issues: parsed.error.issues });
    return;
  }
  const [attachment] = await db.insert(workCardAttachmentsTable).values(parsed.data).returning();

  if (card.leadId) {
    await recordWorkHistory({
      tenantId: card.tenantId,
      leadId: card.leadId,
      dealId: card.dealId,
      tipo: card.pipeline === "suporte" ? "assistencia" : "tarefa",
      titulo: `${card.codigo}: anexo registrado`,
      descricao: [attachment.descricao, attachment.transcricao ? `Transcrição: ${attachment.transcricao}` : null, `Origem: ${attachment.origem}`].filter(Boolean).join("\n"),
      responsavelId: card.responsavelId,
      anexo: {
        nome: attachment.nome,
        url: attachment.url,
        mimeType: attachment.mimeType,
        tamanho: attachment.tamanho,
      },
    });
  }

  res.status(201).json(attachment);
});

export default router;