import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requireRole } from "../middlewares/auth.js";

const router: IRouter = Router();
const key = "institutional-v1";
type AtlasNode = { id: string; name: string; summary?: string; detail?: string; rules?: string; integrations?: string; children: AtlasNode[] };
function validNodes(payload: unknown): payload is AtlasNode[] {
  if (!Array.isArray(payload) || payload.length > 30) return false;
  let total = 0;
  const ids = new Set<string>();
  const visit = (node: unknown, depth: number): boolean => {
    if (depth > 5 || !node || typeof node !== "object" || Array.isArray(node) || ++total > 1200) return false;
    const n = node as Record<string, unknown>;
    if (typeof n.id !== "string" || n.id.length > 120 || ids.has(n.id) ||
      typeof n.name !== "string" || !n.name.trim() || n.name.length > 240 ||
      !Array.isArray(n.children) || n.children.length > 200) return false;
    ids.add(n.id);
    for (const field of ["summary", "detail", "rules", "integrations"]) {
      if (n[field] !== undefined && (typeof n[field] !== "string" || (n[field] as string).length > 12000)) return false;
    }
    return n.children.every(child => visit(child, depth + 1));
  };
  return payload.every(node => visit(node, 0));
}
router.get("/admin/atlas", requireRole("super_admin"), async (_req, res) => {
  try {
    const result = await db.execute(sql`SELECT content, revision, updated_at FROM vendor_atlas_documents WHERE document_key = ${key}`);
    const row = (result.rows as Array<{content:unknown;revision:number;updated_at:string}>)[0];
    res.json(row ? { nodes:row.content, revision:row.revision, updatedAt:row.updated_at } : { nodes:null, revision:0, updatedAt:null });
  } catch (error) {
    res.status(503).json({ error:"ATLAS_STORAGE_UNAVAILABLE" });
  }
});
router.put("/admin/atlas", requireRole("super_admin"), async (req, res) => {
  const { nodes, revision } = req.body ?? {};
  if (!validNodes(nodes) || !Number.isInteger(revision) || revision < 0 || revision > 1000000) {
    res.status(422).json({ error:"ATLAS_INVALID_DOCUMENT" }); return;
  }
  const author = String(req.user?.email || req.user?.sub || "super_admin");
  try {
    const json = JSON.stringify(nodes);
    const changed = await db.transaction(async tx => {
      // Atomic compare-and-swap avoids silent overwrite by another admin.
      const updated = revision > 0 ? await tx.execute(sql`
        UPDATE vendor_atlas_documents SET content=${json}::jsonb, revision=revision+1,
        updated_by=${author},updated_at=now()
        WHERE document_key=${key} AND revision=${revision}
        RETURNING revision`) : await tx.execute(sql`
        INSERT INTO vendor_atlas_documents (document_key,content,revision,updated_by)
        VALUES (${key},${json}::jsonb,1,${author})
        ON CONFLICT DO NOTHING RETURNING revision`);
      const newRevision = Number((updated.rows as Array<{revision:number}>)[0]?.revision || 0);
      if (!newRevision) return 0;
      await tx.execute(sql`
        INSERT INTO vendor_atlas_document_history(document_key,revision,content,updated_by)
        VALUES (${key},${newRevision},${json}::jsonb,${author})`);
      return newRevision;
    });
    if (!changed) { res.status(409).json({error:"ATLAS_REVISION_CONFLICT"});return; }
    res.json({ok:true,revision:changed});
  } catch {
    res.status(503).json({error:"ATLAS_STORAGE_UNAVAILABLE"});
  }
});

/** Superadmin-only cross-tenant aggregate. Returns counts, never lead/deal PII. */
router.get("/admin/atlas/operations-summary", requireRole("super_admin"), async (_req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT t.id AS tenant_id, t.name AS tenant_name,
        (SELECT count(*)::int FROM leads l WHERE l.tenant_id = t.id
          AND l.excluido_em IS NULL AND l.nao_lead_tipo IS NULL) AS leads,
        (SELECT count(*)::int FROM deals d WHERE d.tenant_id = t.id) AS deals,
        (SELECT count(*)::int FROM produtos_catalogo p WHERE p.tenant_id = t.id) AS catalog_items
      FROM tenants t ORDER BY t.name ASC LIMIT 500
    `);
    res.setHeader("Cache-Control", "no-store");
    res.json({ source:"postgresql", generatedAt:new Date().toISOString(),
      tenantLimit:500, tenants: result.rows.map(row => ({
        tenantId:String(row.tenant_id), tenantName:String(row.tenant_name),
        leads:Number(row.leads), deals:Number(row.deals), catalogItems:Number(row.catalog_items)
      })) });
  } catch {
    res.status(503).json({error:"ATLAS_OPERATIONS_UNAVAILABLE"});
  }
});
\nexport default router;
