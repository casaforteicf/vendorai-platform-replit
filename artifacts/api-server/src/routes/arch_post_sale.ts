import { Router } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";

// ─── Types ────────────────────────────────────────────────────────────────────
interface CreatePostSaleFromProductionPayload {
  projectId: string;
  proposalId?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
}

interface ChecklistPayload {
  deliveryId: string;
  projectId: string;
  category: string;
  label: string;
  done?: boolean;
  required?: boolean;
  responsible?: string | null;
  notes?: string | null;
  sortOrder?: number;
}

interface DeliveryTermPayload {
  deliveryId: string;
  projectId: string;
  title: string;
  clientName?: string | null;
  content: string;
}

interface FinalDocumentPayload {
  deliveryId: string;
  projectId: string;
  type: string;
  title: string;
  description?: string | null;
  fileUrl?: string | null;
  thumbnailUrl?: string | null;
  visibleToClient?: boolean;
}

interface SatisfactionPayload {
  deliveryId: string;
  projectId: string;
  nps?: number | null;
  satisfactionScore?: number | null;
  comment?: string | null;
  clientName?: string | null;
}

interface OpportunityPayload {
  deliveryId: string;
  projectId: string;
  type: string;
  status?: string;
  title: string;
  description?: string | null;
  estimatedValue?: number;
  nextAction?: string | null;
  dueDate?: string | null;
  ownerName?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function tenantId(req: any): string | null {
  return req?.user?.tenantId ?? req?.tenantId ?? null;
}

function publicToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

async function addEvent(
  projectId: string,
  deliveryId: string | null,
  type: string,
  message: string,
  actorType = "system",
  metadata: Record<string, unknown> = {},
) {
  await pool.query(
    `INSERT INTO arch_post_sale_events (id, delivery_id, project_id, type, message, actor_type, metadata, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,now())`,
    [crypto.randomUUID(), deliveryId, projectId, type, message, actorType, JSON.stringify(metadata)],
  );
}

// ─── Service ──────────────────────────────────────────────────────────────────
async function getPostSaleBundle(params: { tenantId?: string | null; projectId: string }) {
  const values: unknown[] = [params.projectId];
  const tenantClause = params.tenantId ? ` AND tenant_id = $${(values.push(params.tenantId), values.length)}` : "";

  const deliveryResult = await pool.query(
    `SELECT * FROM arch_deliveries WHERE project_id = $1${tenantClause} AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    values,
  );

  const delivery = deliveryResult.rows[0] ?? null;

  if (!delivery) {
    const events = await pool.query(
      `SELECT * FROM arch_post_sale_events WHERE project_id = $1 ORDER BY created_at DESC LIMIT 80`,
      [params.projectId],
    );
    return { delivery: null, checklist: [], terms: [], documents: [], surveys: [], testimonialRequests: [], opportunities: [], events: events.rows };
  }

  const deliveryId = delivery.id as string;

  const [checklist, terms, documents, surveys, testimonials, opportunities, events] = await Promise.all([
    pool.query(`SELECT * FROM arch_delivery_checklist WHERE delivery_id = $1 ORDER BY sort_order ASC, created_at ASC`, [deliveryId]),
    pool.query(`SELECT * FROM arch_delivery_terms WHERE delivery_id = $1 ORDER BY created_at DESC`, [deliveryId]),
    pool.query(`SELECT * FROM arch_final_documents WHERE delivery_id = $1 ORDER BY created_at DESC`, [deliveryId]),
    pool.query(`SELECT * FROM arch_satisfaction_surveys WHERE delivery_id = $1 ORDER BY created_at DESC`, [deliveryId]),
    pool.query(`SELECT * FROM arch_testimonial_requests WHERE delivery_id = $1 ORDER BY created_at DESC`, [deliveryId]),
    pool.query(`SELECT * FROM arch_future_opportunities WHERE delivery_id = $1 ORDER BY created_at DESC`, [deliveryId]),
    pool.query(`SELECT * FROM arch_post_sale_events WHERE project_id = $1 ORDER BY created_at DESC LIMIT 80`, [params.projectId]),
  ]);

  return {
    delivery,
    checklist: checklist.rows,
    terms: terms.rows,
    documents: documents.rows,
    surveys: surveys.rows,
    testimonialRequests: testimonials.rows,
    opportunities: opportunities.rows,
    events: events.rows,
  };
}

async function createPostSaleFromProduction(tId: string | null, payload: CreatePostSaleFromProductionPayload) {
  const existing = await pool.query(
    `SELECT id FROM arch_deliveries WHERE project_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    [payload.projectId],
  );
  if (existing.rows[0]) return getPostSaleBundle({ tenantId: tId, projectId: payload.projectId });

  const deliveryId = crypto.randomUUID();

  await pool.query(
    `INSERT INTO arch_deliveries (id, tenant_id, project_id, proposal_id, client_name, client_email, client_phone, status, summary, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'in-progress',$8,now(),now())`,
    [deliveryId, tId, payload.projectId, payload.proposalId ?? null, payload.clientName ?? null, payload.clientEmail ?? null, payload.clientPhone ?? null, "Pós-venda iniciado a partir da conclusão operacional."],
  );

  const defaults: [string, string][] = [
    ["execution",      "Conferir execução conforme projeto aprovado"],
    ["quality",        "Conferir acabamento e qualidade final"],
    ["cleaning",       "Conferir limpeza final do ambiente"],
    ["documentation",  "Anexar fotos finais"],
    ["documentation",  "Anexar garantias e manuais"],
    ["client-approval","Gerar termo de entrega"],
    ["client-approval","Registrar aceite do cliente"],
    ["warranty",       "Orientar cliente sobre garantias e cuidados"],
  ];

  for (let i = 0; i < defaults.length; i++) {
    await pool.query(
      `INSERT INTO arch_delivery_checklist (id, delivery_id, project_id, category, label, done, required, sort_order, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,false,true,$6,now(),now())`,
      [crypto.randomUUID(), deliveryId, payload.projectId, defaults[i]![0], defaults[i]![1], i],
    );
  }

  await addEvent(payload.projectId, deliveryId, "created", "Pós-venda iniciado.", "system");
  return getPostSaleBundle({ tenantId: tId, projectId: payload.projectId });
}

async function createChecklistItem(tId: string | null, payload: ChecklistPayload) {
  const result = await pool.query(
    `INSERT INTO arch_delivery_checklist (id, delivery_id, project_id, category, label, done, required, responsible, notes, sort_order, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),now()) RETURNING *`,
    [crypto.randomUUID(), payload.deliveryId, payload.projectId, payload.category, payload.label,
     payload.done ?? false, payload.required ?? true, payload.responsible ?? null, payload.notes ?? null, Number(payload.sortOrder ?? 0)],
  );
  await addEvent(payload.projectId, payload.deliveryId, "checklist-updated", "Item adicionado ao checklist de entrega.", "internal");
  return result.rows[0];
}

async function updateChecklistItem(id: string, payload: Partial<ChecklistPayload>) {
  const cur = await pool.query(`SELECT * FROM arch_delivery_checklist WHERE id = $1`, [id]);
  const current = cur.rows[0];
  if (!current) return null;

  const allowed: Record<string, string> = { category: "category", label: "label", done: "done", required: "required", responsible: "responsible", notes: "notes", sortOrder: "sort_order" };
  const sets: string[] = [];
  const values: unknown[] = [];

  for (const [key, col] of Object.entries(allowed)) {
    if ((payload as Record<string, unknown>)[key] === undefined) continue;
    values.push((payload as Record<string, unknown>)[key]);
    sets.push(`${col} = $${values.length}`);
  }

  if (payload.done !== undefined) {
    values.push(payload.done ? new Date() : null);
    sets.push(`completed_at = $${values.length}`);
  }

  if (sets.length === 0) return current;

  values.push(new Date()); sets.push(`updated_at = $${values.length}`);
  values.push(id);

  const result = await pool.query(
    `UPDATE arch_delivery_checklist SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING *`,
    values,
  );

  await addEvent(current.project_id as string, current.delivery_id as string, "checklist-updated", "Checklist atualizado.", "internal", { checklistItemId: id });
  return result.rows[0] ?? null;
}

async function createDeliveryTerm(payload: DeliveryTermPayload) {
  const result = await pool.query(
    `INSERT INTO arch_delivery_terms (id, delivery_id, project_id, title, client_name, content, accepted, public_token, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,false,$7,now()) RETURNING *`,
    [crypto.randomUUID(), payload.deliveryId, payload.projectId, payload.title, payload.clientName ?? null, payload.content, publicToken()],
  );
  await addEvent(payload.projectId, payload.deliveryId, "term-generated", "Termo de entrega gerado.", "internal");
  return result.rows[0];
}

async function acceptDeliveryTerm(termId: string, payload: { acceptedBy?: string; signatureUrl?: string }) {
  const cur = await pool.query(`SELECT * FROM arch_delivery_terms WHERE id = $1`, [termId]);
  const current = cur.rows[0];
  if (!current) return null;

  const result = await pool.query(
    `UPDATE arch_delivery_terms SET accepted = true, accepted_by = $2, accepted_at = now(), signature_url = $3 WHERE id = $1 RETURNING *`,
    [termId, payload.acceptedBy ?? null, payload.signatureUrl ?? null],
  );

  await pool.query(
    `UPDATE arch_deliveries SET status = 'accepted', accepted_at = now(), updated_at = now() WHERE id = $1`,
    [current.delivery_id],
  );

  await addEvent(current.project_id as string, current.delivery_id as string, "term-accepted", "Cliente aceitou o termo de entrega.", "client", { acceptedBy: payload.acceptedBy ?? null });
  return result.rows[0] ?? null;
}

async function createFinalDocument(payload: FinalDocumentPayload) {
  const result = await pool.query(
    `INSERT INTO arch_final_documents (id, delivery_id, project_id, type, title, description, file_url, thumbnail_url, visible_to_client, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) RETURNING *`,
    [crypto.randomUUID(), payload.deliveryId, payload.projectId, payload.type, payload.title,
     payload.description ?? null, payload.fileUrl ?? null, payload.thumbnailUrl ?? null, payload.visibleToClient ?? true],
  );
  await addEvent(payload.projectId, payload.deliveryId, "document-added", "Documento final adicionado.", "internal", { title: payload.title, type: payload.type });
  return result.rows[0];
}

async function createSatisfactionSurvey(payload: SatisfactionPayload) {
  const hasAnswer = payload.nps !== undefined || payload.satisfactionScore !== undefined;
  const result = await pool.query(
    `INSERT INTO arch_satisfaction_surveys (id, delivery_id, project_id, status, nps, satisfaction_score, comment, client_name, public_token, sent_at, answered_at, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$10,now()) RETURNING *`,
    [crypto.randomUUID(), payload.deliveryId, payload.projectId,
     hasAnswer ? "answered" : "sent",
     payload.nps ?? null, payload.satisfactionScore ?? null, payload.comment ?? null, payload.clientName ?? null,
     publicToken(), hasAnswer ? new Date() : null],
  );
  await pool.query(
    `UPDATE arch_deliveries SET nps = $2, satisfaction_score = $3, updated_at = now() WHERE id = $1`,
    [payload.deliveryId, payload.nps ?? null, payload.satisfactionScore ?? null],
  );
  await addEvent(payload.projectId, payload.deliveryId, hasAnswer ? "survey-answered" : "survey-sent", "Pesquisa de satisfação registrada.", "internal");
  return result.rows[0];
}

async function createTestimonialRequest(payload: { deliveryId: string; projectId: string; channel: string; message: string }) {
  const result = await pool.query(
    `INSERT INTO arch_testimonial_requests (id, delivery_id, project_id, status, channel, message, created_at, updated_at)
     VALUES ($1,$2,$3,'sent',$4,$5,now(),now()) RETURNING *`,
    [crypto.randomUUID(), payload.deliveryId, payload.projectId, payload.channel, payload.message],
  );
  await addEvent(payload.projectId, payload.deliveryId, "testimonial-requested", "Pedido de depoimento enviado.", "internal", { channel: payload.channel });
  return result.rows[0];
}

async function createFutureOpportunity(tId: string | null, payload: OpportunityPayload) {
  const result = await pool.query(
    `INSERT INTO arch_future_opportunities (id, tenant_id, delivery_id, project_id, type, status, title, description, estimated_value, next_action, due_date, owner_name, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now(),now()) RETURNING *`,
    [crypto.randomUUID(), tId, payload.deliveryId, payload.projectId, payload.type, payload.status ?? "identified",
     payload.title, payload.description ?? null, Number(payload.estimatedValue ?? 0),
     payload.nextAction ?? null, payload.dueDate ?? null, payload.ownerName ?? null],
  );
  await addEvent(payload.projectId, payload.deliveryId, "opportunity-created", "Oportunidade futura criada.", "internal", { title: payload.title, type: payload.type });
  return result.rows[0];
}

async function updateFutureOpportunity(id: string, tId: string | null, payload: Partial<OpportunityPayload>) {
  const allowed: Record<string, string> = {
    type: "type", status: "status", title: "title", description: "description",
    estimatedValue: "estimated_value", nextAction: "next_action", dueDate: "due_date", ownerName: "owner_name",
  };

  const sets: string[] = [];
  const values: unknown[] = [];

  for (const [key, col] of Object.entries(allowed)) {
    if ((payload as Record<string, unknown>)[key] === undefined) continue;
    values.push((payload as Record<string, unknown>)[key]);
    sets.push(`${col} = $${values.length}`);
  }

  if (sets.length === 0) {
    const cur = await pool.query(`SELECT * FROM arch_future_opportunities WHERE id = $1`, [id]);
    return cur.rows[0] ?? null;
  }

  values.push(new Date()); sets.push(`updated_at = $${values.length}`);
  values.push(id);
  let where = `id = $${values.length}`;
  if (tId) { values.push(tId); where += ` AND tenant_id = $${values.length}`; }

  const result = await pool.query(
    `UPDATE arch_future_opportunities SET ${sets.join(", ")} WHERE ${where} RETURNING *`,
    values,
  );
  return result.rows[0] ?? null;
}

// ─── Router ───────────────────────────────────────────────────────────────────
const archPostSaleRouter = Router();

archPostSaleRouter.get("/arch/pos-venda", async (req, res, next) => {
  try {
    const projectId = String(req.query["projectId"] ?? "");
    if (!projectId) { res.status(400).json({ error: "projectId é obrigatório" }); return; }
    const result = await getPostSaleBundle({ tenantId: tenantId(req), projectId });
    res.json(result);
  } catch (err) {
    logger.error({ err }, "arch/pos-venda GET error");
    next(err);
  }
});

archPostSaleRouter.post("/arch/pos-venda/from-production", async (req, res, next) => {
  try {
    const result = await createPostSaleFromProduction(tenantId(req), req.body as CreatePostSaleFromProductionPayload);
    res.status(201).json(result);
  } catch (err) {
    logger.error({ err }, "arch/pos-venda/from-production error");
    next(err);
  }
});

archPostSaleRouter.post("/arch/pos-venda/delivery-checklist", async (req, res, next) => {
  try {
    const item = await createChecklistItem(tenantId(req), req.body as ChecklistPayload);
    res.status(201).json({ item });
  } catch (err) {
    logger.error({ err }, "arch/pos-venda/delivery-checklist POST error");
    next(err);
  }
});

archPostSaleRouter.patch("/arch/pos-venda/delivery-checklist/:id", async (req, res, next) => {
  try {
    const item = await updateChecklistItem(req.params["id"]!, req.body as Partial<ChecklistPayload>);
    res.json({ item });
  } catch (err) {
    logger.error({ err }, "arch/pos-venda/delivery-checklist PATCH error");
    next(err);
  }
});

archPostSaleRouter.post("/arch/pos-venda/delivery-term", async (req, res, next) => {
  try {
    const term = await createDeliveryTerm(req.body as DeliveryTermPayload);
    res.status(201).json({ term });
  } catch (err) {
    logger.error({ err }, "arch/pos-venda/delivery-term error");
    next(err);
  }
});

archPostSaleRouter.post("/arch/pos-venda/delivery-term/:id/accept", async (req, res, next) => {
  try {
    const term = await acceptDeliveryTerm(req.params["id"]!, req.body);
    if (!term) { res.status(404).json({ error: "Termo não encontrado" }); return; }
    res.json({ term });
  } catch (err) {
    logger.error({ err }, "arch/pos-venda/delivery-term/:id/accept error");
    next(err);
  }
});

archPostSaleRouter.post("/arch/pos-venda/final-documents", async (req, res, next) => {
  try {
    const document = await createFinalDocument(req.body as FinalDocumentPayload);
    res.status(201).json({ document });
  } catch (err) {
    logger.error({ err }, "arch/pos-venda/final-documents error");
    next(err);
  }
});

archPostSaleRouter.post("/arch/pos-venda/satisfaction", async (req, res, next) => {
  try {
    const survey = await createSatisfactionSurvey(req.body as SatisfactionPayload);
    res.status(201).json({ survey });
  } catch (err) {
    logger.error({ err }, "arch/pos-venda/satisfaction error");
    next(err);
  }
});

archPostSaleRouter.post("/arch/pos-venda/testimonial-request", async (req, res, next) => {
  try {
    const request = await createTestimonialRequest(req.body);
    res.status(201).json({ request });
  } catch (err) {
    logger.error({ err }, "arch/pos-venda/testimonial-request error");
    next(err);
  }
});

archPostSaleRouter.post("/arch/pos-venda/opportunities", async (req, res, next) => {
  try {
    const opportunity = await createFutureOpportunity(tenantId(req), req.body as OpportunityPayload);
    res.status(201).json({ opportunity });
  } catch (err) {
    logger.error({ err }, "arch/pos-venda/opportunities POST error");
    next(err);
  }
});

archPostSaleRouter.patch("/arch/pos-venda/opportunities/:id", async (req, res, next) => {
  try {
    const opportunity = await updateFutureOpportunity(req.params["id"]!, tenantId(req), req.body as Partial<OpportunityPayload>);
    if (!opportunity) { res.status(404).json({ error: "Oportunidade não encontrada" }); return; }
    res.json({ opportunity });
  } catch (err) {
    logger.error({ err }, "arch/pos-venda/opportunities PATCH error");
    next(err);
  }
});

export default archPostSaleRouter;
