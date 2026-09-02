import { and, desc, eq } from "drizzle-orm";
import type { Logger } from "pino";
import {
  activitiesTable,
  db,
  dealsTable,
  notificationsTable,
  usersTable,
  workCardsTable,
} from "@workspace/db";
import { callOpenAI } from "../lib/ai-gateway.js";
import { sendDirectWhatsAppMessage } from "./omnichannel.js";

const SUPPORT_CATEGORIES = new Set([
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
]);
const PRIORITIES = new Set(["baixa", "normal", "alta", "urgente"]);
const CLOSED_SUPPORT_STAGES = new Set(["fechamento_assistencia", "cancelado"]);

export type SupportAiIntakeScenario = {
  state: "none" | "collecting" | "opened" | "existing" | "unassigned";
  isSupportRequest?: boolean;
  code?: string;
  category?: string;
  priority?: string;
  problemSummary?: string;
  products?: string[];
  missingQuestion?: string;
  responsibleName?: string | null;
  instruction?: string;
};

type IntakeClassification = {
  isSupportRequest: boolean;
  readyToOpen: boolean;
  category: string;
  priority: string;
  title: string;
  problemSummary: string;
  products: string[];
  missingQuestion: string;
};

type RecentMessage = {
  enviadoPor: string;
  conteudo: string;
  createdAt?: Date | string;
};

function workCode() {
  return `AST-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
}

function extractJson(content: string): Record<string, unknown> {
  const cleaned = content.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try { return JSON.parse(match[0]) as Record<string, unknown>; } catch { return {}; }
  }
}

function normalizeClassification(raw: Record<string, unknown>): IntakeClassification {
  const category = String(raw.category ?? "outro");
  const priority = String(raw.priority ?? "normal");
  const products = Array.isArray(raw.products)
    ? raw.products.map((item) => String(item).trim()).filter(Boolean).slice(0, 50)
    : [];
  const problemSummary = String(raw.problemSummary ?? "").trim().slice(0, 10000);
  const isSupportRequest = raw.isSupportRequest === true;
  return {
    isSupportRequest,
    readyToOpen: isSupportRequest && raw.readyToOpen === true && problemSummary.length >= 10,
    category: SUPPORT_CATEGORIES.has(category) ? category : "outro",
    priority: PRIORITIES.has(priority) ? priority : "normal",
    title: String(raw.title ?? "Assistência solicitada pelo cliente").trim().slice(0, 200) || "Assistência solicitada pelo cliente",
    problemSummary,
    products,
    missingQuestion: String(raw.missingQuestion ?? "Pode me explicar um pouco melhor o que está acontecendo?").trim().slice(0, 500),
  };
}

async function classifySupportNeed(input: {
  tenantId: string;
  recentMessages: RecentMessage[];
  currentMessage: string;
  log: Logger;
}) {
  const transcriptRows = input.recentMessages.slice(-8).map((message) => {
    const author = message.enviadoPor === "lead" ? "CLIENTE" : "ATENDIMENTO";
    return `${author}: ${message.conteudo}`;
  });
  if (!transcriptRows.length || transcriptRows[transcriptRows.length - 1]?.includes(input.currentMessage) !== true) {
    transcriptRows.push(`CLIENTE: ${input.currentMessage}`);
  }

  const { content } = await callOpenAI(
    input.tenantId,
    "agent_service",
    [
      {
        role: "system",
        content: [
          "Você é o classificador operacional do atendimento pós-venda.",
          "Decida se a conversa contém um problema que deve virar um chamado de assistência/suporte operacional.",
          "Abra chamado quando houver defeito, avaria, falha de funcionamento, instalação, garantia, manutenção, falta de material, erro de medida, problema técnico ou outra ocorrência que exija acompanhamento humano/técnico.",
          "NÃO abra chamado para saudação, nova venda, orçamento, dúvida financeira, cobrança, simples pedido de status sem problema, ou dúvida informativa que o próprio atendimento consiga responder sem acompanhamento.",
          "readyToOpen=true somente quando o problema estiver específico o suficiente para uma pessoa assumir e agir. Produto/pedido podem estar ausentes; não invente.",
          "Se ainda faltar informação essencial, readyToOpen=false e escreva UMA única pergunta objetiva em missingQuestion.",
          "Classifique category somente como: defeito, instalacao, funcionamento, avaria, falta_material, erro_medida, duvida_tecnica, garantia, manutencao, outro.",
          "Classifique priority somente como: baixa, normal, alta, urgente. Use urgente apenas quando o texto indicar risco, paralisação crítica ou necessidade imediata real.",
          "Responda SOMENTE JSON válido, sem markdown.",
        ].join("\n"),
      },
      {
        role: "user",
        content: `${transcriptRows.join("\n")}\n\nJSON obrigatório:\n{\n  "isSupportRequest": true|false,\n  "readyToOpen": true|false,\n  "category": "...",\n  "priority": "...",\n  "title": "...",\n  "problemSummary": "...",\n  "products": [],\n  "missingQuestion": "..."\n}`,
      },
    ],
    { model: "gpt-4o-mini", temperature: 0, maxTokens: 450, log: input.log },
  );

  return normalizeClassification(extractJson(content));
}

async function pickSupportOwner(tenantId: string) {
  const users = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    telefone: usersTable.telefone,
    userFunction: usersTable.userFunction,
    platformRole: usersTable.platformRole,
    lastAssignedAt: usersTable.lastAssignedAt,
  }).from(usersTable).where(and(eq(usersTable.tenantId, tenantId), eq(usersTable.active, true)));

  const supportUsers = users.filter((user) => user.userFunction === "suporte");
  const fallbackAdmins = users.filter((user) => user.userFunction === "administrador" || user.platformRole === "tenant_admin");
  const pool = supportUsers.length ? supportUsers : fallbackAdmins;
  return pool.sort((a, b) => {
    const aTime = a.lastAssignedAt ? new Date(a.lastAssignedAt).getTime() : 0;
    const bTime = b.lastAssignedAt ? new Date(b.lastAssignedAt).getTime() : 0;
    return aTime - bTime;
  })[0] ?? null;
}

export async function prepareSupportAiIntake(input: {
  tenantId: string;
  lead: { id: string; nome?: string | null; empresa?: string | null; status?: string | null };
  recentMessages: RecentMessage[];
  currentMessage: string;
  log: Logger;
}): Promise<SupportAiIntakeScenario> {
  if (input.lead.status !== "cliente") return { state: "none" };

  const existingCards = await db.select().from(workCardsTable).where(and(
    eq(workCardsTable.tenantId, input.tenantId),
    eq(workCardsTable.pipeline, "suporte"),
    eq(workCardsTable.leadId, input.lead.id),
  )).orderBy(desc(workCardsTable.updatedAt));
  const activeCard = existingCards.find((card) => !CLOSED_SUPPORT_STAGES.has(card.etapa));
  if (activeCard) {
    return {
      state: "existing",
      isSupportRequest: true,
      code: activeCard.codigo,
      category: String((activeCard.metadata as Record<string, unknown> | null)?.categoria ?? "outro"),
      priority: activeCard.prioridade,
      problemSummary: activeCard.descricao ?? undefined,
      instruction: `Já existe a assistência ${activeCard.codigo} ativa para este cliente. Não abra outro chamado. Continue o atendimento mencionando o código quando for útil e informe que novas informações serão vinculadas ao chamado existente.`,
    };
  }

  const classification = await classifySupportNeed(input);
  if (!classification.isSupportRequest) return { state: "none", isSupportRequest: false };

  if (!classification.readyToOpen) {
    return {
      state: "collecting",
      isSupportRequest: true,
      category: classification.category,
      priority: classification.priority,
      problemSummary: classification.problemSummary,
      products: classification.products,
      missingQuestion: classification.missingQuestion,
      instruction: `Ainda não há informação suficiente para abrir assistência. Faça somente esta pergunta ao cliente, de forma natural: ${classification.missingQuestion}. Não diga que o chamado já foi aberto.`,
    };
  }

  const owner = await pickSupportOwner(input.tenantId);
  if (!owner) {
    await db.insert(notificationsTable).values({
      tenantId: input.tenantId,
      title: "Assistência aguardando responsável",
      message: `O cliente ${input.lead.nome || input.lead.empresa || input.lead.id} relatou um problema, mas não existe usuário ativo de Suporte/Admin para receber o chamado.`,
      type: "warning",
      category: "support_unassigned",
    }).catch(() => undefined);
    return {
      state: "unassigned",
      isSupportRequest: true,
      category: classification.category,
      priority: classification.priority,
      problemSummary: classification.problemSummary,
      products: classification.products,
      instruction: "Há informação suficiente para assistência, mas o tenant não possui responsável de Suporte/Admin ativo. Não confirme um código inexistente. Diga apenas que a equipe será acionada e que o atendimento será encaminhado.",
    };
  }

  const deals = await db.select().from(dealsTable).where(and(
    eq(dealsTable.tenantId, input.tenantId),
    eq(dealsTable.leadId, input.lead.id),
  )).orderBy(desc(dealsTable.updatedAt));
  const relatedDeal = deals.find((deal) => ["ganho", "em_execucao", "entregue"].includes(deal.etapa)) ?? null;

  const codigo = workCode();
  const [card] = await db.insert(workCardsTable).values({
    tenantId: input.tenantId,
    codigo,
    pipeline: "suporte",
    tipo: "assistencia",
    etapa: "chamado_cliente",
    titulo: classification.title,
    descricao: classification.problemSummary,
    prioridade: classification.priority,
    leadId: input.lead.id,
    dealId: relatedDeal?.id ?? null,
    propostaId: null,
    responsavelId: owner.id,
    metadata: {
      categoria: classification.category,
      relato: classification.problemSummary,
      produtos: classification.products,
      origem: "ia",
      substatus: null,
      aiIntake: true,
      aiIntakeOpenedAt: new Date().toISOString(),
    },
  }).returning();

  await db.insert(activitiesTable).values({
    tenantId: input.tenantId,
    leadId: input.lead.id,
    dealId: relatedDeal?.id ?? null,
    tipo: "assistencia",
    titulo: `${codigo} — ${classification.title}`,
    descricao: [
      `Categoria: ${classification.category}`,
      classification.products.length ? `Itens/produtos: ${classification.products.join(", ")}` : null,
      `Relato coletado pela IA: ${classification.problemSummary}`,
    ].filter(Boolean).join("\n"),
    status: "planejado",
    responsavelId: owner.id,
  });

  await db.update(usersTable).set({ lastAssignedAt: new Date(), updatedAt: new Date() }).where(eq(usersTable.id, owner.id));

  if (owner.telefone) {
    const customerName = input.lead.nome || input.lead.empresa || "Cliente";
    const whatsappText = [
      `🛠️ Nova assistência ${codigo} aberta pela IA`,
      `Cliente: ${customerName}`,
      `Categoria: ${classification.category}`,
      `Prioridade: ${classification.priority}`,
      classification.products.length ? `Itens/produtos: ${classification.products.join(", ")}` : null,
      `Relato: ${classification.problemSummary}`,
      "Abra no VendorAI para assumir o atendimento e acompanhar a execução.",
    ].filter(Boolean).join("\n");
    sendDirectWhatsAppMessage(input.tenantId, owner.telefone, whatsappText, input.log).catch((error) => {
      input.log.warn({ err: error, workCardId: card.id }, "support-ai-intake: aviso WhatsApp do responsável não enviado");
    });
  }

  input.log.info({ tenantId: input.tenantId, leadId: input.lead.id, workCardId: card.id, codigo, responsibleId: owner.id }, "support-ai-intake: assistência aberta automaticamente");
  return {
    state: "opened",
    isSupportRequest: true,
    code: codigo,
    category: classification.category,
    priority: classification.priority,
    problemSummary: classification.problemSummary,
    products: classification.products,
    responsibleName: owner.name,
    instruction: `A assistência ${codigo} foi aberta com sucesso e atribuída a ${owner.name}. Confirme ao cliente que o chamado foi registrado, informe o código ${codigo} e diga que a equipe responsável dará continuidade. Não prometa prazo que não esteja no contexto.`,
  };
}
