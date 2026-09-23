import { and, desc, eq } from "drizzle-orm";
import { db, knowledgeBaseTable, mediaAssetsTable, tenantsTable } from "@workspace/db";

export type VideoContextPack = {
  brand: {
    name: string;
    website: string | null;
    tagline: string | null;
    logoUrl: string | null;
    primaryColor: string | null;
    segment: string | null;
    description: string | null;
  };
  knowledge: Array<{
    title: string;
    category: string;
    content: string;
    tags: string[];
  }>;
  references: Array<{
    assetId: string;
    type: string;
    role: string;
    storageUrl: string;
    filename: string | null;
    source: string;
    metadata: Record<string, unknown>;
  }>;
  promptContext: string;
};

const KNOWLEDGE_LIMIT = 12;
const REFERENCE_LIMIT = 10;
const KNOWLEDGE_CHARS = 1200;

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function tags(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").slice(0, 12)
    : [];
}

function referenceScore(input: { type: string; role: string; source: string; filename: string | null; metadata: Record<string, unknown> }): number {
  const haystack = [
    input.role,
    input.source,
    input.filename ?? "",
    String(input.metadata["category"] ?? ""),
    String(input.metadata["purpose"] ?? ""),
    String(input.metadata["label"] ?? ""),
  ].join(" ").toLowerCase();

  let score = 0;
  if (input.type === "image") score += 40;
  if (input.type === "video") score += 25;
  if (/logo|brand|marca|identity|identidade/.test(haystack)) score += 100;
  if (/screen|screenshot|tela|ui|interface|produto|product/.test(haystack)) score += 80;
  if (/approved|aprovad|official|oficial/.test(haystack)) score += 60;
  if (/generated|video-generate-scene/.test(haystack)) score -= 35;
  return score;
}

export async function resolveVideoContextPack(tenantId: string): Promise<VideoContextPack> {
  const [tenant] = await db.select({
    id: tenantsTable.id,
    name: tenantsTable.name,
    nomeEmpresa: tenantsTable.nomeEmpresa,
    site: tenantsTable.site,
    logoUrl: tenantsTable.logoUrl,
    corPrimaria: tenantsTable.corPrimaria,
    segmento: tenantsTable.segmento,
    vertical: tenantsTable.vertical,
    descricao: tenantsTable.descricao,
  }).from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1);

  if (!tenant) throw new Error("Tenant não encontrado ao montar contexto de vídeo");

  const knowledgeRows = await db.select({
    titulo: knowledgeBaseTable.titulo,
    conteudo: knowledgeBaseTable.conteudo,
    categoria: knowledgeBaseTable.categoria,
    tags: knowledgeBaseTable.tags,
    updatedAt: knowledgeBaseTable.updatedAt,
  }).from(knowledgeBaseTable).where(and(
    eq(knowledgeBaseTable.tenantId, tenantId),
    eq(knowledgeBaseTable.ativo, true),
  )).orderBy(desc(knowledgeBaseTable.updatedAt)).limit(KNOWLEDGE_LIMIT);

  const mediaRows = await db.select({
    id: mediaAssetsTable.id,
    type: mediaAssetsTable.type,
    role: mediaAssetsTable.role,
    storageUrl: mediaAssetsTable.storageUrl,
    originalFilename: mediaAssetsTable.originalFilename,
    source: mediaAssetsTable.source,
    metadata: mediaAssetsTable.metadata,
    createdAt: mediaAssetsTable.createdAt,
  }).from(mediaAssetsTable).where(eq(mediaAssetsTable.tenantId, tenantId))
    .orderBy(desc(mediaAssetsTable.createdAt))
    .limit(80);

  const references = mediaRows
    .map((row) => ({
      assetId: row.id,
      type: row.type,
      role: row.role,
      storageUrl: row.storageUrl,
      filename: row.originalFilename,
      source: row.source,
      metadata: record(row.metadata),
    }))
    .filter((row) => row.type === "image" || row.type === "video")
    .sort((a, b) => referenceScore(b) - referenceScore(a))
    .slice(0, REFERENCE_LIMIT);

  const brandName = text(tenant.nomeEmpresa) ?? text(tenant.name) ?? "Empresa";
  const website = text(tenant.site);
  const segment = text(tenant.segmento) ?? text(tenant.vertical);
  const description = text(tenant.descricao);

  const knowledge = knowledgeRows.map((row) => ({
    title: row.titulo,
    category: row.categoria,
    content: row.conteudo.slice(0, KNOWLEDGE_CHARS),
    tags: tags(row.tags),
  }));

  const promptContext = [
    "CONTEXTO OFICIAL DO TENANT — use como fonte de verdade.",
    `Marca oficial: ${brandName}.`,
    website ? `Site oficial: ${website}.` : "",
    segment ? `Segmento: ${segment}.` : "",
    description ? `Descrição oficial: ${description}.` : "",
    text(tenant.corPrimaria) ? `Cor primária oficial: ${tenant.corPrimaria}.` : "",
    "Não invente nome, logo, domínio, produto, benefício ou texto de interface que não esteja neste contexto.",
    "A marca e textos finais serão aplicados pelo compositor; não desenhe logotipo ou tipografia dentro das cenas geradas.",
    knowledge.length
      ? "Conhecimento da empresa:\n" + knowledge.map((item) =>
          `- [${item.category}] ${item.title}: ${item.content}`
        ).join("\n")
      : "Conhecimento da empresa: nenhum registro ativo encontrado.",
    references.length
      ? "Referências visuais disponíveis no tenant: " + references.map((item) =>
          item.filename ?? item.assetId
        ).join(", ")
      : "Referências visuais: nenhuma mídia adequada encontrada.",
  ].filter(Boolean).join("\n");

  return {
    brand: {
      name: brandName,
      website,
      tagline: null,
      logoUrl: text(tenant.logoUrl),
      primaryColor: text(tenant.corPrimaria),
      segment,
      description,
    },
    knowledge,
    references,
    promptContext,
  };
}
