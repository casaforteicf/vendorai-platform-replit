import { Router } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";

// ─── Types ────────────────────────────────────────────────────────────────────
interface CreateProposalFromBudgetPayload {
  projectId: string;
  budgetId: string;
  title: string;
  clientName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  expiresAt?: string | null;
}

interface SendProposalPayload {
  channels: Array<"portal" | "email" | "whatsapp" | "manual">;
  email?: string | null;
  phone?: string | null;
  message?: string | null;
}

interface ClientDecisionPayload {
  clientName?: string | null;
  comment?: string | null;
  decision: "approve" | "reject" | "revision";
}

interface ClientItemDecisionPayload {
  decision: "approve" | "reject" | "comment";
  comment?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function genToken() {
  return crypto.randomUUID().replace(/-/g, "");
}

function tenantId(req: any): string | null {
  return req?.user?.tenantId ?? req?.tenantId ?? null;
}

async function addEvent(
  proposalId: string,
  type: string,
  actorType: string,
  message: string,
  metadata: Record<string, unknown> = {},
  actorName: string | null = null,
) {
  await pool.query(
    `INSERT INTO arch_proposal_events (id, proposal_id, type, actor_type, actor_name, message, metadata, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,now())`,
    [crypto.randomUUID(), proposalId, type, actorType, actorName, message, JSON.stringify(metadata)],
  );
}

async function getProposalBundleById(proposalId: string, options: { publicView?: boolean } = {}) {
  const proposalResult = await pool.query(
    `SELECT p.*, t.name AS tenant_name, t.logo_url AS tenant_logo_url, t.cor_primaria AS tenant_primary_color
       FROM arch_proposals p
       LEFT JOIN tenants t ON t.id::text = p.tenant_id::text
      WHERE p.id = $1`,
    [proposalId],
  );
  const proposal = proposalResult.rows[0] ?? null;
  if (!proposal) return { proposal: null, items: [], events: [], deliveries: [] };

  const itemsSql = options.publicView
    ? `SELECT pi.id, pi.proposal_id, pi.budget_item_id, pi.spec_object_id,
              pi.item, pi.description, pi.quantity, pi.unit, pi.total,
              pi.visible_to_client, pi.approval_status, pi.client_comment,
              pi.approved_at, pi.rejected_at, pi.sort_order, pi.created_at, pi.updated_at,
              aso.product_name, aso.material_name, aso.manufacturer_name, aso.catalog_code,
              aso.width_mm, aso.height_mm, aso.depth_mm, aso.length_mm,
              aso.area_m2, aso.perimeter_m, aso.volume_m3,
              aso.project_revision, aso.measurement_source, aso.measurement_revision
         FROM arch_proposal_items pi
         LEFT JOIN arch_spec_objects aso ON aso.id = pi.spec_object_id
        WHERE pi.proposal_id = $1
          AND pi.visible_to_client = true
        ORDER BY pi.sort_order ASC, pi.created_at ASC`
    : `SELECT pi.*, aso.product_name, aso.material_name, aso.manufacturer_name, aso.catalog_code,
              aso.width_mm, aso.height_mm, aso.depth_mm, aso.length_mm,
              aso.area_m2, aso.perimeter_m, aso.volume_m3,
              aso.project_revision, aso.measurement_source, aso.measurement_revision
         FROM arch_proposal_items pi
         LEFT JOIN arch_spec_objects aso ON aso.id = pi.spec_object_id
        WHERE pi.proposal_id = $1
        ORDER BY pi.sort_order ASC, pi.created_at ASC`;

  const [itemsResult, eventsResult, deliveriesResult] = await Promise.all([
    pool.query(itemsSql, [proposalId]),
    pool.query(`SELECT * FROM arch_proposal_events WHERE proposal_id = $1 ORDER BY created_at DESC`, [proposalId]),
    options.publicView
      ? Promise.resolve({ rows: [] as any[] })
      : pool.query(`SELECT * FROM arch_proposal_deliveries WHERE proposal_id = $1 ORDER BY created_at DESC`, [proposalId]),
  ]);

  if (options.publicView) {
    // Never expose internal technical cost components, internal notes, delivery destinations
    // or tenant-only fields through a public token.
    proposal.public_view = true;
    delete proposal.subtotal_material;
    delete proposal.subtotal_labor;
    delete proposal.subtotal;
    delete proposal.discount_total;
    delete proposal.internal_notes;
  }

  return {
    proposal,
    items: itemsResult.rows,
    events: options.publicView
      ? eventsResult.rows.map((event: any) => ({
          id: event.id,
          proposal_id: event.proposal_id,
          type: event.type,
          actor_type: event.actor_type,
          actor_name: event.actor_type === "client" ? event.actor_name : null,
          message: event.message,
          created_at: event.created_at,
        }))
      : eventsResult.rows,
    deliveries: deliveriesResult.rows,
  };
}

async function refreshProposalStatus(proposalId: string) {
  const items = await pool.query(`SELECT approval_status FROM arch_proposal_items WHERE proposal_id = $1`, [proposalId]);
  const statuses = items.rows.map((r: any) => r.approval_status as string);
  if (!statuses.length) return;

  const allApproved = statuses.every(s => s === "approved");
  const anyApproved = statuses.some(s => s === "approved");
  const anyRejected = statuses.some(s => s === "rejected");

  const next = allApproved ? "approved" : (anyApproved || anyRejected) ? "partially-approved" : null;
  if (!next) return;

  await pool.query(`UPDATE arch_proposals SET status = $1, updated_at = now() WHERE id = $2`, [next, proposalId]);
}

// ─── Service ──────────────────────────────────────────────────────────────────
async function getProposalByProject(params: { tenantId?: string | null; projectId: string }) {
  const values: unknown[] = [params.projectId];
  let where = `project_id = $1 AND deleted_at IS NULL`;
  if (params.tenantId) {
    values.push(params.tenantId);
    where += ` AND tenant_id = $${values.length}`;
  }

  const result = await pool.query(
    `SELECT * FROM arch_proposals WHERE ${where} ORDER BY created_at DESC LIMIT 1`,
    values,
  );

  const proposal = result.rows[0] ?? null;
  if (!proposal) return { proposal: null, items: [], events: [], deliveries: [] };

  return getProposalBundleById(proposal.id);
}

async function createProposalFromBudget(tId: string | null, payload: CreateProposalFromBudgetPayload) {
  const budgetValues: unknown[] = [payload.budgetId];
  let budgetWhere = "id = $1";
  if (tId) {
    budgetValues.push(tId);
    budgetWhere += " AND tenant_id::text = $2";
  }
  const budgetResult = await pool.query(`SELECT * FROM arch_budgets WHERE ${budgetWhere} AND deleted_at IS NULL LIMIT 1`, budgetValues);
  const budget = budgetResult.rows[0];
  if (!budget) throw new Error("Orçamento não encontrado");

  const outdatedResult = await pool.query(
    `SELECT id, item, specification_revision, specification_impact
       FROM arch_budget_items
      WHERE budget_id=$1
        AND deleted_at IS NULL
        AND specification_outdated=TRUE`,
    [payload.budgetId],
  );
  if (outdatedResult.rows.length) {
    const error = new Error("Existem itens com especificação desatualizada. Revise a especificação antes de gerar a proposta.");
    (error as any).statusCode = 409;
    (error as any).code = "SPECIFICATION_OUTDATED";
    (error as any).items = outdatedResult.rows;
    throw error;
  }

  if (budget.sale_total == null || Number(budget.sale_total) <= 0) {
    const error = new Error("Defina o preço de venda comercial no orçamento antes de gerar a proposta.");
    (error as any).statusCode = 422;
    throw error;
  }

  const proposalId = crypto.randomUUID();
  const previousVersion = await pool.query(
    `SELECT COALESCE(MAX(version),0)::int AS latest
       FROM arch_proposals
      WHERE project_id=$1::uuid AND tenant_id::text=COALESCE($2::text,tenant_id::text) AND deleted_at IS NULL`,
    [payload.projectId, tId],
  );
  const nextVersion = Number(previousVersion.rows[0]?.latest || 0) + 1;
  const commercialTotal = Number(budget.sale_total);

  const proposalResult = await pool.query(
    `INSERT INTO arch_proposals (
      id, tenant_id, project_id, budget_id, portal_token,
      title, client_name, client_email, client_phone,
      status, version,
      subtotal_material, subtotal_labor, subtotal, discount_total, grand_total,
      expires_at, client_notes, internal_notes, created_at, updated_at
    ) VALUES (
      $1,$2,$3,$4,null,
      $5,$6,$7,$8,
      'ready',$9,
      $10,$11,$12,$13,$14,
      $15,$16,$17,now(),now()
    ) RETURNING *`,
    [
      proposalId, tId, payload.projectId, payload.budgetId,
      payload.title,
      payload.clientName ?? budget.client_name ?? null,
      payload.clientEmail ?? null,
      payload.clientPhone ?? null,
      nextVersion,
      Number(budget.subtotal_material ?? 0),
      Number(budget.subtotal_labor ?? 0),
      Number(budget.subtotal ?? 0),
      Number(budget.discount_total ?? 0),
      commercialTotal,
      payload.expiresAt ?? null,
      budget.client_notes ?? null,
      budget.internal_notes ?? null,
    ],
  );

  const budgetItemsResult = await pool.query(
    `SELECT * FROM arch_budget_items WHERE budget_id = $1 AND deleted_at IS NULL ORDER BY sort_order ASC, created_at ASC`,
    [payload.budgetId],
  );

  for (const item of budgetItemsResult.rows) {
    if (item.visible_to_client === false) continue;
    await pool.query(
      `INSERT INTO arch_proposal_items (
        id, proposal_id, budget_item_id, spec_object_id,
        item, description, quantity, unit,
        material_value, labor_value, total,
        visible_to_client, approval_status, sort_order, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,'pending',$12,now(),now())`,
      [
        crypto.randomUUID(), proposalId, item.id, item.spec_object_id ?? null,
        item.item, item.description ?? null,
        Number(item.quantity ?? 1), item.unit ?? "un",
        Number(item.material_value ?? 0), Number(item.labor_value ?? 0), Number(item.sale_total ?? item.total ?? 0),
        Number(item.sort_order ?? 0),
      ],
    );
  }

  await addEvent(
    proposalResult.rows[0].id,
    "created",
    "internal",
    "Proposta criada a partir do orçamento com preço comercial congelado.",
    { budgetId: payload.budgetId, version: nextVersion, technicalCost: Number(budget.grand_total ?? 0), saleTotal: commercialTotal },
  );

  return getProposalBundleById(proposalResult.rows[0].id);
}

async function activateProposalPortal(tId: string | null, proposalId: string, payload: { regenerateToken?: boolean; expiresAt?: string | null }) {
  const current = await pool.query(`SELECT * FROM arch_proposals WHERE id = $1`, [proposalId]);
  const proposal = current.rows[0];
  if (!proposal) throw new Error("Proposta não encontrada");

  const nextToken = payload.regenerateToken || !proposal.portal_token ? genToken() : proposal.portal_token;

  const values: unknown[] = [nextToken, payload.expiresAt ?? proposal.expires_at ?? null, proposalId];
  let where = `id = $3`;
  if (tId) {
    values.push(tId);
    where += ` AND tenant_id = $${values.length}`;
  }

  const result = await pool.query(
    `UPDATE arch_proposals SET portal_token = $1, expires_at = $2, updated_at = now() WHERE ${where} RETURNING *`,
    values,
  );

  await addEvent(proposalId, "portal-activated", "internal", "Portal público ativado.", { token: nextToken });

  return result.rows[0];
}

async function sendProposal(tId: string | null, proposalId: string, payload: SendProposalPayload) {
  const values: unknown[] = [proposalId];
  let where = `id = $1`;
  if (tId) {
    values.push(tId);
    where += ` AND tenant_id = $${values.length}`;
  }

  await pool.query(
    `UPDATE arch_proposals SET status = 'sent', sent_at = now(), updated_at = now() WHERE ${where}`,
    values,
  );

  for (const channel of payload.channels ?? ["portal"]) {
    await pool.query(
      `INSERT INTO arch_proposal_deliveries (id, proposal_id, channel, destination, status, message, sent_at, created_at)
       VALUES ($1,$2,$3,$4,'sent',$5,now(),now())`,
      [
        crypto.randomUUID(), proposalId, channel,
        channel === "email" ? payload.email ?? null : channel === "whatsapp" ? payload.phone ?? null : null,
        payload.message ?? null,
      ],
    );
  }

  await addEvent(proposalId, "sent", "internal", "Proposta enviada ao cliente.", payload as unknown as Record<string, unknown>);

  return getProposalBundleById(proposalId);
}

async function getPublicProposal(portalToken: string) {
  const result = await pool.query(
    `SELECT * FROM arch_proposals WHERE portal_token = $1 AND deleted_at IS NULL`,
    [portalToken],
  );
  const proposal = result.rows[0];
  if (!proposal) throw new Error("Proposta não encontrada");

  if (!proposal.viewed_at) {
    await pool.query(
      `UPDATE arch_proposals SET status = CASE WHEN status = 'sent' THEN 'viewed' ELSE status END, viewed_at = now(), updated_at = now() WHERE id = $1`,
      [proposal.id],
    );
    await addEvent(proposal.id, "viewed", "client", "Cliente visualizou a proposta.");
  }

  return getProposalBundleById(proposal.id, { publicView: true });
}

async function clientItemDecision(portalToken: string, itemId: string, payload: ClientItemDecisionPayload) {
  const bundle = await getPublicProposal(portalToken);
  if (!bundle.proposal) throw new Error("Proposta não encontrada");

  const approvalStatus =
    payload.decision === "approve" ? "approved" :
    payload.decision === "reject" ? "rejected" :
    "commented";

  await pool.query(
    `UPDATE arch_proposal_items
     SET approval_status = $1, client_comment = $2,
         approved_at = CASE WHEN $1 = 'approved' THEN now() ELSE approved_at END,
         rejected_at = CASE WHEN $1 = 'rejected' THEN now() ELSE rejected_at END,
         updated_at = now()
     WHERE id = $3 AND proposal_id = $4`,
    [approvalStatus, payload.comment ?? null, itemId, (bundle.proposal as any).id],
  );

  const eventType = payload.decision === "approve" ? "item-approved" : payload.decision === "reject" ? "item-rejected" : "comment";
  const eventMsg = payload.decision === "approve" ? "Cliente aprovou um item." : payload.decision === "reject" ? "Cliente reprovou um item." : "Cliente comentou um item.";
  await addEvent((bundle.proposal as any).id, eventType, "client", eventMsg, { itemId, comment: payload.comment ?? null });

  await refreshProposalStatus((bundle.proposal as any).id);
  return getProposalBundleById((bundle.proposal as any).id, { publicView: true });
}

async function clientFinalDecision(portalToken: string, payload: ClientDecisionPayload) {
  const bundle = await getPublicProposal(portalToken);
  if (!bundle.proposal) throw new Error("Proposta não encontrada");

  const status =
    payload.decision === "approve" ? "approved" :
    payload.decision === "reject" ? "rejected" :
    "partially-approved";

  await pool.query(
    `UPDATE arch_proposals
     SET status = $1,
         approved_at = CASE WHEN $1 = 'approved' THEN now() ELSE approved_at END,
         rejected_at = CASE WHEN $1 = 'rejected' THEN now() ELSE rejected_at END,
         updated_at = now()
     WHERE id = $2`,
    [status, (bundle.proposal as any).id],
  );

  const eventType = payload.decision === "approve" ? "approved" : payload.decision === "reject" ? "rejected" : "revision-requested";
  const eventMsg = payload.decision === "approve" ? "Cliente aprovou a proposta." : payload.decision === "reject" ? "Cliente reprovou a proposta." : "Cliente solicitou revisão da proposta.";
  await addEvent((bundle.proposal as any).id, eventType, "client", eventMsg, { comment: payload.comment ?? null }, payload.clientName ?? null);

  return getProposalBundleById((bundle.proposal as any).id, { publicView: true });
}

// ─── Router ───────────────────────────────────────────────────────────────────
const archClientPortalApprovalRouter = Router();
export const archClientPortalApprovalPublicRouter = Router();

archClientPortalApprovalRouter.get("/arch/propostas", async (req, res, next) => {
  try {
    const projectId = String(req.query["projectId"] ?? "");
    if (!projectId) { res.status(400).json({ error: "projectId é obrigatório" }); return; }
    const result = await getProposalByProject({ tenantId: tenantId(req), projectId });
    res.json(result);
  } catch (err) {
    logger.error({ err }, "arch/propostas GET error");
    next(err);
  }
});

archClientPortalApprovalRouter.post("/arch/propostas/from-budget", async (req, res, next) => {
  try {
    const result = await createProposalFromBudget(tenantId(req), req.body as CreateProposalFromBudgetPayload);
    res.status(201).json(result);
  } catch (err) {
    logger.error({ err }, "arch/propostas/from-budget error");
    const statusCode = Number((err as any)?.statusCode || 0);
    if (statusCode >= 400 && statusCode < 500) {
      res.status(statusCode).json({
        error: err instanceof Error ? err.message : "Não foi possível gerar a proposta.",
        code: (err as any)?.code,
        items: (err as any)?.items,
      });
      return;
    }
    next(err);
  }
});

archClientPortalApprovalRouter.post("/arch/propostas/:id/portal/ativar", async (req, res, next) => {
  try {
    const proposal = await activateProposalPortal(tenantId(req), req.params["id"]!, req.body);
    res.json({ proposal });
  } catch (err) {
    logger.error({ err }, "arch/propostas/:id/portal/ativar error");
    next(err);
  }
});

archClientPortalApprovalRouter.post("/arch/propostas/:id/send", async (req, res, next) => {
  try {
    const result = await sendProposal(tenantId(req), req.params["id"]!, req.body as SendProposalPayload);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "arch/propostas/:id/send error");
    next(err);
  }
});

// ─── Public routes (no auth required) ────────────────────────────────────────
archClientPortalApprovalPublicRouter.get("/arch/portal/proposta/:token", async (req, res, next) => {
  try {
    const result = await getPublicProposal(req.params["token"]!);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "arch/portal/proposta GET error");
    next(err);
  }
});

archClientPortalApprovalPublicRouter.post("/arch/portal/proposta/:token/items/:itemId/decision", async (req, res, next) => {
  try {
    const result = await clientItemDecision(req.params["token"]!, req.params["itemId"]!, req.body as ClientItemDecisionPayload);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "arch/portal/proposta/:token/items/:itemId/decision error");
    next(err);
  }
});

archClientPortalApprovalPublicRouter.post("/arch/portal/proposta/:token/decision", async (req, res, next) => {
  try {
    const result = await clientFinalDecision(req.params["token"]!, req.body as ClientDecisionPayload);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "arch/portal/proposta/:token/decision error");
    next(err);
  }
});

export default archClientPortalApprovalRouter;
