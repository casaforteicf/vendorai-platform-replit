/**
 * Plano de mídia automático -- pedido real: "colocar as informações do @,
 * o site, segmento, região, concorrentes (as informações do cadastro
 * inicial) e gerar um planejamento pra mídias, buscando maneiras de
 * vitalizar o negócio pela internet".
 *
 * Junta o perfil do negócio já cadastrado com dados REAIS de busca
 * (DataForSEO, já configurado e usado pelo Content Autopilot) e pede pra IA
 * montar um plano estratégico. Tenants antigos que ainda não possuem linha em
 * business_profiles usam os dados reais já existentes em tenants como
 * fallback, sem bloquear a geração.
 */
import {
  db,
  businessProfilesTable,
  mediaPlansTable,
  tenantsTable,
  type MediaPlanConteudo,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import {
  isDataForSeoConfigured,
  keywordsForKeywords,
  serpOrganicTop,
  logDataForSeoCost,
} from "../lib/dataforseoClient.js";
import { logger } from "../lib/logger.js";

const SYSTEM_PROMPT = `Você é um estrategista de marketing digital especializado em pequenas e médias empresas brasileiras.
Recebe o perfil de um negócio (segmento, público-alvo, diferenciais, concorrentes, canais já usados) e, quando disponíveis,
dados reais de busca (volume de pesquisa de termos do negócio e quem aparece no Google pra esses termos).

Monte um plano de mídia realista e acionável -- nada de "publique todo dia em todas as redes", seja específico ao segmento
e ao tamanho real do negócio (não assuma orçamento de grande empresa). Priorize 2-4 canais no máximo, com motivo claro
pra cada um baseado no perfil recebido.

Use obrigatoriamente a ferramenta submit_media_plan para entregar o plano final. Preencha todas as propriedades da ferramenta.
Em prioridade, use somente alta, media ou baixa. Em percentualOrcamento, use um número de 0 a 100 e distribua os canais para
somarem aproximadamente 100.`;

type JsonRecord = Record<string, unknown>;

type MediaPlanProfile = {
  razaoSocial: string;
  nomeFantasia: string | null;
  vertical: string | null;
  endereco: string | null;
  publicoAlvo: string | null;
  diferenciais: string | null;
  concorrentes: string[] | null;
  canaisVenda: string[] | null;
  instagramUrl: string | null;
  produtos: { nome: string; descricao?: string }[] | null;
  site: string | null;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Campo inválido: ${field}`);
  }
  return value.trim();
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Campo inválido: ${field}`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function requirePriority(value: unknown): "alta" | "media" | "baixa" {
  if (typeof value === "string") {
    const normalized = value
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (normalized === "alta" || normalized === "media" || normalized === "baixa") {
      return normalized;
    }
  }
  throw new Error("Prioridade inválida");
}

function requireBudget(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error("Percentual de orçamento inválido");
  }
  return parsed;
}

function parseMediaPlanPayload(parsed: unknown): MediaPlanConteudo {
  if (!isRecord(parsed)) {
    throw new Error("Plano não é um objeto");
  }

  if (!Array.isArray(parsed.canais) || parsed.canais.length === 0) {
    throw new Error("Campo inválido: canais");
  }

  const canais = parsed.canais.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`Canal inválido: ${index}`);
    }
    return {
      canal: requireString(item.canal, `canais[${index}].canal`),
      prioridade: requirePriority(item.prioridade),
      motivo: requireString(item.motivo, `canais[${index}].motivo`),
      tiposCampanhaSugeridos: requireStringArray(
        item.tiposCampanhaSugeridos,
        `canais[${index}].tiposCampanhaSugeridos`,
      ),
      percentualOrcamento: requireBudget(item.percentualOrcamento),
    };
  });

  return {
    diagnostico: requireString(parsed.diagnostico, "diagnostico"),
    pontosFortesAtuais: requireStringArray(parsed.pontosFortesAtuais, "pontosFortesAtuais"),
    oportunidades: requireStringArray(parsed.oportunidades, "oportunidades"),
    canais,
    pilaresConteudo: requireStringArray(parsed.pilaresConteudo, "pilaresConteudo"),
    acoesImediatas: requireStringArray(parsed.acoesImediatas, "acoesImediatas"),
    keywordsRelevantes: [],
    concorrentesEncontrados: [],
  } as MediaPlanConteudo;
}

function buildProfileContext(profile: MediaPlanProfile): string {
  const lines: string[] = [`Negócio: ${profile.nomeFantasia ?? profile.razaoSocial}`];
  if (profile.vertical) lines.push(`Segmento: ${profile.vertical}`);
  if (profile.endereco) lines.push(`Localização: ${profile.endereco}`);
  if (profile.publicoAlvo) lines.push(`Público-alvo: ${profile.publicoAlvo}`);
  if (profile.diferenciais) lines.push(`Diferenciais: ${profile.diferenciais}`);
  if (profile.concorrentes?.length) {
    lines.push(`Concorrentes informados pelo negócio: ${profile.concorrentes.join(", ")}`);
  }
  if (profile.canaisVenda?.length) {
    lines.push(`Canais de venda já usados: ${profile.canaisVenda.join(", ")}`);
  }
  if (profile.instagramUrl) lines.push(`Instagram: ${profile.instagramUrl}`);
  if (profile.site) lines.push(`Site: ${profile.site}`);
  if (profile.produtos?.length) {
    lines.push(
      `Produtos/serviços: ${profile.produtos
        .map((p) => p.nome)
        .slice(0, 10)
        .join(", ")}`,
    );
  }
  return lines.join("\n");
}

async function resolveMediaPlanProfile(tenantId: string): Promise<MediaPlanProfile | null> {
  const [[profile], [tenant]] = await Promise.all([
    db.select().from(businessProfilesTable).where(eq(businessProfilesTable.tenantId, tenantId)).limit(1),
    db
      .select({
        id: tenantsTable.id,
        name: tenantsTable.name,
        nomeEmpresa: tenantsTable.nomeEmpresa,
        vertical: tenantsTable.vertical,
        segmento: tenantsTable.segmento,
        site: tenantsTable.site,
        descricao: tenantsTable.descricao,
      })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId))
      .limit(1),
  ]);

  if (!profile && !tenant) return null;

  const razaoSocial = profile?.razaoSocial || tenant?.nomeEmpresa || tenant?.name || "";
  if (!razaoSocial.trim()) return null;

  return {
    razaoSocial,
    nomeFantasia: profile?.nomeFantasia || tenant?.nomeEmpresa || tenant?.name || null,
    vertical: profile?.vertical || tenant?.segmento || tenant?.vertical || null,
    endereco: profile?.endereco || null,
    publicoAlvo: profile?.publicoAlvo || null,
    diferenciais: profile?.diferenciais || tenant?.descricao || null,
    concorrentes: (profile?.concorrentes as string[] | null) || null,
    canaisVenda: (profile?.canaisVenda as string[] | null) || null,
    instagramUrl: profile?.instagramUrl || null,
    produtos: (profile?.produtos as { nome: string; descricao?: string }[] | null) || null,
    site: tenant?.site || null,
  };
}

export class MediaPlanError extends Error {}

export async function generateMediaPlan(
  tenantId: string,
  geradoPor: string | null,
): Promise<{ plan: typeof mediaPlansTable.$inferSelect }> {
  const profile = await resolveMediaPlanProfile(tenantId);
  if (!profile) {
    throw new MediaPlanError(
      "Complete o perfil do negócio (Configurações → Perfil do Negócio) antes de gerar o plano de mídia.",
    );
  }

  let custoTotal = 0;
  let keywordsRelevantes: MediaPlanConteudo["keywordsRelevantes"] = [];
  let concorrentesEncontrados: MediaPlanConteudo["concorrentesEncontrados"] = [];

  // Dados reais de busca -- best-effort: se não estiver configurado ou
  // falhar, segue só com o perfil (não bloqueia a geração do plano).
  if (isDataForSeoConfigured()) {
    try {
      const produtosNomes = profile.produtos?.map((p) => p.nome) ?? [];
      const seeds = [profile.vertical, ...produtosNomes]
        .filter((s): s is string => Boolean(s))
        .slice(0, 3);
      if (seeds.length > 0) {
        const { keywords, cost } = await keywordsForKeywords(seeds, { limit: 10 });
        custoTotal += cost;
        keywordsRelevantes = keywords
          .slice(0, 8)
          .map((k) => ({ termo: k.keyword, volumeBusca: k.searchVolume }));

        const termoPrincipal = seeds[0];
        if (termoPrincipal) {
          const { results, cost: serpCost } = await serpOrganicTop(termoPrincipal, {
            maxResults: 5,
          });
          custoTotal += serpCost;
          concorrentesEncontrados = results.map((r) => ({
            dominio: r.domain,
            titulo: r.title,
            url: r.url,
          }));
        }
      }
    } catch (err) {
      logger.warn(
        { err, tenantId },
        "media-plan: falha ao buscar dados reais (DataForSEO) — seguindo só com o perfil",
      );
    }
  }

  const contextoTexto = [
    buildProfileContext(profile),
    keywordsRelevantes.length > 0
      ? `\nVolume de busca real (Google, últimos dados disponíveis) pros termos do negócio:\n${keywordsRelevantes
          .map((k) => `- "${k.termo}": ${k.volumeBusca ?? "?"} buscas/mês`)
          .join("\n")}`
      : "",
    concorrentesEncontrados.length > 0
      ? `\nQuem aparece hoje no Google pro termo principal do negócio (concorrência real de visibilidade):\n${concorrentesEncontrados
          .map((c) => `- ${c.dominio} — "${c.titulo}"`)
          .join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3500,
    system: SYSTEM_PROMPT,
    tools: [
      {
        name: "submit_media_plan",
        description: "Entrega o plano de mídia final estruturado para o negócio analisado.",
        input_schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            diagnostico: { type: "string" },
            pontosFortesAtuais: { type: "array", items: { type: "string" } },
            oportunidades: { type: "array", items: { type: "string" } },
            canais: {
              type: "array",
              minItems: 1,
              maxItems: 4,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  canal: { type: "string" },
                  prioridade: { type: "string", enum: ["alta", "media", "baixa"] },
                  motivo: { type: "string" },
                  tiposCampanhaSugeridos: {
                    type: "array",
                    items: { type: "string" },
                  },
                  percentualOrcamento: { type: "number", minimum: 0, maximum: 100 },
                },
                required: [
                  "canal",
                  "prioridade",
                  "motivo",
                  "tiposCampanhaSugeridos",
                  "percentualOrcamento",
                ],
              },
            },
            pilaresConteudo: { type: "array", items: { type: "string" } },
            acoesImediatas: { type: "array", items: { type: "string" } },
          },
          required: [
            "diagnostico",
            "pontosFortesAtuais",
            "oportunidades",
            "canais",
            "pilaresConteudo",
            "acoesImediatas",
          ],
        },
      },
    ],
    tool_choice: { type: "tool", name: "submit_media_plan" },
    messages: [{ role: "user", content: contextoTexto }],
  });

  const toolBlock = response.content.find(
    (block) => block.type === "tool_use" && block.name === "submit_media_plan",
  );
  if (!toolBlock || toolBlock.type !== "tool_use") {
    logger.warn(
      { tenantId, stopReason: response.stop_reason },
      "media-plan: IA não retornou a ferramenta estruturada",
    );
    throw new MediaPlanError("IA não retornou o plano — tente novamente.");
  }

  let conteudo: MediaPlanConteudo;
  try {
    conteudo = parseMediaPlanPayload(toolBlock.input);
  } catch (err) {
    logger.warn({ err, tenantId }, "media-plan: payload estruturado da IA fora do formato esperado");
    throw new MediaPlanError("Falha ao interpretar o plano gerado — tente novamente.");
  }

  conteudo.keywordsRelevantes = keywordsRelevantes;
  conteudo.concorrentesEncontrados = concorrentesEncontrados;

  logDataForSeoCost({ tenantId, feature: "media_plan" }, custoTotal);

  const [plan] = await db
    .insert(mediaPlansTable)
    .values({
      tenantId,
      conteudo,
      contextoUsado: { profileSnapshot: contextoTexto },
      custoUsd: custoTotal.toFixed(4),
      geradoPor,
    })
    .returning();

  return { plan: plan! };
}
