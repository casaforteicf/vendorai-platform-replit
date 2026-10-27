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

/** Business-domain totals are read-only and scoped to the tenant in each source table. */
router.get("/admin/atlas/domain-summary", requireRole("super_admin"), async (_req, res) => {
  const domains = [
    { key:"arqdor", label:"Projetos Arqdor", statement:sql`SELECT tenant_id, count(*)::int AS amount FROM arch_projetos GROUP BY tenant_id` },
    { key:"praca", label:"Pedidos marketplace", statement:sql`SELECT comprador_tenant_id AS tenant_id, count(*)::int AS amount FROM arch_marketplace_pedidos GROUP BY comprador_tenant_id` },
    { key:"vendi", label:"Missões Vendi", statement:sql`SELECT tenant_id, count(*)::int AS amount FROM vendi_missions GROUP BY tenant_id` },
  ];
  const result = await Promise.all(domains.map(async domain => {
    try {
      const rows = await db.execute(domain.statement);
      const byTenant = rows.rows.map(row => ({tenantId:String(row.tenant_id), total:Number(row.amount)}));
      return { key:domain.key, label:domain.label, status:"ok", total:byTenant.reduce((s,r)=>s+r.total,0), byTenant };
    } catch {
      return { key:domain.key, label:domain.label, status:"unavailable", total:null, byTenant:[] };
    }
  }));
  res.setHeader("Cache-Control","no-store");
  res.json({generatedAt:new Date().toISOString(), domains:result});
});


/** Per-tenant operational records. No cross-tenant customer data and no write actions. */
router.get("/admin/atlas/tenant-detail/:tenantId", requireRole("super_admin"), async (req, res) => {
 const tenantId=String(req.params.tenantId||"");
 if (!/^[0-9a-z_-]{1,128}$/i.test(tenantId)) { res.status(422).json({error:"INVALID_TENANT_ID"}); return; }
 const queries=[
  {domain:"crm", query:sql`SELECT id::text AS id, titulo AS label, etapa AS status, lead_id::text AS linked_id FROM deals WHERE tenant_id=${tenantId} ORDER BY id DESC LIMIT 30`},
  {domain:"arqdor", query:sql`SELECT id::text AS id, titulo AS label, status, deal_id::text AS linked_id FROM arch_projetos WHERE tenant_id=${tenantId} ORDER BY created_at DESC LIMIT 30`},
  {domain:"praca", query:sql`SELECT id::text AS id, id::text AS label, status, projeto_id::text AS linked_id FROM arch_marketplace_pedidos WHERE comprador_tenant_id=${tenantId} ORDER BY created_at DESC LIMIT 30`},
  {domain:"vendi", query:sql`SELECT id::text AS id, left(objective,140) AS label, status, source_ref_id::text AS linked_id FROM vendi_missions WHERE tenant_id=${tenantId} ORDER BY created_at DESC LIMIT 30`}
 ];
 const sources=await Promise.all(queries.map(async ({domain,query})=>{
  try { const rows=await db.execute(query);return {domain,status:"ok",items:rows.rows.map(row=>({id:String(row.id),label:String(row.label??""),status:String(row.status??""),linkedId:row.linked_id?String(row.linked_id):null,linkedDomain:domain==="arqdor"?"crm":domain==="praca"?"arqdor":domain==="vendi"?"external":"lead"}))}; }
  catch {return {domain,status:"unavailable",items:[]};}
 }));
 res.setHeader("Cache-Control","no-store");res.json({tenantId,generatedAt:new Date().toISOString(),sources});
});


function isValidPlanDate(value:string):boolean {
 const time=Date.parse(value);
 return value.length===10 && value.charAt(4)==="-" && value.charAt(7)==="-" && Number.isFinite(time) && new Date(time).toISOString().slice(0,10)===value;
}
const STRATEGY_FIELDS=["icp","pain","offer","channels","funnel","kpis","positioning","campaign","budgetNotes","goals","owner","planStatus","dueDate","actions","actualResults"] as const;
router.get("/admin/atlas/marketing-strategies",requireRole("super_admin"),async (_req,res)=>{
 try {
  const result=await db.execute(sql`SELECT content,revision,updated_at FROM vendor_atlas_documents WHERE document_key='marketing-phase1-v1'`);
  const row=result.rows[0] as {content:unknown;revision:number;updated_at:string}|undefined;
  res.setHeader("Cache-Control","no-store");
  res.json(row?{strategies:row.content,revision:row.revision,updatedAt:row.updated_at}:{strategies:{},revision:0,updatedAt:null});
 }catch {res.status(503).json({error:"ATLAS_MARKETING_STORAGE_UNAVAILABLE"});}
});
router.put("/admin/atlas/marketing-strategies",requireRole("super_admin"),async(req,res)=>{
 const {strategies,revision}=req.body??{};
 if(!Number.isInteger(revision)||revision<0||revision>1000000||!strategies||Array.isArray(strategies)||typeof strategies!=="object"){
  res.status(422).json({error:"ATLAS_MARKETING_INVALID_DOCUMENT"});return;
 }
 const entries=Object.entries(strategies as Record<string,unknown>);
 if(entries.length>250||entries.some(([id,value])=>{
  if(!/^niche-[0-9]{2,4}$/.test(id)||!value||Array.isArray(value)||typeof value!=="object")return true;
  const fields=Object.entries(value as Record<string,unknown>);
  return fields.some(([k,v])=>!STRATEGY_FIELDS.includes(k as typeof STRATEGY_FIELDS[number])||typeof v!=="string"||v.length>8000|| (k==="planStatus" && !["","draft","approved","in_progress","paused","completed"].includes(v)) || (k==="dueDate" && v!=="" && !isValidPlanDate(v)));
 })){res.status(422).json({error:"ATLAS_MARKETING_INVALID_DOCUMENT"});return;}
 const author=String(req.user?.email||req.user?.sub||"super_admin");
 try{
  const json=JSON.stringify(strategies);
  const revisionNext=await db.transaction(async tx=>{
   const changed=revision>0?await tx.execute(sql`UPDATE vendor_atlas_documents SET content=${json}::jsonb,revision=revision+1,updated_by=${author},updated_at=now() WHERE document_key='marketing-phase1-v1' AND revision=${revision} RETURNING revision`):await tx.execute(sql`INSERT INTO vendor_atlas_documents(document_key,content,revision,updated_by) VALUES('marketing-phase1-v1',${json}::jsonb,1,${author}) ON CONFLICT DO NOTHING RETURNING revision`);
   const next=Number((changed.rows[0] as {revision?:number}|undefined)?.revision??0);
   if(next)await tx.execute(sql`INSERT INTO vendor_atlas_document_history(document_key,revision,content,updated_by) VALUES('marketing-phase1-v1',${next},${json}::jsonb,${author})`);
   return next;
  });
  if(!revisionNext){res.status(409).json({error:"ATLAS_MARKETING_REVISION_CONFLICT"});return;}
  res.setHeader("Cache-Control","no-store");res.json({ok:true,revision:revisionNext});
 }catch{res.status(503).json({error:"ATLAS_MARKETING_STORAGE_UNAVAILABLE"});}
});

export default router;
