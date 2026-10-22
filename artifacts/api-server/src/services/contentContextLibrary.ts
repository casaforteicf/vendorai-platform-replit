import { pool } from "@workspace/db";

export type ContentContextSource = {
  id: string;
  type: "library" | "catalog";
  kind: string;
  title: string;
  summary: string;
  assetIds: string[];
};

type ContextRow = {
  id: string;
  title: string;
  kind: string;
  summary: string;
  details: string | null;
  tags: string[] | null;
  asset_ids: string[] | null;
  updated_at: Date;
};

type ProductRow = {
  id: string;
  nome: string;
  product_type: string;
  descricao: string | null;
  descricao_longa: string | null;
  marca: string | null;
  tags: string[] | null;
  imagem_url: string | null;
  imagens: string[] | null;
  especificacoes: Array<{ label?: string; value?: string }> | null;
};

function normalized(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function terms(value: string): string[] {
  return [...new Set(normalized(value).split(/[^a-z0-9]+/).filter((term) => term.length >= 3))].slice(0, 30);
}

function score(haystack: string, needles: string[], preferredIds: Set<string>, id: string): number {
  let total = preferredIds.has(id) ? 100 : 0;
  const normalizedHaystack = normalized(haystack);
  for (const needle of needles) {
    if (normalizedHaystack.includes(needle)) total += needle.length >= 7 ? 6 : 3;
  }
  return total;
}

function compact(value: string | null | undefined, max = 900): string {
  const clean = String(value ?? "").replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
}

export async function resolveContentContext(input: {
  tenantId: string;
  query: string;
  productIds?: string[];
  selectedEntryIds?: string[];
  limit?: number;
}): Promise<{ promptBlock: string; sources: ContentContextSource[]; assetIds: string[] }> {
  const [entriesResult, productsResult] = await Promise.all([
    pool.query<ContextRow>(
      `SELECT id, title, kind, summary, details, tags, asset_ids, updated_at
         FROM media_context_entries
        WHERE tenant_id = $1
          AND status = 'approved'
          AND (valid_until IS NULL OR valid_until >= now())
        ORDER BY updated_at DESC
        LIMIT 250`,
      [input.tenantId],
    ).catch(() => ({ rows: [] as ContextRow[] })),
    pool.query<ProductRow>(
      `SELECT id, nome, product_type, descricao, descricao_longa, marca, tags,
              imagem_url, imagens, especificacoes
         FROM produtos_catalogo
        WHERE tenant_id = $1
          AND ativo = true
          AND status_revisao = 'ok'
        ORDER BY destaque DESC, updated_at DESC
        LIMIT 250`,
      [input.tenantId],
    ).catch(() => ({ rows: [] as ProductRow[] })),
  ]);

  const queryTerms = terms(input.query);
  const preferredEntries = new Set(input.selectedEntryIds ?? []);
  const preferredProducts = new Set(input.productIds ?? []);
  const limit = Math.min(Math.max(input.limit ?? 8, 1), 15);

  const entries = entriesResult.rows
    .map((item) => ({
      item,
      score: score([item.title, item.kind, item.summary, item.details, ...(item.tags ?? [])].join(" "), queryTerms, preferredEntries, item.id),
    }))
    .filter(({ score: itemScore }) => itemScore > 0 || queryTerms.length === 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const products = productsResult.rows
    .map((item) => ({
      item,
      score: score([item.nome, item.product_type, item.descricao, item.descricao_longa, item.marca, ...(item.tags ?? [])].join(" "), queryTerms, preferredProducts, item.id),
    }))
    .filter(({ item, score: itemScore }) => itemScore > 0 || preferredProducts.has(item.id))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(5, limit));

  const sources: ContentContextSource[] = [
    ...entries.map(({ item }) => ({
      id: item.id,
      type: "library" as const,
      kind: item.kind,
      title: item.title,
      summary: compact([item.summary, item.details].filter(Boolean).join(" — ")),
      assetIds: item.asset_ids ?? [],
    })),
    ...products.map(({ item }) => ({
      id: item.id,
      type: "catalog" as const,
      kind: item.product_type === "service" ? "servico" : "produto",
      title: item.nome,
      summary: compact([
        item.marca ? `Marca: ${item.marca}` : null,
        item.descricao,
        item.descricao_longa,
        ...(item.especificacoes ?? []).slice(0, 8).map((spec) => spec.label && spec.value ? `${spec.label}: ${spec.value}` : ""),
      ].filter(Boolean).join(" — ")),
      assetIds: [],
    })),
  ];

  const assetIds = [...new Set(sources.flatMap((source) => source.assetIds))];
  const promptBlock = sources.length
    ? [
        "BIBLIOTECA DE INFORMAÇÕES E CATÁLOGO — FONTES APROVADAS:",
        ...sources.map((source, index) => `${index + 1}. [${source.type}/${source.kind}] ${source.title}: ${source.summary}`),
        "",
        "REGRAS DE USO:",
        "- Use estas fontes como verdade principal da empresa.",
        "- Não invente preço, especificação, resultado, garantia, promoção, depoimento ou característica ausente.",
        "- Prefira produto, foto, obra, case e linguagem reais da empresa a exemplos genéricos.",
        "- Se a informação for insuficiente, escreva de forma segura sem completar fatos por suposição.",
      ].join("\n")
    : [
        "BIBLIOTECA DE INFORMAÇÕES E CATÁLOGO:",
        "Nenhuma fonte aprovada relevante foi encontrada para este pedido.",
        "Não invente informações sobre a empresa, produto, serviço, oferta, case ou resultado.",
      ].join("\n");

  return { promptBlock, sources, assetIds };
}
