import { Router, type IRouter } from "express";
import multer from "multer";
import { z } from "zod/v4";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { ObjectStorageService } from "../lib/objectStorage.js";

const router: IRouter = Router();

const uploadEvidence = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    const allowed = file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/") || file.mimetype === "application/pdf";
    if (allowed) return cb(null, true);
    cb(new Error("Formato não permitido. Envie imagem, vídeo ou PDF."));
  },
});

const statusSchema = z.enum(["pending", "in_progress", "passed", "failed", "resolved", "cancelled"]);
const kindSchema = z.enum(["checklist", "inspection", "non_conformity"]);
const severitySchema = z.enum(["baixa", "media", "alta", "critica"]);

const createSchema = z.object({
  projectId: z.string().min(1),
  etapaId: z.string().nullable().optional(),
  workOrderId: z.string().nullable().optional(),
  kind: kindSchema.default("checklist"),
  title: z.string().min(1).max(500),
  category: z.string().max(200).nullable().optional(),
  description: z.string().max(10000).nullable().optional(),
  severity: severitySchema.default("media"),
  responsible: z.string().max(300).nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  correctiveAction: z.string().max(10000).nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
  source: z.string().max(100).default("manual"),
});

const updateSchema = z.object({
  etapaId: z.string().nullable().optional(),
  kind: kindSchema.optional(),
  title: z.string().min(1).max(500).optional(),
  category: z.string().max(200).nullable().optional(),
  description: z.string().max(10000).nullable().optional(),
  severity: severitySchema.optional(),
  responsible: z.string().max(300).nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  correctiveAction: z.string().max(10000).nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
  status: statusSchema.optional(),
});

function tenantId(req: any): string | null {
  return req?.user?.tenantId ?? req?.tenantId ?? null;
}

function requireTenant(req: any, res: any): string | null {
  const tid = tenantId(req);
  if (!tid) {
    res.status(403).json({ error: "Tenant ativo é obrigatório para operar a Qualidade da obra." });
    return null;
  }
  return tid;
}

async function ownedObra(tid: string, obraId: string) {
  const result = await pool.query(`SELECT * FROM obras WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [obraId, tid]);
  return result.rows[0] ?? null;
}

async function ownedEtapa(tid: string, obraId: string, etapaId: string | null | undefined) {
  if (!etapaId) return null;
  const result = await pool.query(
    `SELECT e.* FROM obra_etapas e INNER JOIN obras o ON o.id = e.obra_id
      WHERE e.id = $1 AND e.obra_id = $2 AND o.tenant_id = $3 LIMIT 1`,
    [etapaId, obraId, tid],
  );
  return result.rows[0] ?? null;
}

async function ownedQuality(tid: string, obraId: string, qualityId: string) {
  const result = await pool.query(
    `SELECT * FROM arch_quality_checks
      WHERE id = $1::uuid AND tenant_id::text = $2 AND obra_id = $3
      LIMIT 1`,
    [qualityId, tid, obraId],
  );
  return result.rows[0] ?? null;
}

router.get("/arch/construction/:obraId/quality", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    const projectId = String(req.query["projectId"] ?? "").trim();
    if (!await ownedObra(tid, obraId)) { res.status(404).json({ error: "Obra não encontrada" }); return; }
    if (!projectId) { res.status(400).json({ error: "projectId é obrigatório" }); return; }

    const [quality, stages] = await Promise.all([
      pool.query(
        `SELECT q.*, e.nome AS etapa_nome
           FROM arch_quality_checks q
           LEFT JOIN obra_etapas e ON e.id = q.etapa_id AND e.obra_id = $1
          WHERE q.tenant_id::text = $2
            AND (q.obra_id = $1 OR (q.obra_id IS NULL AND q.project_id = $3::uuid))
          ORDER BY
            CASE q.status WHEN 'failed' THEN 0 WHEN 'pending' THEN 1 WHEN 'in_progress' THEN 2 ELSE 3 END,
            q.due_date ASC NULLS LAST,
            q.created_at DESC`,
        [obraId, tid, projectId],
      ),
      pool.query(`SELECT id, nome, ordem FROM obra_etapas WHERE obra_id = $1 ORDER BY ordem ASC, created_at ASC`, [obraId]),
    ]);
    res.json({ quality: quality.rows, stages: stages.rows });
  } catch (err) {
    logger.error({ err }, "arch construction quality GET error");
    next(err);
  }
});

router.post("/arch/construction/:obraId/quality", async (req, res, next) => {
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

    const result = await pool.query(
      `INSERT INTO arch_quality_checks (
        id, tenant_id, project_id, obra_id, etapa_id, work_order_id,
        kind, title, category, description, severity, status,
        responsible, due_date, corrective_action, notes, evidence, source,
        created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1::uuid, $2::uuid, $3, $4, $5::uuid,
        $6, $7, $8, $9, $10, 'pending',
        $11, $12, $13, $14, '[]'::jsonb, $15,
        now(), now()
      ) RETURNING *`,
      [
        tid, parsed.data.projectId, obraId, parsed.data.etapaId ?? null, parsed.data.workOrderId ?? null,
        parsed.data.kind, parsed.data.title.trim(), parsed.data.category ?? null, parsed.data.description ?? null,
        parsed.data.severity, parsed.data.responsible ?? null, parsed.data.dueDate ?? null,
        parsed.data.correctiveAction ?? null, parsed.data.notes ?? null, parsed.data.source,
      ],
    );
    res.status(201).json({ quality: result.rows[0] });
  } catch (err) {
    logger.error({ err }, "arch construction quality POST error");
    next(err);
  }
});

router.patch("/arch/construction/:obraId/quality/:qualityId", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    const qualityId = String(req.params["qualityId"] ?? "");
    const current = await ownedQuality(tid, obraId, qualityId);
    if (!current) { res.status(404).json({ error: "Registro de qualidade não encontrado" }); return; }
    const parsed = updateSchema.safeParse(req.body ?? {});
    if (!parsed.success) { res.status(422).json({ error: "Dados inválidos", details: parsed.error.flatten() }); return; }
    if (parsed.data.etapaId && !await ownedEtapa(tid, obraId, parsed.data.etapaId)) {
      res.status(404).json({ error: "Etapa não encontrada nesta obra" }); return;
    }

    const fields: Record<string, string> = {
      etapaId: "etapa_id",
      kind: "kind",
      title: "title",
      category: "category",
      description: "description",
      severity: "severity",
      responsible: "responsible",
      dueDate: "due_date",
      correctiveAction: "corrective_action",
      notes: "notes",
      status: "status",
    };
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, column] of Object.entries(fields)) {
      if ((parsed.data as any)[key] === undefined) continue;
      values.push((parsed.data as any)[key]);
      sets.push(`${column} = $${values.length}`);
    }
    if (parsed.data.status) {
      if (["passed", "resolved"].includes(parsed.data.status)) {
        sets.push(`resolved_at = now()`);
        values.push(req.user?.sub ?? null);
        sets.push(`resolved_by_id = $${values.length}`);
      } else if (["pending", "in_progress", "failed"].includes(parsed.data.status)) {
        sets.push(`resolved_at = null`, `resolved_by_id = null`);
      }
    }
    if (!sets.length) { res.json({ quality: current }); return; }
    values.push(qualityId, obraId, tid);
    const result = await pool.query(
      `UPDATE arch_quality_checks SET ${sets.join(", ")}, updated_at = now()
        WHERE id = $${values.length - 2}::uuid AND obra_id = $${values.length - 1} AND tenant_id::text = $${values.length}
        RETURNING *`,
      values,
    );
    res.json({ quality: result.rows[0] });
  } catch (err) {
    logger.error({ err }, "arch construction quality PATCH error");
    next(err);
  }
});

router.delete("/arch/construction/:obraId/quality/:qualityId", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    const qualityId = String(req.params["qualityId"] ?? "");
    const current = await ownedQuality(tid, obraId, qualityId);
    if (!current) { res.status(404).json({ error: "Registro de qualidade não encontrado" }); return; }
    await pool.query(`DELETE FROM arch_quality_checks WHERE id = $1::uuid AND obra_id = $2 AND tenant_id::text = $3`, [qualityId, obraId, tid]);
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "arch construction quality DELETE error");
    next(err);
  }
});

router.post(
  "/arch/construction/:obraId/quality/:qualityId/evidence",
  uploadEvidence.array("evidence", 10),
  async (req, res, next) => {
    try {
      const tid = requireTenant(req, res);
      if (!tid) return;
      const obraId = String(req.params["obraId"] ?? "");
      const qualityId = String(req.params["qualityId"] ?? "");
      const current = await ownedQuality(tid, obraId, qualityId);
      if (!current) { res.status(404).json({ error: "Registro de qualidade não encontrado" }); return; }
      const files = req.files as Express.Multer.File[] | undefined;
      if (!files?.length) { res.status(422).json({ error: "Nenhuma evidência enviada" }); return; }

      const storage = new ObjectStorageService();
      const evidence = Array.isArray(current.evidence) ? [...current.evidence] : [];
      const caption = typeof req.body?.caption === "string" ? req.body.caption.slice(0, 500) : undefined;
      const uploadedAt = new Date().toISOString();
      const added: any[] = [];
      for (const file of files) {
        const url = await storage.savePrivateBuffer(file.buffer, file.mimetype, file.originalname);
        const item = { url, name: file.originalname, mimeType: file.mimetype, uploadedAt, ...(caption ? { caption } : {}) };
        evidence.push(item);
        added.push(item);
      }
      const result = await pool.query(
        `UPDATE arch_quality_checks SET evidence = $1::jsonb, updated_at = now()
          WHERE id = $2::uuid AND obra_id = $3 AND tenant_id::text = $4 RETURNING *`,
        [JSON.stringify(evidence), qualityId, obraId, tid],
      );
      res.status(201).json({ added, quality: result.rows[0] });
    } catch (err) {
      logger.error({ err }, "arch construction quality evidence error");
      next(err);
    }
  },
);

export default router;
