import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();
const KINDS = new Set([
  "assunto", "empresa", "marca", "produto", "servico", "obra", "projeto",
  "case", "equipe", "campanha", "conteudo", "ferramenta", "processo",
  "diferencial", "promocao", "prova", "documento", "referencia",
]);
const STATUSES = new Set(["draft", "approved", "archived"]);

function allowed(req: any, tenantId: string): boolean {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}
function text(value: unknown, max = 10000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function list(value: unknown, max = 50): string[] {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => text(item, 300)).filter(Boolean))].slice(0, max)
    : [];
}

router.get("/tenants/:tenantId/context-library", async (req, res) => {
  const tenantId = String(req.params.tenantId); // tenant-audit: reviewed allowed() enforces authenticated tenant ownership
  if (!allowed(req, tenantId)) { res.status(403).json({ error: "Acesso negado" }); return; }
  const status = text(req.query.status, 30);
  const values: unknown[] = [tenantId];
  const statusFilter = STATUSES.has(status) ? `AND status = $${values.push(status)}` : "";
  const result = await pool.query(
    `SELECT id, title, kind, summary, details, tags, source_type AS "sourceType",
            source_id AS "sourceId", asset_ids AS "assetIds", status,
            valid_until AS "validUntil", metadata, created_at AS "createdAt",
            updated_at AS "updatedAt"
       FROM media_context_entries
      WHERE tenant_id = $1 ${statusFilter}
      ORDER BY CASE status WHEN 'approved' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
               updated_at DESC
      LIMIT 500`,
    values,
  );
  res.json({ entries: result.rows });
});

router.post("/tenants/:tenantId/context-library", async (req, res) => {
  const tenantId = String(req.params.tenantId); // tenant-audit: reviewed allowed() enforces authenticated tenant ownership
  if (!allowed(req, tenantId)) { res.status(403).json({ error: "Acesso negado" }); return; }
  const title = text(req.body?.title, 180);
  const summary = text(req.body?.summary, 5000);
  const kind = KINDS.has(req.body?.kind) ? req.body.kind : "assunto";
  const status = STATUSES.has(req.body?.status) ? req.body.status : "approved";
  if (title.length < 2 || summary.length < 5) {
    res.status(422).json({ error: "Informe um título e uma informação completa." }); return;
  }
  const result = await pool.query(
    `INSERT INTO media_context_entries
      (tenant_id, title, kind, summary, details, tags, source_type, source_id,
       asset_ids, status, valid_until, metadata, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id, title, kind, summary, details, tags, source_type AS "sourceType",
               source_id AS "sourceId", asset_ids AS "assetIds", status,
               valid_until AS "validUntil", metadata, created_at AS "createdAt",
               updated_at AS "updatedAt"`,
    [
      tenantId, title, kind, summary, text(req.body?.details, 20000) || null,
      list(req.body?.tags), text(req.body?.sourceType, 40) || "manual",
      text(req.body?.sourceId, 200) || null, list(req.body?.assetIds, 100), status,
      text(req.body?.validUntil, 80) || null,
      req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {},
      req.user?.sub ?? null,
    ],
  );
  res.status(201).json(result.rows[0]);
});

router.patch("/tenants/:tenantId/context-library/:entryId", async (req, res) => {
  const tenantId = String(req.params.tenantId); // tenant-audit: reviewed allowed() enforces authenticated tenant ownership
  if (!allowed(req, tenantId)) { res.status(403).json({ error: "Acesso negado" }); return; }
  const current = await pool.query("SELECT * FROM media_context_entries WHERE tenant_id = $1 AND id = $2 LIMIT 1", [tenantId, String(req.params.entryId)]);
  if (!current.rowCount) { res.status(404).json({ error: "Informação não encontrada" }); return; }
  const row = current.rows[0] as Record<string, any>;
  const title = req.body?.title === undefined ? row.title : text(req.body.title, 180);
  const summary = req.body?.summary === undefined ? row.summary : text(req.body.summary, 5000);
  if (title.length < 2 || summary.length < 5) { res.status(422).json({ error: "Título ou informação inválida." }); return; }
  const kind = KINDS.has(req.body?.kind) ? req.body.kind : row.kind;
  const status = STATUSES.has(req.body?.status) ? req.body.status : row.status;
  const result = await pool.query(
    `UPDATE media_context_entries SET
       title=$3, kind=$4, summary=$5, details=$6, tags=$7, asset_ids=$8,
       status=$9, valid_until=$10, metadata=$11, updated_at=now()
     WHERE tenant_id=$1 AND id=$2
     RETURNING id, title, kind, summary, details, tags, source_type AS "sourceType",
               source_id AS "sourceId", asset_ids AS "assetIds", status,
               valid_until AS "validUntil", metadata, created_at AS "createdAt",
               updated_at AS "updatedAt"`,
    [
      tenantId, String(req.params.entryId), title, kind, summary,
      req.body?.details === undefined ? row.details : text(req.body.details, 20000) || null,
      req.body?.tags === undefined ? row.tags : list(req.body.tags),
      req.body?.assetIds === undefined ? row.asset_ids : list(req.body.assetIds, 100),
      status,
      req.body?.validUntil === undefined ? row.valid_until : text(req.body.validUntil, 80) || null,
      req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : row.metadata,
    ],
  );
  res.json(result.rows[0]);
});

router.delete("/tenants/:tenantId/context-library/:entryId", async (req, res) => {
  const tenantId = String(req.params.tenantId); // tenant-audit: reviewed allowed() enforces authenticated tenant ownership
  if (!allowed(req, tenantId)) { res.status(403).json({ error: "Acesso negado" }); return; }
  const result = await pool.query(
    "DELETE FROM media_context_entries WHERE tenant_id = $1 AND id = $2 RETURNING id",
    [tenantId, String(req.params.entryId)],
  );
  if (!result.rowCount) { res.status(404).json({ error: "Informação não encontrada" }); return; }
  res.status(204).send();
});

export default router;

[executed on device: vmi3624448 (5bc1259f-2bcf-417a-b2e2-7864f48f2673)]
