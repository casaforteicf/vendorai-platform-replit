import { Router, type IRouter } from "express";
import multer from "multer";
import { and, asc, eq } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod/v4";
import {
  activitiesTable,
  db,
  leadsTable,
  pipelineStagesTable,
  tenantsTable,
  usersTable,
  workCardsTable,
  workCardAttachmentsTable,
} from "@workspace/db";
import { sendDirectWhatsAppMessage } from "../services/omnichannel.js";
import { ObjectStorageService } from "../lib/objectStorage.js";

type QuestionSnapshot = {
  id: string;
  texto: string;
  tipo?: "texto" | "texto_longo" | "sim_nao" | "numero" | "data" | "opcoes";
  opcoes?: string[];
  quemResponde?: "cliente" | "usuario" | "ambos" | "automatico";
  obrigatoria?: boolean;
  visivelCliente?: boolean;
  entraRelatorio?: boolean;
  editavelDepois?: boolean;
  evidenciaExigida?: "nenhuma" | "foto" | "video" | "audio" | "documento" | "midia";
};

type SupportOrderSection = {
  id: string;
  stage: string;
  title: string;
  status: "aberto" | "em_andamento" | "concluido";
  fields: Array<{ key: string; label: string; value: unknown; visibility: "interno" | "cliente" }>;
  checklist: Array<Record<string, unknown>>;
  attachments: Array<Record<string, unknown>>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  actor?: { id?: string | null; name?: string | null; type?: string | null };
};

type StoredAnswer = {
  value: unknown;
  answeredAt: string;
  actorType: "cliente" | "usuario" | "automatico";
  actorId?: string | null;
  actorName?: string | null;
  evidence?: Array<{ id: string; name: string; url: string; mimeType?: string | null; uploadedAt: string; actorType: "cliente" | "usuario" }>;
  history?: Array<{
    value: unknown;
    answeredAt: string;
    actorType: "cliente" | "usuario" | "automatico";
    actorId?: string | null;
    actorName?: string | null;
  }>;
};

const answerSchema = z.object({
  answers: z.record(z.string(), z.unknown()),
  complete: z.boolean().optional(),
});

const objectStorage = new ObjectStorageService();
const evidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
});

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function questionsFrom(activity: typeof activitiesTable.$inferSelect): QuestionSnapshot[] {
  const snapshot = activity.formularioSnapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return [];
  const questions = (snapshot as Record<string, unknown>).perguntas;
  return Array.isArray(questions) ? questions as QuestionSnapshot[] : [];
}

function answerMap(activity: typeof activitiesTable.$inferSelect): Record<string, StoredAnswer> {
  const raw = activity.formularioRespostas;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const answers = (raw as Record<string, unknown>).answers;
  return answers && typeof answers === "object" && !Array.isArray(answers)
    ? answers as Record<string, StoredAnswer>
    : {};
}

function hasValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function publicQuestion(question: QuestionSnapshot) {
  return question.visivelCliente === true
    || question.quemResponde === "cliente"
    || question.quemResponde === "ambos";
}

function canClientAnswer(question: QuestionSnapshot) {
  return question.quemResponde === "cliente" || question.quemResponde === "ambos";
}

function canUserAnswer(question: QuestionSnapshot) {
  return question.quemResponde !== "cliente";
}

function publicActivity(activity: typeof activitiesTable.$inferSelect) {
  const questions = questionsFrom(activity).filter(publicQuestion);
  const answers = answerMap(activity);
  return {
    id: activity.id,
    title: activity.titulo.replace(/\s+—\s+AST-[^\s]+$/i, ""),
    description: activity.descricao,
    objective: activity.objetivo,
    expectedResult: activity.resultadoEsperado,
    status: activity.status,
    dueAt: activity.dataVencimento,
    stageKey: activity.origemEtapaKey,
    required: Boolean(activity.bloqueiaAvanco),
    questions: questions.map((question) => ({
      ...question,
      answer: answers[question.id]?.value ?? null,
      answeredAt: answers[question.id]?.answeredAt ?? null,
      answeredBy: answers[question.id]?.actorType ?? null,
      evidence: answers[question.id]?.evidence ?? [],
    })),
  };
}

async function findPublicCard(token: string) {
  const [card] = await db.select().from(workCardsTable).where(and(
    eq(workCardsTable.publicAccessTokenHash, sha256(token)),
    eq(workCardsTable.pipeline, "suporte"),
  )).limit(1);
  if (!card) return null;
  const access = ((card.metadata ?? {}) as Record<string, any>).supportPublicAccess;
  if (access?.enabled === false) return null;
  return card;
}

async function stageList(card: typeof workCardsTable.$inferSelect) {
  return db.select({
    key: pipelineStagesTable.key,
    label: pipelineStagesTable.label,
    order: pipelineStagesTable.ordem,
  }).from(pipelineStagesTable).where(and(
    eq(pipelineStagesTable.tenantId, card.tenantId),
    eq(pipelineStagesTable.pipeline, "suporte"),
  )).orderBy(asc(pipelineStagesTable.ordem));
}

async function supportActivities(card: typeof workCardsTable.$inferSelect) {
  return db.select().from(activitiesTable).where(and(
    eq(activitiesTable.tenantId, card.tenantId),
    eq(activitiesTable.workCardId, card.id),
  )).orderBy(asc(activitiesTable.createdAt));
}

function supportSectionKey(entry: { kind: string; text: string }) {
  const map: Record<string, string> = {
    chamado: "chamado",
    triagem: "triagem",
    agendamento: "agendamento",
    execucao: "execucao",
    relatorio: "relatorio",
    feedback: "feedback",
    fechamento: "fechamento",
  };
  const normalized = String(entry.kind ?? "").toLowerCase();
  for (const [key, value] of Object.entries(map)) if (normalized.includes(key)) return value;
  const text = String(entry.text ?? "").toLowerCase();
  if (/agenda|agendad|visita|reagend/.test(text)) return "agendamento";
  if (/execu|serviço execut|material|peça/.test(text)) return "execucao";
  if (/relat|diagnóstico|diagnostico|causa|solução|solucao/.test(text)) return "relatorio";
  if (/feedback|avaliação|avaliacao/.test(text)) return "feedback";
  if (/fech|conclu|encerr/.test(text)) return "fechamento";
  if (/triagem|análise|analise/.test(text)) return "triagem";
  return "chamado";
}

function ensureSupportSection(order: Record<string, any>, entry: { userName: string; text: string; visibility: "interno" | "cliente"; kind: string }, at: string): Record<string, any> {
  const sections: SupportOrderSection[] = Array.isArray(order.sections) ? order.sections : [];
  const stage = supportSectionKey(entry);
  const titleMap: Record<string,string> = {
    chamado: "Chamado do cliente",
    triagem: "Triagem / análise",
    agendamento: "Agendamento da assistência",
    execucao: "Execução da assistência",
    relatorio: "Relatório",
    feedback: "Feedback do cliente",
    fechamento: "Fechamento",
  };
  let section = sections.find((item) => item.stage === stage);
  if (!section) {
    section = {
      id: `support-section-${stage}`,
      stage,
      title: titleMap[stage] ?? stage,
      status: "aberto",
      fields: [],
      checklist: [],
      attachments: [],
      createdAt: at,
      updatedAt: at,
      completedAt: null,
    };
    sections.push(section);
  }
  section.updatedAt = at;
  section.status = /conclu|fech|encerr/.test(entry.kind) ? "concluido" : "em_andamento";
  if (section.status === "concluido") section.completedAt = at;
  const fieldKey = `event_${at.replace(/\D/g, "").slice(-14)}`;
  section.fields = [...section.fields, {
    key: fieldKey,
    label: "Registro",
    value: entry.text,
    visibility: entry.visibility,
  }].slice(-100);
  return { ...order, sections: sections.slice(-20) };
}

async function appendSupportTimeline(
  card: typeof workCardsTable.$inferSelect,
  entry: { userName: string; text: string; visibility: "interno" | "cliente"; kind: string },
  log: any,
  notifyClient = false,
) {
  const [fresh] = await db.select().from(workCardsTable).where(eq(workCardsTable.id, card.id)).limit(1);
  if (!fresh) return;

  const metadata = (fresh.metadata ?? {}) as Record<string, any>;
  const order = metadata.supportWorkOrder && typeof metadata.supportWorkOrder === "object"
    ? metadata.supportWorkOrder as Record<string, any>
    : {};
  const timeline = Array.isArray(order.timeline) ? order.timeline : [];
  const at = new Date().toISOString();
  const timelineEntry = { ...entry, at };
  const structuredOrder = ensureSupportSection(order, entry, at);
  const nextMetadata = {
    ...metadata,
    supportWorkOrder: {
      ...structuredOrder,
      updatedAt: at,
      timeline: [...timeline, timelineEntry].slice(-500),
    },
  };
  await db.update(workCardsTable).set({ metadata: nextMetadata, updatedAt: new Date() })
    .where(eq(workCardsTable.id, card.id));

  if (!notifyClient || entry.visibility !== "cliente" || !card.leadId) return;

  const [lead] = await db.select({ phone: leadsTable.telefone }).from(leadsTable)
    .where(and(eq(leadsTable.id, card.leadId), eq(leadsTable.tenantId, card.tenantId))).limit(1);
  if (!lead?.phone) return;

  const access = metadata.supportPublicAccess && typeof metadata.supportPublicAccess === "object"
    ? metadata.supportPublicAccess as Record<string, any>
    : {};
  const token = typeof access.token === "string" ? access.token : "";
  const baseUrl = (process.env.APP_URL || "https://app.appvendorai.com").replace(/\/$/, "");
  const link = token ? `\n\nAcompanhe pelo mesmo link:\n${baseUrl}/assistencia/${encodeURIComponent(token)}` : "";
  await sendDirectWhatsAppMessage(
    card.tenantId,
    lead.phone,
    `🛠️ Assistência ${card.codigo} atualizada.\n${entry.text}${link}`,
    log,
  ).catch((error) => log?.warn?.({ err: error, workCardId: card.id }, "support-execution: atualização do cliente não enviada"));
}

async function applyAnswers(input: {
  activity: typeof activitiesTable.$inferSelect;
  incoming: Record<string, unknown>;
  actorType: "cliente" | "usuario";
  actorId?: string | null;
  actorName?: string | null;
  complete?: boolean;
}) {
  const questions = questionsFrom(input.activity);
  const existing = answerMap(input.activity);
  const now = new Date().toISOString();

  for (const [questionId, value] of Object.entries(input.incoming)) {
    const question = questions.find((item) => item.id === questionId);
    if (!question) continue;
    const permitted = input.actorType === "cliente" ? canClientAnswer(question) : canUserAnswer(question);
    if (!permitted) continue;
    if (question.editavelDepois === false && existing[questionId] && hasValue(existing[questionId].value)) continue;
    const previous = existing[questionId];
    const history = previous
      ? [...(previous.history ?? []), {
          value: previous.value,
          answeredAt: previous.answeredAt,
          actorType: previous.actorType,
          actorId: previous.actorId,
          actorName: previous.actorName,
        }].slice(-30)
      : [];
    existing[questionId] = {
      value,
      answeredAt: now,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      actorName: input.actorName ?? null,
      evidence: previous?.evidence ?? [],
      history,
    };
  }

  const missing = questions.filter((question) => {
    const answer = existing[question.id];
    const responseMissing = Boolean(question.obrigatoria) && !hasValue(answer?.value);
    const evidenceRequired = Boolean(question.evidenciaExigida && question.evidenciaExigida !== "nenhuma");
    const evidenceMissing = evidenceRequired && !(answer?.evidence?.length);
    return responseMissing || evidenceMissing;
  });
  const mayComplete = input.complete === true && missing.length === 0;

  const [updated] = await db.update(activitiesTable).set({
    formularioRespostas: { version: 1, answers: existing, updatedAt: now },
    ...(mayComplete ? {
      status: "concluida",
      estadoExecucao: "concluida",
      concluidaEm: new Date(),
    } : {}),
    updatedAt: new Date(),
  }).where(eq(activitiesTable.id, input.activity.id)).returning();

  return { activity: updated, missing };
}

function evidenceTypeMatches(question: QuestionSnapshot, mimeType: string) {
  const required = question.evidenciaExigida ?? "nenhuma";
  if (required === "nenhuma") return true;
  if (required === "foto") return mimeType.startsWith("image/");
  if (required === "video") return mimeType.startsWith("video/");
  if (required === "audio") return mimeType.startsWith("audio/");
  if (required === "midia") return mimeType.startsWith("image/") || mimeType.startsWith("video/") || mimeType.startsWith("audio/");
  if (required === "documento") return !mimeType.startsWith("video/") && !mimeType.startsWith("audio/");
  return true;
}

async function attachEvidence(input: {
  card: typeof workCardsTable.$inferSelect;
  activity: typeof activitiesTable.$inferSelect;
  question: QuestionSnapshot;
  file: Express.Multer.File;
  actorType: "cliente" | "usuario";
  actorId?: string | null;
  actorName?: string | null;
}) {
  const mimeType = input.file.mimetype || "application/octet-stream";
  if (!evidenceTypeMatches(input.question, mimeType)) {
    throw new Error(`EVIDENCE_TYPE_MISMATCH:${input.question.evidenciaExigida ?? "arquivo"}`);
  }

  const objectPath = await objectStorage.savePrivateBuffer(
    input.file.buffer,
    mimeType,
    input.file.originalname || `evidencia-${Date.now()}`,
  );
  const now = new Date().toISOString();
  const [attachment] = await db.insert(workCardAttachmentsTable).values({
    tenantId: input.card.tenantId,
    workCardId: input.card.id,
    leadId: input.card.leadId,
    criadoPor: input.actorType === "usuario" ? input.actorId ?? null : null,
    origem: input.actorType === "cliente" ? "support_public_question" : "support_activity_question",
    nome: input.file.originalname || "evidencia",
    url: `/api/storage${objectPath}`,
    mimeType,
    tamanho: input.file.size,
    descricao: `Evidência: ${input.question.texto}`,
    metadata: {
      activityId: input.activity.id,
      questionId: input.question.id,
      questionText: input.question.texto,
      stageKey: input.activity.origemEtapaKey,
      actorType: input.actorType,
      clientVisible: input.question.visivelCliente === true || input.question.quemResponde === "cliente" || input.question.quemResponde === "ambos",
    },
  }).returning();

  const answers = answerMap(input.activity);
  const previous = answers[input.question.id];
  const evidence = [
    ...(previous?.evidence ?? []),
    {
      id: attachment.id,
      name: attachment.nome,
      url: attachment.url,
      mimeType: attachment.mimeType,
      uploadedAt: now,
      actorType: input.actorType,
    },
  ].slice(-30);

  answers[input.question.id] = {
    value: previous?.value ?? null,
    answeredAt: previous?.answeredAt ?? now,
    actorType: previous?.actorType ?? input.actorType,
    actorId: previous?.actorId ?? input.actorId ?? null,
    actorName: previous?.actorName ?? input.actorName ?? (input.actorType === "cliente" ? "Cliente" : "Equipe"),
    evidence,
    history: previous?.history ?? [],
  };

  const [activity] = await db.update(activitiesTable).set({
    formularioRespostas: { version: 1, answers, updatedAt: now },
    updatedAt: new Date(),
  }).where(eq(activitiesTable.id, input.activity.id)).returning();

  return { activity, attachment };
}

export const publicSupportRouter: IRouter = Router();

publicSupportRouter.get("/public/support/:token", async (req, res) => {
  const card = await findPublicCard(String(req.params.token));
  if (!card) return res.status(404).json({ error: "Atendimento não encontrado ou link inválido" });

  const [[tenant], [lead], stages, activities] = await Promise.all([
    db.select({ name: tenantsTable.nomeEmpresa, logoUrl: tenantsTable.logoUrl, primaryColor: tenantsTable.corPrimaria })
      .from(tenantsTable).where(eq(tenantsTable.id, card.tenantId)).limit(1),
    card.leadId
      ? db.select({ name: leadsTable.nome, company: leadsTable.empresa }).from(leadsTable)
          .where(and(eq(leadsTable.id, card.leadId), eq(leadsTable.tenantId, card.tenantId))).limit(1)
      : Promise.resolve([]),
    stageList(card),
    supportActivities(card),
  ]);

  const metadata = (card.metadata ?? {}) as Record<string, any>;
  const order = metadata.supportWorkOrder && typeof metadata.supportWorkOrder === "object"
    ? metadata.supportWorkOrder as Record<string, any>
    : {};
  const clientTimeline = Array.isArray(order.timeline)
    ? order.timeline.filter((entry: any) => entry?.visibility === "cliente")
    : [];

  const access = metadata.supportPublicAccess && typeof metadata.supportPublicAccess === "object"
    ? metadata.supportPublicAccess as Record<string, any>
    : {};
  await db.update(workCardsTable).set({
    metadata: { ...metadata, supportPublicAccess: { ...access, lastViewedAt: new Date().toISOString() } },
    updatedAt: new Date(),
  }).where(eq(workCardsTable.id, card.id));

  return res.json({
    case: {
      id: card.id,
      code: card.codigo,
      title: card.titulo,
      description: card.descricao,
      stage: card.etapa,
      priority: card.prioridade,
      openedAt: card.createdAt,
      updatedAt: card.updatedAt,
    },
    tenant: tenant ?? { name: "Atendimento", logoUrl: null, primaryColor: null },
    client: lead ? { name: lead.company || lead.name || "Cliente" } : { name: "Cliente" },
    stages,
    activities: activities.map(publicActivity).filter((activity) => activity.questions.length > 0),
    timeline: clientTimeline,
    sections: Array.isArray(order.sections) ? order.sections : [],
  });
});

publicSupportRouter.post("/public/support/:token/activities/:activityId/answers", async (req, res) => {
  const parsed = answerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message, issues: parsed.error.issues });

  const card = await findPublicCard(String(req.params.token));
  if (!card) return res.status(404).json({ error: "Atendimento não encontrado ou link inválido" });

  const [activity] = await db.select().from(activitiesTable).where(and(
    eq(activitiesTable.id, String(req.params.activityId)),
    eq(activitiesTable.tenantId, card.tenantId),
    eq(activitiesTable.workCardId, card.id),
  )).limit(1);
  if (!activity) return res.status(404).json({ error: "Atividade não encontrada" });

  const result = await applyAnswers({
    activity,
    incoming: parsed.data.answers,
    actorType: "cliente",
    actorName: "Cliente",
    complete: parsed.data.complete,
  });

  const metadata = (card.metadata ?? {}) as Record<string, any>;
  const order = metadata.supportWorkOrder && typeof metadata.supportWorkOrder === "object"
    ? metadata.supportWorkOrder as Record<string, any>
    : {};
  const timeline = Array.isArray(order.timeline) ? order.timeline : [];
  const entry = {
    at: new Date().toISOString(),
    userName: "Cliente",
    text: result.activity.status === "concluida"
      ? "Cliente atualizou as informações e concluiu a atividade."
      : "Cliente atualizou as informações da assistência.",
    visibility: "cliente",
    kind: "informacao_cliente",
  };
  await db.update(workCardsTable).set({
    metadata: {
      ...metadata,
      supportWorkOrder: { ...order, updatedAt: entry.at, timeline: [...timeline, entry].slice(-500) },
    },
    updatedAt: new Date(),
  }).where(eq(workCardsTable.id, card.id));

  return res.json({ activity: publicActivity(result.activity), missingRequired: result.missing.map((question) => question.id) });
});

publicSupportRouter.post(
  "/public/support/:token/activities/:activityId/questions/:questionId/evidence",
  evidenceUpload.single("file"),
  async (req, res) => {
    const card = await findPublicCard(String(req.params.token));
    if (!card) return res.status(404).json({ error: "Atendimento não encontrado ou link inválido" });
    if (!req.file) return res.status(422).json({ error: "Selecione um arquivo" });

    const [activity] = await db.select().from(activitiesTable).where(and(
      eq(activitiesTable.id, String(req.params.activityId)),
      eq(activitiesTable.tenantId, card.tenantId),
      eq(activitiesTable.workCardId, card.id),
    )).limit(1);
    if (!activity) return res.status(404).json({ error: "Atividade não encontrada" });

    const question = questionsFrom(activity).find((item) => item.id === String(req.params.questionId));
    if (!question || !publicQuestion(question) || !canClientAnswer(question)) {
      return res.status(403).json({ error: "Esta evidência não pode ser enviada pelo cliente" });
    }

    try {
      const result = await attachEvidence({
        card,
        activity,
        question,
        file: req.file,
        actorType: "cliente",
        actorName: "Cliente",
      });
      await appendSupportTimeline(
        card,
        {
          userName: "Cliente",
          text: `Cliente enviou evidência para: ${question.texto}.`,
          visibility: "cliente",
          kind: "evidencia_cliente",
        },
        req.log,
        false,
      );
      return res.status(201).json({
        attachment: { id: result.attachment.id, name: result.attachment.nome, mimeType: result.attachment.mimeType },
        activity: publicActivity(result.activity),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith("EVIDENCE_TYPE_MISMATCH:")) {
        return res.status(422).json({ error: `O arquivo não corresponde ao tipo de evidência solicitado (${message.split(":")[1]}).` });
      }
      req.log.error({ err: error, workCardId: card.id }, "support-public: falha ao salvar evidência");
      return res.status(500).json({ error: "Não foi possível salvar a evidência" });
    }
  },
);

export const supportExecutionRouter: IRouter = Router();

supportExecutionRouter.get("/work-cards/:id/support-activities", async (req, res) => {
  const [card] = await db.select().from(workCardsTable).where(eq(workCardsTable.id, String(req.params.id))).limit(1);
  if (!card || !["suporte", "execucao"].includes(card.pipeline)) return res.status(404).json({ error: "Processo operacional não encontrado" });
  if (req.user?.tenantId !== card.tenantId && req.user?.platformRole !== "super_admin") return res.status(403).json({ error: "Access denied" });

  const activities = await supportActivities(card);
  return res.json(activities.map((activity) => ({
    ...activity,
    questions: questionsFrom(activity),
    answers: answerMap(activity),
  })));
});

supportExecutionRouter.post("/work-cards/:id/support-activities/:activityId/answers", async (req, res) => {
  const parsed = answerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message, issues: parsed.error.issues });

  const [card] = await db.select().from(workCardsTable).where(eq(workCardsTable.id, String(req.params.id))).limit(1);
  if (!card || !["suporte", "execucao"].includes(card.pipeline)) return res.status(404).json({ error: "Processo operacional não encontrado" });
  if (req.user?.tenantId !== card.tenantId && req.user?.platformRole !== "super_admin") return res.status(403).json({ error: "Access denied" });

  const [activity] = await db.select().from(activitiesTable).where(and(
    eq(activitiesTable.id, String(req.params.activityId)),
    eq(activitiesTable.tenantId, card.tenantId),
    eq(activitiesTable.workCardId, card.id),
  )).limit(1);
  if (!activity) return res.status(404).json({ error: "Atividade não encontrada" });

  const [actor] = req.user?.sub
    ? await db.select({ name: usersTable.name }).from(usersTable)
        .where(and(eq(usersTable.id, req.user.sub), eq(usersTable.tenantId, card.tenantId))).limit(1)
    : [];

  const result = await applyAnswers({
    activity,
    incoming: parsed.data.answers,
    actorType: "usuario",
    actorId: req.user?.sub ?? null,
    actorName: actor?.name ?? "Equipe",
    complete: parsed.data.complete,
  });

  const activityQuestions = questionsFrom(activity);
  const visibleChanged = Object.keys(parsed.data.answers).some((id) => {
    const question = activityQuestions.find((item) => item.id === id);
    return Boolean(question && publicQuestion(question));
  });
  const clientRelevant = card.pipeline === "suporte"
    && (visibleChanged || (parsed.data.complete === true && activityQuestions.some(publicQuestion)));
  const activityLabel = activity.titulo.replace(/\s+—\s+(?:AST|PED|ENT|OP)-[^\s]+$/i, "");
  if (card.pipeline === "suporte") {
    await appendSupportTimeline(
      card,
      {
        userName: actor?.name ?? "Equipe",
        text: result.activity.status === "concluida"
          ? `Atividade concluída: ${activityLabel}.`
          : `Atividade atualizada: ${activityLabel}.`,
        visibility: clientRelevant ? "cliente" : "interno",
        kind: result.activity.status === "concluida" ? "atividade_concluida" : "atividade_atualizada",
      },
      req.log,
      clientRelevant,
    );
  }

  return res.json({
    activity: { ...result.activity, questions: questionsFrom(result.activity), answers: answerMap(result.activity) },
    missingRequired: result.missing.map((question) => question.id),
  });
});

supportExecutionRouter.post(
  "/work-cards/:id/support-activities/:activityId/questions/:questionId/evidence",
  evidenceUpload.single("file"),
  async (req, res) => {
    const [card] = await db.select().from(workCardsTable).where(eq(workCardsTable.id, String(req.params.id))).limit(1);
    if (!card || !["suporte", "execucao"].includes(card.pipeline)) return res.status(404).json({ error: "Processo operacional não encontrado" });
    if (req.user?.tenantId !== card.tenantId && req.user?.platformRole !== "super_admin") return res.status(403).json({ error: "Access denied" });
    if (!req.file) return res.status(422).json({ error: "Selecione um arquivo" });

    const [activity] = await db.select().from(activitiesTable).where(and(
      eq(activitiesTable.id, String(req.params.activityId)),
      eq(activitiesTable.tenantId, card.tenantId),
      eq(activitiesTable.workCardId, card.id),
    )).limit(1);
    if (!activity) return res.status(404).json({ error: "Atividade não encontrada" });

    const question = questionsFrom(activity).find((item) => item.id === String(req.params.questionId));
    if (!question || !canUserAnswer(question)) return res.status(403).json({ error: "Esta evidência não pode ser enviada pela equipe" });

    const [actor] = req.user?.sub
      ? await db.select({ name: usersTable.name }).from(usersTable)
          .where(and(eq(usersTable.id, req.user.sub), eq(usersTable.tenantId, card.tenantId))).limit(1)
      : [];

    try {
      const result = await attachEvidence({
        card,
        activity,
        question,
        file: req.file,
        actorType: "usuario",
        actorId: req.user?.sub ?? null,
        actorName: actor?.name ?? "Equipe",
      });
      const clientRelevant = card.pipeline === "suporte" && publicQuestion(question);
      if (card.pipeline === "suporte") {
        await appendSupportTimeline(
          card,
          {
            userName: actor?.name ?? "Equipe",
            text: `Nova evidência registrada em: ${question.texto}.`,
            visibility: clientRelevant ? "cliente" : "interno",
            kind: "evidencia_atividade",
          },
          req.log,
          clientRelevant,
        );
      }
      return res.status(201).json({
        attachment: result.attachment,
        activity: { ...result.activity, questions: questionsFrom(result.activity), answers: answerMap(result.activity) },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith("EVIDENCE_TYPE_MISMATCH:")) {
        return res.status(422).json({ error: `O arquivo não corresponde ao tipo de evidência solicitado (${message.split(":")[1]}).` });
      }
      req.log.error({ err: error, workCardId: card.id }, "support-execution: falha ao salvar evidência");
      return res.status(500).json({ error: "Não foi possível salvar a evidência" });
    }
  },
);

supportExecutionRouter.post("/work-cards/:id/support-public-link/ensure", async (req, res) => {
  const [card] = await db.select().from(workCardsTable).where(eq(workCardsTable.id, String(req.params.id))).limit(1);
  if (!card || card.pipeline !== "suporte") return res.status(404).json({ error: "Assistência não encontrada" });
  if (req.user?.tenantId !== card.tenantId && req.user?.platformRole !== "super_admin") return res.status(403).json({ error: "Access denied" });

  const metadata = (card.metadata ?? {}) as Record<string, any>;
  const current = metadata.supportPublicAccess && typeof metadata.supportPublicAccess === "object"
    ? metadata.supportPublicAccess as Record<string, any>
    : {};
  let token = typeof current.token === "string" ? current.token : "";
  let tokenHash = card.publicAccessTokenHash;

  if (!token || !tokenHash) {
    token = randomBytes(32).toString("base64url");
    tokenHash = sha256(token);
    const now = new Date().toISOString();
    await db.update(workCardsTable).set({
      publicAccessTokenHash: tokenHash,
      metadata: {
        ...metadata,
        supportPublicAccess: {
          ...current,
          version: 1,
          token,
          enabled: true,
          createdAt: current.createdAt ?? now,
          lastSentAt: current.lastSentAt ?? null,
          lastViewedAt: current.lastViewedAt ?? null,
        },
      },
      updatedAt: new Date(),
    }).where(eq(workCardsTable.id, card.id));
  }

  const baseUrl = (process.env.APP_URL || "https://app.appvendorai.com").replace(/\/$/, "");
  return res.json({ publicUrl: `${baseUrl}/assistencia/${encodeURIComponent(token)}`, token });
});

supportExecutionRouter.post("/work-cards/:id/support-public-link/resend", async (req, res) => {
  const [card] = await db.select().from(workCardsTable).where(eq(workCardsTable.id, String(req.params.id))).limit(1);
  if (!card || card.pipeline !== "suporte") return res.status(404).json({ error: "Assistência não encontrada" });
  if (req.user?.tenantId !== card.tenantId && req.user?.platformRole !== "super_admin") return res.status(403).json({ error: "Access denied" });

  const metadata = (card.metadata ?? {}) as Record<string, any>;
  const access = metadata.supportPublicAccess && typeof metadata.supportPublicAccess === "object"
    ? metadata.supportPublicAccess as Record<string, any>
    : {};
  const token = typeof access.token === "string" ? access.token : "";
  if (!token) return res.status(409).json({ error: "Este atendimento ainda não possui link público" });

  const [lead] = card.leadId
    ? await db.select({ phone: leadsTable.telefone }).from(leadsTable)
        .where(and(eq(leadsTable.id, card.leadId), eq(leadsTable.tenantId, card.tenantId))).limit(1)
    : [];
  if (!lead?.phone) return res.status(422).json({ error: "Cliente sem telefone cadastrado" });

  const baseUrl = (process.env.APP_URL || "https://app.appvendorai.com").replace(/\/$/, "");
  const publicUrl = `${baseUrl}/assistencia/${encodeURIComponent(token)}`;
  await sendDirectWhatsAppMessage(
    card.tenantId,
    lead.phone,
    `🛠️ Acompanhe sua assistência ${card.codigo}\n${publicUrl}\n\nEste é o mesmo link permanente do atendimento.`,
    req.log,
  );

  const sentAt = new Date().toISOString();
  await db.update(workCardsTable).set({
    metadata: { ...metadata, supportPublicAccess: { ...access, lastSentAt: sentAt } },
    updatedAt: new Date(),
  }).where(eq(workCardsTable.id, card.id));

  return res.json({ ok: true, publicUrl, sentAt });
});

export default supportExecutionRouter;
