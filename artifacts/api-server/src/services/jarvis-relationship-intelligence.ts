import { and, desc, eq, isNull } from "drizzle-orm";
import {
  db,
  dealsTable,
  fornecedoresTable,
  jarvisCasesTable,
  leadsTable,
} from "@workspace/db";
import { canonicalDealValueSql } from "../lib/deal-value.js";

export type JarvisRelationNodeKind =
  | "person"
  | "company"
  | "deal"
  | "supplier"
  | "case";

export type JarvisRelationNode = {
  id: string;
  kind: JarvisRelationNodeKind;
  label: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type JarvisRelationEdge = {
  from: string;
  to: string;
  relation:
    | "works_at"
    | "linked_to_deal"
    | "assigned_to"
    | "supplier_of_tenant"
    | "case_mentions"
    | "referred_by";
  evidence: "persisted_fk" | "persisted_field" | "text_match";
};

function compact(value: string | null | undefined, max = 140) {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nodeKey(kind: JarvisRelationNodeKind, idOrLabel: string) {
  return `${kind}:${normalize(idOrLabel).replaceAll(" ", "-")}`;
}

export async function loadJarvisRelationshipIntelligence(tenantId: string) {
  const [leads, deals, suppliers, cases] = await Promise.all([
    db
      .select({
        id: leadsTable.id,
        nome: leadsTable.nome,
        empresa: leadsTable.empresa,
        tipoPessoa: leadsTable.tipoPessoa,
        dadosPj: leadsTable.dadosPj,
        assignedTo: leadsTable.assignedTo,
        indicadoPor: leadsTable.indicadoPor,
        status: leadsTable.status,
        updatedAt: leadsTable.updatedAt,
      })
      .from(leadsTable)
      .where(and(eq(leadsTable.tenantId, tenantId), isNull(leadsTable.excluidoEm)))
      .orderBy(desc(leadsTable.updatedAt))
      .limit(80),
    db
      .select({
        id: dealsTable.id,
        leadId: dealsTable.leadId,
        titulo: dealsTable.titulo,
        etapa: dealsTable.etapa,
        valor: canonicalDealValueSql,
        assignedTo: dealsTable.assignedTo,
        updatedAt: dealsTable.updatedAt,
      })
      .from(dealsTable)
      .where(eq(dealsTable.tenantId, tenantId))
      .orderBy(desc(dealsTable.updatedAt))
      .limit(80),
    db
      .select({ id: fornecedoresTable.id, nome: fornecedoresTable.nome })
      .from(fornecedoresTable)
      .where(eq(fornecedoresTable.tenantId, tenantId))
      .limit(50),
    db
      .select({
        id: jarvisCasesTable.id,
        title: jarvisCasesTable.title,
        detail: jarvisCasesTable.detail,
        category: jarvisCasesTable.category,
        severity: jarvisCasesTable.severity,
        source: jarvisCasesTable.source,
        evidence: jarvisCasesTable.evidence,
        updatedAt: jarvisCasesTable.updatedAt,
      })
      .from(jarvisCasesTable)
      .where(eq(jarvisCasesTable.tenantId, tenantId))
      .orderBy(desc(jarvisCasesTable.updatedAt))
      .limit(80),
  ]);

  const nodes = new Map<string, JarvisRelationNode>();
  const edges: JarvisRelationEdge[] = [];
  const seenEdges = new Set<string>();

  const addNode = (node: JarvisRelationNode) => {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  };
  const addEdge = (edge: JarvisRelationEdge) => {
    const key = `${edge.from}|${edge.relation}|${edge.to}`;
    if (seenEdges.has(key)) return;
    seenEdges.add(key);
    edges.push(edge);
  };

  const searchableEntities: Array<{ id: string; label: string }> = [];

  for (const lead of leads) {
    const personId = `person:${lead.id}`;
    addNode({
      id: personId,
      kind: "person",
      label: compact(lead.nome),
      metadata: { status: lead.status, tipoPessoa: lead.tipoPessoa },
    });
    searchableEntities.push({ id: personId, label: lead.nome });

    const pjName = lead.dadosPj?.razaoSocial?.trim();
    const companyName = compact(lead.empresa || pjName || "");
    if (companyName) {
      const companyId = nodeKey("company", companyName);
      addNode({ id: companyId, kind: "company", label: companyName });
      addEdge({ from: personId, to: companyId, relation: "works_at", evidence: "persisted_field" });
      searchableEntities.push({ id: companyId, label: companyName });
    }

    if (lead.assignedTo) {
      const ownerId = `person:user:${lead.assignedTo}`;
      addNode({ id: ownerId, kind: "person", label: `Usuário ${lead.assignedTo}` });
      addEdge({ from: personId, to: ownerId, relation: "assigned_to", evidence: "persisted_fk" });
    }

    if (lead.indicadoPor?.trim()) {
      const referrerLabel = compact(lead.indicadoPor);
      const referrerId = nodeKey("person", `referrer-${referrerLabel}`);
      addNode({ id: referrerId, kind: "person", label: referrerLabel });
      addEdge({ from: personId, to: referrerId, relation: "referred_by", evidence: "persisted_field" });
      searchableEntities.push({ id: referrerId, label: referrerLabel });
    }
  }

  for (const deal of deals) {
    const dealId = `deal:${deal.id}`;
    addNode({
      id: dealId,
      kind: "deal",
      label: compact(deal.titulo),
      metadata: {
        etapa: deal.etapa,
        valor: deal.valor ? Number(deal.valor) : null,
      },
    });
    searchableEntities.push({ id: dealId, label: deal.titulo });

    if (deal.leadId) {
      const personId = `person:${deal.leadId}`;
      if (nodes.has(personId)) {
        addEdge({ from: personId, to: dealId, relation: "linked_to_deal", evidence: "persisted_fk" });
      }
    }

    if (deal.assignedTo) {
      const ownerId = `person:user:${deal.assignedTo}`;
      addNode({ id: ownerId, kind: "person", label: `Usuário ${deal.assignedTo}` });
      addEdge({ from: dealId, to: ownerId, relation: "assigned_to", evidence: "persisted_fk" });
    }
  }

  for (const supplier of suppliers) {
    const supplierId = `supplier:${supplier.id}`;
    addNode({ id: supplierId, kind: "supplier", label: compact(supplier.nome) });
    addEdge({ from: supplierId, to: "tenant:self", relation: "supplier_of_tenant", evidence: "persisted_fk" });
    searchableEntities.push({ id: supplierId, label: supplier.nome });
  }

  addNode({ id: "tenant:self", kind: "company", label: "Empresa do tenant" });

  for (const item of cases) {
    const caseId = `case:${item.id}`;
    addNode({
      id: caseId,
      kind: "case",
      label: compact(item.title),
      metadata: { category: item.category, severity: item.severity, source: item.source },
    });

    const searchable = normalize([
      item.title,
      item.detail,
      item.evidence ? JSON.stringify(item.evidence) : "",
    ].join(" "));

    for (const entity of searchableEntities) {
      const needle = normalize(entity.label);
      if (needle.length < 4 || !searchable.includes(needle)) continue;
      addEdge({ from: caseId, to: entity.id, relation: "case_mentions", evidence: "text_match" });
    }
  }

  const nodeList = [...nodes.values()];
  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  }

  const hubs = nodeList
    .map((node) => ({ id: node.id, kind: node.kind, label: node.label, connections: degree.get(node.id) ?? 0 }))
    .filter((item) => item.connections > 0)
    .sort((a, b) => b.connections - a.connections)
    .slice(0, 12);

  return {
    generatedAt: new Date(),
    nodes: nodeList,
    edges,
    hubs,
    summary: {
      nodes: nodeList.length,
      edges: edges.length,
      people: nodeList.filter((node) => node.kind === "person").length,
      companies: nodeList.filter((node) => node.kind === "company").length,
      deals: nodeList.filter((node) => node.kind === "deal").length,
      suppliers: nodeList.filter((node) => node.kind === "supplier").length,
      cases: nodeList.filter((node) => node.kind === "case").length,
    },
  };
}
