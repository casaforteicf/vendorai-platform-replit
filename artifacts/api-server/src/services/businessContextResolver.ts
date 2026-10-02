import { pool } from "@workspace/db";

export type BusinessContextSourceType =
  | "business_profile"
  | "catalog_product"
  | "context_library"
  | "knowledge_base";

export type BusinessContextSource = {
  id: string;
  type: BusinessContextSourceType;
  kind: string;
  title: string;
  summary: string;
  score: number;
  approved: boolean;
};

export type ResolvedBusinessContext = {
  promptBlock: string;
  sources: BusinessContextSource[];
  productIds: string[];
  assetIds: string[];
};

type ProfileRow = {
  id: string;
  nome_fantasia: string | null;
  vertical: string | null;
  diferenciais: string | null;
  publico_alvo: string | null;
  metodo_vendas: string | null;
  canais_venda: string[] | null;
  discovery_data: Record<string, unknown> | null;
};

type ProductRow = {
  id: string;
  nome: string;
  product_type: string;
  descricao: string | null;
  descricao_longa: string | null;
  marca: string | null;
  tags: string[] | null;
  comercial: Record<string, unknown> | null;
};

type ContextRow = {
  id: string;
  title: string;
  kind: string;
  summary: string;
  details: string | null;
  tags: string[] | null;
  asset_ids: string[] | null;
};

type KnowledgeRow = {
  id: string;
  titulo: string;
  conteudo: string;
  categoria: string;
  tags: string[] | null;
};

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function tokens(value: string): string[] {
  return [...new Set(normalize(value).split(/[^a-z0-9]+/).filter((item) => item.length >= 3))].slice(0, 45);
}

function compact(value: unknown, max = 1200): string {
  const clean = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.length <= max ? clean : clean.slice(0, max - 1).trimEnd() + "…";
}

function stringList(value: unknown, max = 20): string[] {
  return Array.isArray(value)
    ? value.map((item) => compact(item, 260)).filter(Boolean).slice(0, max)
    : [];
}

function objectList(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object").slice(0, 20)
    : [];
}

function relevance(haystack: string, queryTokens: string[], preferred: boolean): number {
  let value = preferred ? 100 : 0;
  const text = normalize(haystack);
  for (const token of queryTokens) {
    if (text.includes(token)) value += token.length >= 8 ? 8 : token.length >= 5 ? 5 : 3;
  }
  return value;
}

function formatCommercialIntel(product: ProductRow): string {
  const ci = product.comercial ?? {};
  const parts: string[] = [];
  const add = (label: string, value: unknown) => {
    const list = stringList(value);
    if (list.length) parts.push(`${label}: ${list.join("; ")}`);
  };

  add("Características", ci.features);
  add("Diferenciais", ci.differentials);
  add("Benefícios", ci.benefits);
  add("Dores atendidas", ci.painsSolved);
  add("Casos de uso", ci.useCases);
  add("Personas", ci.personas);
  add("Afirmações permitidas", ci.allowedClaims);
  add("NÃO afirmar", ci.prohibitedClaims);
  add("Notas comerciais", ci.salesNotes);

  const objections = objectList(ci.objections)
    .map((item) => {
      const objection = compact(item.objection, 220);
      const response = compact(item.response, 420);
      return objection ? `${objection}${response ? ` → ${response}` : ""}` : "";
    })
    .filter(Boolean);
  if (objections.length) parts.push(`Objeções aprovadas: ${objections.join("; ")}`);

  return parts.join("\n");
}

export async function resolveBusinessContext(input: {
  tenantId: string;
  query: string;
  productIds?: string[];
  limit?: number;
}): Promise<ResolvedBusinessContext> {
  const preferredProductIds = new Set((input.productIds ?? []).filter(Boolean));
  const queryTokens = tokens(input.query);
  const limit = Math.min(Math.max(input.limit ?? 10, 3), 20);

  const [profileResult, productResult, contextResult, knowledgeResult] = await Promise.all([
    pool.query<ProfileRow>(
      `SELECT id, nome_fantasia, vertical, diferenciais, publico_alvo, metodo_vendas,
              canais_venda, discovery_data
         FROM business_profiles
        WHERE tenant_id = $1
        LIMIT 1`,
      [input.tenantId],
    ).catch(() => ({ rows: [] as ProfileRow[] })),
    pool.query<ProductRow>(
      `SELECT id, nome, product_type, descricao, descricao_longa, marca, tags,
              commercial_intelligence AS comercial
         FROM produtos_catalogo
        WHERE tenant_id = $1
          AND ativo = true
          AND status_revisao = 'ok'
        ORDER BY destaque DESC, updated_at DESC
        LIMIT 300`,
      [input.tenantId],
    ).catch(() => ({ rows: [] as ProductRow[] })),
    pool.query<ContextRow>(
      `SELECT id, title, kind, summary, details, tags, asset_ids
         FROM media_context_entries
        WHERE tenant_id = $1
          AND status = 'approved'
          AND (valid_until IS NULL OR valid_until >= now())
        ORDER BY updated_at DESC
        LIMIT 300`,
      [input.tenantId],
    ).catch(() => ({ rows: [] as ContextRow[] })),
    pool.query<KnowledgeRow>(
      `SELECT id, titulo, conteudo, categoria, tags
         FROM knowledge_base
        WHERE tenant_id = $1
          AND ativo = true
        ORDER BY updated_at DESC
        LIMIT 200`,
      [input.tenantId],
    ).catch(() => ({ rows: [] as KnowledgeRow[] })),
  ]);

  const sources: BusinessContextSource[] = [];
  const blocks: string[] = [];
  const assetIds = new Set<string>();
  const selectedProductIds: string[] = [];

  const profile = profileResult.rows[0];
  if (profile) {
    const discovery = profile.discovery_data ?? {};
    const profileText = [
      profile.nome_fantasia ? `Empresa: ${profile.nome_fantasia}` : "",
      profile.vertical ? `Segmento: ${profile.vertical}` : "",
      profile.publico_alvo ? `Público-alvo: ${compact(profile.publico_alvo, 900)}` : "",
      profile.diferenciais ? `Diferenciais institucionais: ${compact(profile.diferenciais, 900)}` : "",
      profile.metodo_vendas ? `Método de vendas: ${compact(profile.metodo_vendas, 700)}` : "",
      profile.canais_venda?.length ? `Canais: ${profile.canais_venda.join(", ")}` : "",
      typeof discovery["missao"] === "string" ? `Missão: ${compact(discovery["missao"], 500)}` : "",
      typeof discovery["historia"] === "string" ? `História/contexto: ${compact(discovery["historia"], 700)}` : "",
    ].filter(Boolean).join("\n");
    if (profileText) {
      blocks.push(`### EMPRESA\n${profileText}`);
      sources.push({
        id: profile.id,
        type: "business_profile",
        kind: "empresa",
        title: profile.nome_fantasia || "Perfil da empresa",
        summary: compact(profileText, 500),
        score: 1000,
        approved: true,
      });
    }
  }

  const rankedProducts = productResult.rows
    .map((item) => {
      const commercialText = formatCommercialIntel(item);
      const haystack = [item.nome, item.product_type, item.descricao, item.descricao_longa, item.marca, ...(item.tags ?? []), commercialText].join(" ");
      return { item, commercialText, score: relevance(haystack, queryTokens, preferredProductIds.has(item.id)) };
    })
    .filter(({ score, item }) => score > 0 || preferredProductIds.has(item.id))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (rankedProducts.length) {
    const productBlocks = rankedProducts.map(({ item, commercialText, score }) => {
      selectedProductIds.push(item.id);
      sources.push({
        id: item.id,
        type: "catalog_product",
        kind: item.product_type,
        title: item.nome,
        summary: compact([item.descricao, commercialText].filter(Boolean).join(" | "), 600),
        score,
        approved: true,
      });
      return [
        `#### ${item.nome}`,
        item.descricao ? `Descrição: ${compact(item.descricao, 500)}` : "",
        item.descricao_longa ? `Contexto: ${compact(item.descricao_longa, 700)}` : "",
        commercialText,
      ].filter(Boolean).join("\n");
    });
    blocks.push(`### PRODUTOS/SERVIÇOS RELEVANTES\n${productBlocks.join("\n\n")}`);
  }

  const rankedContexts = contextResult.rows
    .map((item) => ({
      item,
      score: relevance([item.title, item.kind, item.summary, item.details, ...(item.tags ?? [])].join(" "), queryTokens, false),
    }))
    .filter(({ score }) => score > 0 || queryTokens.length === 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (rankedContexts.length) {
    const lines = rankedContexts.map(({ item, score }) => {
      for (const assetId of item.asset_ids ?? []) assetIds.add(assetId);
      sources.push({
        id: item.id,
        type: "context_library",
        kind: item.kind,
        title: item.title,
        summary: compact(item.summary, 500),
        score,
        approved: true,
      });
      return `- [${item.kind}] ${item.title}: ${compact([item.summary, item.details].filter(Boolean).join(" — "), 850)}`;
    });
    blocks.push(`### CONHECIMENTO COMERCIAL APROVADO\n${lines.join("\n")}`);
  }

  const rankedKnowledge = knowledgeResult.rows
    .map((item) => ({
      item,
      score: relevance([item.titulo, item.categoria, item.conteudo, ...(item.tags ?? [])].join(" "), queryTokens, false),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  if (rankedKnowledge.length) {
    const lines = rankedKnowledge.map(({ item, score }) => {
      sources.push({
        id: item.id,
        type: "knowledge_base",
        kind: item.categoria,
        title: item.titulo,
        summary: compact(item.conteudo, 500),
        score,
        approved: true,
      });
      return `- ${item.titulo} [${item.categoria}]: ${compact(item.conteudo, 1000)}`;
    });
    blocks.push(`### DOCUMENTAÇÃO RELEVANTE\n${lines.join("\n")}`);
  }

  const guardrails =
    "### REGRAS DE USO DA INTELIGÊNCIA DO NEGÓCIO\n" +
    "- Use apenas fatos presentes neste contexto ou dados transacionais reais do sistema.\n" +
    "- Diferenciais, benefícios, garantias, desempenho, preço e comparações não podem ser inventados.\n" +
    "- Se houver uma instrução 'NÃO afirmar', ela prevalece sobre qualquer texto gerado.\n" +
    "- Conhecimento aprovado da Context Library tem prioridade sobre inferências do modelo.\n" +
    "- Personalize a comunicação ao interesse do cliente; não despeje todos os benefícios de uma vez.";

  const promptBlock = blocks.length
    ? `## INTELIGÊNCIA DO NEGÓCIO — CONTEXTO DINÂMICO\n${guardrails}\n\n${blocks.join("\n\n")}`
    : "";

  return {
    promptBlock,
    sources: sources.sort((a, b) => b.score - a.score),
    productIds: selectedProductIds,
    assetIds: [...assetIds],
  };
}
