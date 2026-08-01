import { Router, type IRouter, type Request, type Response } from "express";
import { desc, eq } from "drizzle-orm";
import { db, leadsTable, propostasTable, tenantsTable, type PropostaItem } from "@workspace/db";

const router: IRouter = Router();

router.get("/knowledge-graph/snapshot", async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId ?? req.user?.tenantId;
    if (!tenantId) return res.status(401).json({ error: "Tenant obrigatório" });
    const [[tenant], leads, proposals] = await Promise.all([
      db.select({ id: tenantsTable.id, name: tenantsTable.name, vertical: tenantsTable.vertical })
        .from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1),
      db.select({ id: leadsTable.id, nome: leadsTable.nome, email: leadsTable.email, empresa: leadsTable.empresa, status: leadsTable.status, source: leadsTable.source })
        .from(leadsTable).where(eq(leadsTable.tenantId, tenantId)).orderBy(desc(leadsTable.createdAt)).limit(30),
      db.select({ id: propostasTable.id, leadId: propostasTable.leadId, titulo: propostasTable.titulo, status: propostasTable.status, valorTotal: propostasTable.valorTotal, itens: propostasTable.itens })
        .from(propostasTable).where(eq(propostasTable.tenantId, tenantId)).orderBy(desc(propostasTable.createdAt)).limit(50),
    ]);

    const nodes: Array<Record<string, unknown>> = [];
    const edges: Array<Record<string, unknown>> = [];
    nodes.push({ id:`tenant:${tenantId}`, type:"Tenant", label:tenant?.name ?? "Empresa", domain:"identity", properties:{ vertical:tenant?.vertical ?? "não definida" } });
    for (const lead of leads) {
      nodes.push({ id:`lead:${lead.id}`, type:"Customer", label:lead.nome, domain:"crm", properties:{ email:lead.email, empresa:lead.empresa, status:lead.status, origem:lead.source } });
      edges.push({ id:`tenant-lead:${lead.id}`, source:`tenant:${tenantId}`, target:`lead:${lead.id}`, label:"ATENDE", weight:1, inferred:false });
    }
    const knownLeads = new Set(leads.map(lead => lead.id));
    const products = new Map<string, { label:string; sku?:string }>();
    for (const proposal of proposals) {
      nodes.push({ id:`proposal:${proposal.id}`, type:"Proposal", label:proposal.titulo, domain:"commerce", properties:{ status:proposal.status, valor:proposal.valorTotal ? `R$ ${proposal.valorTotal}` : null } });
      if (knownLeads.has(proposal.leadId)) edges.push({ id:`lead-proposal:${proposal.id}`, source:`lead:${proposal.leadId}`, target:`proposal:${proposal.id}`, label:"RECEBEU_PROPOSTA", weight:1, inferred:false });
      for (const item of (proposal.itens ?? []) as PropostaItem[]) {
        const key = (item.produtoId ?? item.sku ?? item.nome).toLocaleLowerCase("pt-BR");
        products.set(key, { label:item.nome, sku:item.sku });
        edges.push({ id:`proposal-product:${proposal.id}:${key}`, source:`proposal:${proposal.id}`, target:`product:${key}`, label:"CONTÉM", weight:1, inferred:false });
      }
    }
    for (const [key, product] of [...products].slice(0, 40)) nodes.push({ id:`product:${key}`, type:"Product", label:product.label, domain:"commerce", properties:{ sku:product.sku ?? "sem SKU" } });

    const nodeIds = new Set(nodes.map(node => String(node.id)));
    const validEdges = edges.filter(edge => nodeIds.has(String(edge.source)) && nodeIds.has(String(edge.target)));
    return res.json({ nodes, edges:validEdges, generatedAt:new Date().toISOString(), source:"tenant-live-data", vertical:tenant?.vertical });
  } catch (error) {
    req.log?.error(error, "knowledge graph snapshot error");
    return res.status(500).json({ error: "Erro ao montar mapa de conhecimento" });
  }
});

export default router;
