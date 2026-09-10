import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";

const router: IRouter = Router();

function canAccess(req: Express.Request, tenantId: string) {
  return (req as any).user?.platformRole === "super_admin" || (req as any).user?.tenantId === tenantId;
}

function isAdmin(req: Express.Request) {
  const role = (req as any).user?.platformRole;
  return role === "super_admin" || role === "tenant_admin";
}

const createMatchBody = z.object({
  purchaseOrderId: z.string().min(1),
  receiptId: z.string().min(1).optional().nullable(),
  fiscalDocumentId: z.string().min(1).optional().nullable(),
  payableTitleId: z.string().min(1).optional().nullable(),
});

router.get("/tenants/:tenantId/finance-procurement/matches", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return void res.status(403).json({ error: "Access denied to this tenant" });
  const status = typeof req.query.status === "string" ? req.query.status : null;
  const rows = await db.execute(sql`
    SELECT m.*,
           po.status AS purchase_order_status,
           po.data_emissao AS purchase_order_date,
           f.nome AS supplier_name,
           df.numero AS fiscal_number,
           df.status AS fiscal_status,
           t.status AS payable_status
      FROM finance_purchase_matches m
      JOIN varejo_pedidos_compra po ON po.id=m.purchase_order_id AND po.tenant_id=m.tenant_id
      LEFT JOIN varejo_fornecedores f ON f.id=m.supplier_id
      LEFT JOIN erp_documentos_fiscais df ON df.id=m.fiscal_document_id AND df.tenant_id=m.tenant_id
      LEFT JOIN erp_titulos t ON t.id=m.payable_title_id AND t.tenant_id=m.tenant_id
     WHERE m.tenant_id=${tenantId}
       AND (${status}::text IS NULL OR m.status=${status})
     ORDER BY m.updated_at DESC
     LIMIT 250
  `);
  res.json(rows.rows);
});

router.post("/tenants/:tenantId/finance-procurement/matches", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return void res.status(403).json({ error: "Access denied to this tenant" });
  const parsed = createMatchBody.safeParse(req.body);
  if (!parsed.success) return void res.status(422).json({ error: "Dados de conferência inválidos", issues: parsed.error.issues });
  const { purchaseOrderId, receiptId, fiscalDocumentId, payableTitleId } = parsed.data;

  const order = await db.execute(sql`SELECT id, fornecedor_id FROM varejo_pedidos_compra WHERE id=${purchaseOrderId} AND tenant_id=${tenantId} LIMIT 1`);
  if (!order.rows[0]) return void res.status(404).json({ error: "Pedido de compra não encontrado" });
  if (receiptId) {
    const receipt = await db.execute(sql`SELECT id FROM compra_recebimentos WHERE id=${receiptId} AND pedido_id=${purchaseOrderId} AND tenant_id=${tenantId} LIMIT 1`);
    if (!receipt.rows[0]) return void res.status(422).json({ error: "Recebimento não pertence a este pedido" });
  }
  if (fiscalDocumentId) {
    const fiscal = await db.execute(sql`SELECT id FROM erp_documentos_fiscais WHERE id=${fiscalDocumentId} AND tenant_id=${tenantId} LIMIT 1`);
    if (!fiscal.rows[0]) return void res.status(422).json({ error: "Documento fiscal inválido para este tenant" });
  }
  if (payableTitleId) {
    const payable = await db.execute(sql`SELECT id FROM erp_titulos WHERE id=${payableTitleId} AND tenant_id=${tenantId} AND tipo='pagar' LIMIT 1`);
    if (!payable.rows[0]) return void res.status(422).json({ error: "Conta a pagar inválida para este tenant" });
  }

  const id = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO finance_purchase_matches
      (id, tenant_id, purchase_order_id, receipt_id, fiscal_document_id, payable_title_id, supplier_id)
    VALUES
      (${id}, ${tenantId}, ${purchaseOrderId}, ${receiptId ?? null}, ${fiscalDocumentId ?? null}, ${payableTitleId ?? null}, ${(order.rows[0] as any).fornecedor_id ?? null})
  `);
  await db.execute(sql`SELECT finance_refresh_purchase_match(${id})`);
  const row = await db.execute(sql`SELECT * FROM finance_purchase_matches WHERE id=${id} AND tenant_id=${tenantId}`);
  res.status(201).json(row.rows[0]);
});

router.post("/tenants/:tenantId/finance-procurement/matches/:id/refresh", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return void res.status(403).json({ error: "Access denied to this tenant" });
  const id = String(req.params.id);
  const exists = await db.execute(sql`SELECT id FROM finance_purchase_matches WHERE id=${id} AND tenant_id=${tenantId} LIMIT 1`);
  if (!exists.rows[0]) return void res.status(404).json({ error: "Conferência não encontrada" });
  await db.execute(sql`SELECT finance_refresh_purchase_match(${id})`);
  const row = await db.execute(sql`SELECT * FROM finance_purchase_matches WHERE id=${id} AND tenant_id=${tenantId}`);
  res.json(row.rows[0]);
});

router.post("/tenants/:tenantId/finance-procurement/matches/:id/approve", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId) || !isAdmin(req)) return void res.status(403).json({ error: "Admin required" });
  const id = String(req.params.id);
  const userId = (req as any).user?.id ?? null;
  const result = await db.execute(sql`
    UPDATE finance_purchase_matches
       SET status='approved', reviewed_by=${userId}, reviewed_at=now(), updated_at=now()
     WHERE id=${id} AND tenant_id=${tenantId} AND status IN ('matched','review')
     RETURNING *
  `);
  if (!result.rows[0]) return void res.status(409).json({ error: "Somente conferências compatíveis ou em revisão podem ser aprovadas" });
  res.json(result.rows[0]);
});

router.get("/tenants/:tenantId/finance-procurement/summary", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return void res.status(403).json({ error: "Access denied to this tenant" });
  const result = await db.execute(sql`
    SELECT count(*)::int AS total,
           COALESCE(round(avg(overall_match_percent),1),0) AS average_match_percent,
           COALESCE(round(100.0*count(*) FILTER (WHERE status IN ('matched','approved'))/NULLIF(count(*),0),1),0) AS matched_percent,
           COALESCE(round(100.0*count(*) FILTER (WHERE status='review')/NULLIF(count(*),0),1),0) AS review_percent,
           COALESCE(round(100.0*count(*) FILTER (WHERE status='blocked')/NULLIF(count(*),0),1),0) AS blocked_percent,
           COALESCE(round(100.0*count(*) FILTER (WHERE fiscal_document_id IS NOT NULL)/NULLIF(count(*),0),1),0) AS fiscal_coverage_percent,
           COALESCE(round(100.0*count(*) FILTER (WHERE payable_title_id IS NOT NULL)/NULLIF(count(*),0),1),0) AS payable_coverage_percent
      FROM finance_purchase_matches
     WHERE tenant_id=${tenantId}
  `);
  res.json(result.rows[0] ?? {});
});

router.post("/tenants/:tenantId/finance-procurement/suppliers/refresh-scores", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return void res.status(403).json({ error: "Access denied to this tenant" });
  await db.execute(sql`
    INSERT INTO finance_supplier_scores
      (id, tenant_id, supplier_id, delivery_percent, quality_percent, fiscal_compliance_percent, price_adherence_percent, reconciliation_percent, overall_score_percent, risk_level, incidents, last_assessed_at, updated_at)
    SELECT md5(${tenantId} || ':' || f.id), ${tenantId}, f.id,
           COALESCE(round(100.0*count(m.id) FILTER (WHERE m.receipt_id IS NOT NULL)/NULLIF(count(m.id),0),2),100),
           COALESCE(round(avg(CASE WHEN m.receipt_match_percent>=98 THEN 100 WHEN m.receipt_match_percent>=90 THEN 80 ELSE 50 END),2),100),
           COALESCE(round(100.0*count(m.id) FILTER (WHERE m.fiscal_match_percent>=98)/NULLIF(count(m.id),0),2),100),
           COALESCE(round(avg(NULLIF(m.fiscal_match_percent,0)),2),100),
           COALESCE(round(100.0*count(m.id) FILTER (WHERE m.payable_match_percent>=98)/NULLIF(count(m.id),0),2),100),
           COALESCE(round(avg(m.overall_match_percent),2),100),
           CASE WHEN COALESCE(avg(m.overall_match_percent),100)>=95 THEN 'low'
                WHEN COALESCE(avg(m.overall_match_percent),100)>=85 THEN 'medium'
                WHEN COALESCE(avg(m.overall_match_percent),100)>=70 THEN 'high'
                ELSE 'critical' END,
           count(m.id) FILTER (WHERE m.status='blocked')::int,
           now(), now()
      FROM varejo_fornecedores f
      LEFT JOIN finance_purchase_matches m ON m.supplier_id=f.id AND m.tenant_id=${tenantId}
     WHERE f.tenant_id=${tenantId}
     GROUP BY f.id
    ON CONFLICT (tenant_id, supplier_id) DO UPDATE SET
      delivery_percent=EXCLUDED.delivery_percent,
      quality_percent=EXCLUDED.quality_percent,
      fiscal_compliance_percent=EXCLUDED.fiscal_compliance_percent,
      price_adherence_percent=EXCLUDED.price_adherence_percent,
      reconciliation_percent=EXCLUDED.reconciliation_percent,
      overall_score_percent=EXCLUDED.overall_score_percent,
      risk_level=EXCLUDED.risk_level,
      incidents=EXCLUDED.incidents,
      last_assessed_at=now(),
      updated_at=now()
  `);
  const rows = await db.execute(sql`
    SELECT s.*, f.nome AS supplier_name
      FROM finance_supplier_scores s
      JOIN varejo_fornecedores f ON f.id=s.supplier_id
     WHERE s.tenant_id=${tenantId}
     ORDER BY s.overall_score_percent ASC
  `);
  res.json(rows.rows);
});

router.get("/tenants/:tenantId/finance-procurement/suppliers", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return void res.status(403).json({ error: "Access denied to this tenant" });
  const rows = await db.execute(sql`
    SELECT s.*, f.nome AS supplier_name
      FROM finance_supplier_scores s
      JOIN varejo_fornecedores f ON f.id=s.supplier_id
     WHERE s.tenant_id=${tenantId}
     ORDER BY s.overall_score_percent ASC
  `);
  res.json(rows.rows);
});

export default router;
