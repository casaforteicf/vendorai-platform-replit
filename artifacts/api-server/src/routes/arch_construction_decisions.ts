import { Router, type IRouter } from "express";
import multer from "multer";
import { z } from "zod/v4";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { ObjectStorageService } from "../lib/objectStorage.js";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    const allowed = file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/") || file.mimetype === "application/pdf";
    if (allowed) return cb(null, true);
    cb(new Error("Formato não permitido. Envie imagem, vídeo ou PDF."));
  },
});

const statusSchema = z.enum(["pending", "approved", "rejected", "cancelled"]);
const decisionTypeSchema = z.enum(["client", "technical", "commercial", "scope_change"]);
const prioritySchema = z.enum(["low", "medium", "high", "critical"]);
const revisionSchema = z.enum(["not-required", "pending", "applied"]);

const createSchema = z.object({
  projectId: z.string().min(1),
  etapaId: z.string().nullable().optional(),
  budgetId: z.string().nullable().optional(),
  proposalId: z.string().nullable().optional(),
  title: z.string().min(1).max(500),
  description: z.string().max(15000).nullable().optional(),
  category: z.string().max(200).nullable().optional(),
  decisionType: decisionTypeSchema.default("client"),
  priority: prioritySchema.default("medium"),
  responsible: z.string().max(300).nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  financialImpact: z.number().finite().default(0),
  scheduleImpactDays: z.number().int().min(-3650).max(3650).default(0),
  requiresBudgetRevision: z.boolean().default(false),
  source: z.string().max(100).default("manual"),
  options: z.array(z.string().min(1).max(1000)).max(20).default([]),
});

const updateSchema = z.object({
  etapaId: z.string().nullable().optional(),
  budgetId: z.string().nullable().optional(),
  proposalId: z.string().nullable().optional(),
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(15000).nullable().optional(),
  category: z.string().max(200).nullable().optional(),
  decisionType: decisionTypeSchema.optional(),
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  responsible: z.string().max(300).nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  decisionComment: z.string().max(15000).nullable().optional(),
  financialImpact: z.number().finite().optional(),
  scheduleImpactDays: z.number().int().min(-3650).max(3650).optional(),
  requiresBudgetRevision: z.boolean().optional(),
  budgetRevisionStatus: revisionSchema.optional(),
  selectedOption: z.string().max(1000).nullable().optional(),
});

function tenantId(req: any): string | null {
  return req?.user?.tenantId ?? req?.tenantId ?? null;
}

function requireTenant(req: any, res: any): string | null {
  const tid = tenantId(req);
  if (!tid) {
    res.status(403).json({ error: "Tenant ativo é obrigatório para operar Decisões da Obra." });
    return null;
  }
  return tid;
}

async function ownedObra(tid: string, obraId: string) {
  const result = await pool.query(`SELECT * FROM obras WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [obraId, tid]);
  return result.rows[0] ?? null;
}

async function ownedEtapa(tid: string, obraId: string, etapaId?: string | null) {
  if (!etapaId) return null;
  const result = await pool.query(
    `SELECT e.* FROM obra_etapas e INNER JOIN obras o ON o.id = e.obra_id
      WHERE e.id = $1 AND e.obra_id = $2 AND o.tenant_id = $3 LIMIT 1`,
    [etapaId, obraId, tid],
  );
  return result.rows[0] ?? null;
}

async function ownedDecision(tid: string, obraId: string, id: string) {
  const result = await pool.query(
    `SELECT * FROM arch_project_decisions
      WHERE id = $1::uuid AND tenant_id::text = $2 AND obra_id = $3 LIMIT 1`,
    [id, tid, obraId],
  );
  return result.rows[0] ?? null;
}

router.get("/arch/construction/:obraId/decisions", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    const projectId = String(req.query["projectId"] ?? "").trim();
    if (!await ownedObra(tid, obraId)) { res.status(404).json({ error: "Obra não encontrada" }); return; }
    if (!projectId) { res.status(400).json({ error: "projectId é obrigatório" }); return; }

    const [decisions, stages, budget] = await Promise.all([
      pool.query(
        `SELECT d.*, e.nome AS etapa_nome
           FROM arch_project_decisions d
           LEFT JOIN obra_etapas e ON e.id = d.etapa_id AND e.obra_id = $1
          WHERE d.tenant_id::text = $2 AND d.project_id = $3::uuid AND d.obra_id = $1
          ORDER BY
            CASE d.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 WHEN 'rejected' THEN 2 ELSE 3 END,
            CASE d.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
            d.due_date ASC NULLS LAST,
            d.created_at DESC`,
        [obraId, tid, projectId],
      ),
      pool.query(`SELECT id, nome, ordem FROM obra_etapas WHERE obra_id = $1 ORDER BY ordem ASC, created_at ASC`, [obraId]),
      pool.query(`SELECT id, title, grand_total, status FROM arch_budgets WHERE project_id = $1::uuid AND tenant_id::text = $2 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`, [projectId, tid]),
    ]);

    res.json({ decisions: decisions.rows, stages: stages.rows, budget: budget.rows[0] ?? null });
  } catch (err) {
    logger.error({ err }, "arch construction decisions GET error");
    next(err);
  }
});

router.post("/arch/construction/:obraId/decisions", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    if (!await ownedObra(tid, obraId)) { res.status(404).json({ error: "Obra não encontrada" }); return; }
    const parsed = createSchema.safeParse(req.body ?? {});
    if (!parsed.success) { res.status(422).json({ error: "Dados inválidos", details: parsed.error.flatten() }); return; }
    if (parsed.data.etapaId && !await ownedEtapa(tid, obraId, parsed.data.etapaId)) {
      res.status(404).json({ error: "Etapa não encontrada nesta obra" }); return;
    }

    const revisionStatus = parsed.data.requiresBudgetRevision ? "pending" : "not-required";
    const result = await pool.query(
      `INSERT INTO arch_project_decisions (
        id, tenant_id, project_id, obra_id, etapa_id, budget_id, proposal_id,
        title, description, category, decision_type, status, priority,
        requested_by_name, requested_by_id, responsible, due_date,
        financial_impact, schedule_impact_days, requires_budget_revision, budget_revision_status,
        source, options, attachments, created_at, updated_at
      ) VALUES (
        gen_random_uuid(),$1::uuid,$2::uuid,$3,$4,$5::uuid,$6::uuid,
        $7,$8,$9,$10,'pending',$11,
        $12,$13,$14,$15,
        $16,$17,$18,$19,
        $20,$21::jsonb,'[]'::jsonb,now(),now()
      ) RETURNING *`,
      [
        tid, parsed.data.projectId, obraId, parsed.data.etapaId ?? null,
        parsed.data.budgetId ?? null, parsed.data.proposalId ?? null,
        parsed.data.title.trim(), parsed.data.description ?? null, parsed.data.category ?? null,
        parsed.data.decisionType, parsed.data.priority,
        req.user?.email ?? null, req.user?.sub ?? null, parsed.data.responsible ?? null, parsed.data.dueDate ?? null,
        String(parsed.data.financialImpact), parsed.data.scheduleImpactDays,
        parsed.data.requiresBudgetRevision, revisionStatus,
        parsed.data.source, JSON.stringify(parsed.data.options),
      ],
    );
    res.status(201).json({ decision: result.rows[0] });
  } catch (err) {
    logger.error({ err }, "arch construction decisions POST error");
    next(err);
  }
});

router.patch("/arch/construction/:obraId/decisions/:decisionId", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    const decisionId = String(req.params["decisionId"] ?? "");
    const current = await ownedDecision(tid, obraId, decisionId);
    if (!current) { res.status(404).json({ error: "Decisão não encontrada" }); return; }
    const parsed = updateSchema.safeParse(req.body ?? {});
    if (!parsed.success) { res.status(422).json({ error: "Dados inválidos", details: parsed.error.flatten() }); return; }
    if (parsed.data.etapaId && !await ownedEtapa(tid, obraId, parsed.data.etapaId)) {
      res.status(404).json({ error: "Etapa não encontrada nesta obra" }); return;
    }

    const fields: Record<string, string> = {
      etapaId: "etapa_id", budgetId: "budget_id", proposalId: "proposal_id",
      title: "title", description: "description", category: "category",
      decisionType: "decision_type", status: "status", priority: "priority",
      responsible: "responsible", dueDate: "due_date", decisionComment: "decision_comment",
      financialImpact: "financial_impact", scheduleImpactDays: "schedule_impact_days",
      requiresBudgetRevision: "requires_budget_revision", budgetRevisionStatus: "budget_revision_status",
    };
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, column] of Object.entries(fields)) {
      if ((parsed.data as any)[key] === undefined) continue;
      values.push((parsed.data as any)[key]);
      sets.push(`${column} = $${values.length}`);
    }
    if (parsed.data.selectedOption !== undefined) {
      values.push(parsed.data.selectedOption === null ? null : JSON.stringify(parsed.data.selectedOption));
      sets.push(`selected_option = $${values.length}::jsonb`);
    }
    if (parsed.data.requiresBudgetRevision !== undefined && parsed.data.budgetRevisionStatus === undefined) {
      values.push(parsed.data.requiresBudgetRevision ? "pending" : "not-required");
      sets.push(`budget_revision_status = $${values.length}`);
    }
    if (parsed.data.status) {
      if (["approved", "rejected"].includes(parsed.data.status)) {
        sets.push(`decided_at = now()`);
        values.push(req.user?.email ?? null, req.user?.sub ?? null);
        sets.push(`decided_by_name = $${values.length - 1}`, `decided_by_id = $${values.length}`);
      } else if (parsed.data.status === "pending") {
        sets.push(`decided_at = null`, `decided_by_name = null`, `decided_by_id = null`);
      }
    }
    if (!sets.length) { res.json({ decision: current }); return; }
    values.push(decisionId, obraId, tid);
    const result = await pool.query(
      `UPDATE arch_project_decisions SET ${sets.join(", ")}, updated_at = now()
        WHERE id = $${values.length - 2}::uuid AND obra_id = $${values.length - 1} AND tenant_id::text = $${values.length}
        RETURNING *`,
      values,
    );
    res.json({ decision: result.rows[0] });
  } catch (err) {
    logger.error({ err }, "arch construction decisions PATCH error");
    next(err);
  }
});

router.delete("/arch/construction/:obraId/decisions/:decisionId", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    const decisionId = String(req.params["decisionId"] ?? "");
    const current = await ownedDecision(tid, obraId, decisionId);
    if (!current) { res.status(404).json({ error: "Decisão não encontrada" }); return; }
    await pool.query(`DELETE FROM arch_project_decisions WHERE id = $1::uuid AND obra_id = $2 AND tenant_id::text = $3`, [decisionId, obraId, tid]);
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "arch construction decisions DELETE error");
    next(err);
  }
});

router.post(
  "/arch/construction/:obraId/decisions/:decisionId/attachments",
  upload.array("attachments", 10),
  async (req, res, next) => {
    try {
      const tid = requireTenant(req, res);
      if (!tid) return;
      const obraId = String(req.params["obraId"] ?? "");
      const decisionId = String(req.params["decisionId"] ?? "");
      const current = await ownedDecision(tid, obraId, decisionId);
      if (!current) { res.status(404).json({ error: "Decisão não encontrada" }); return; }
      const files = req.files as Express.Multer.File[] | undefined;
      if (!files?.length) { res.status(422).json({ error: "Nenhum anexo enviado" }); return; }
      const attachments = Array.isArray(current.attachments) ? [...current.attachments] : [];
      const storage = new ObjectStorageService();
      const uploadedAt = new Date().toISOString();
      const added: any[] = [];
      for (const file of files) {
        const url = await storage.savePrivateBuffer(file.buffer, file.mimetype, file.originalname);
        const item = { url, name: file.originalname, mimeType: file.mimetype, uploadedAt };
        attachments.push(item);
        added.push(item);
      }
      const result = await pool.query(
        `UPDATE arch_project_decisions SET attachments = $1::jsonb, updated_at = now()
          WHERE id = $2::uuid AND obra_id = $3 AND tenant_id::text = $4 RETURNING *`,
        [JSON.stringify(attachments), decisionId, obraId, tid],
      );
      res.status(201).json({ attachments: added, decision: result.rows[0] });
    } catch (err) {
      logger.error({ err }, "arch construction decisions attachments error");
      next(err);
    }
  },
);

export default router;
