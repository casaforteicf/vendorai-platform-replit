/**
 * Plano de mídia automático.
 *
 * A geração usa o perfil real do tenant, dados de busca quando disponíveis e
 * IA estruturada. Falhas de provedor/formato da IA NÃO devem bloquear o
 * usuário: nesses casos o serviço produz e persiste um plano determinístico
 * válido usando somente os dados reais já disponíveis no tenant.
 */
import {
  db,
  businessProfilesTable,
  mediaPlansTable,
  produtosCatalogoTable,
  tenantsTable,
  type MediaPlanConteudo,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
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
Em prioridade, use somente alta, media ou baixa. percentualOrcamento representa exclusivamente PARTICIPAÇÃO DA VERBA DE MÍDIA PAGA:
- canais pagos (Meta Ads, Google Ads/Search/Display/PMax, LinkedIn Ads, TikTok Ads, YouTube Ads etc.) devem dividir aproximadamente 100% entre si;
- canais orgânicos, próprios ou diretos (Instagram orgânico, LinkedIn orgânico, WhatsApp, e-mail, SEO/blog, site, landing page etc.) devem usar percentualOrcamento = 0;
- não transforme esforço editorial, produção ou CRM em percentual de orçamento de mídia.`;

type JsonRecord = Record<string, unknown>;
type GenerationMode = "ai" | "fallback";

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
  produtos: { nome: string; descricao?: string | null }[] | null;
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

function normalizeChannelName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isPaidMediaChannel(channel: string): boolean {
  const normalized = normalizeChannelName(channel);
  if (normalized.includes("seo") || normalized.includes("organico") || normalized.includes("organica")) return false;
  if (normalized.includes("whatsapp") || normalized.includes("email") || normalized.includes("e-mail")) return false;
  if (normalized.includes("blog") || normalized.includes("site") || normalized.includes("landing")) return false;
  if (normalized.includes("meta ads") || normalized.includes("facebook ads") || normalized.includes("instagram ads")) return true;
  if (normalized.includes("google ads") || normalized.includes("google search") || normalized.includes("google display")) return true;
  if (normalized.includes("performance max") || normalized.includes("pmax")) return true;
  if (normalized.includes("linkedin ads") || normalized.includes("tiktok ads") || normalized.includes("youtube ads")) return true;
  return false;
}

function normalizePaidMediaBudget<T extends { canal: string; percentualOrcamento: number }>(channels: T[]): T[] {
  const paidIndexes = channels
    .map((channel, index) => isPaidMediaChannel(channel.canal) ? index : -1)
    .filter((index) => index >= 0);

  if (paidIndexes.length === 0) {
    return channels.map((channel) => ({ ...channel, percentualOrcamento: 0 }));
  }

  const paidRawTotal = paidIndexes.reduce((sum, index) => sum + channels[index]!.percentualOrcamento, 0);
  const equalShare = 100 / paidIndexes.length;
  const lastPaidIndex = paidIndexes[paidIndexes.length - 1]!;
  let allocated = 0;

  return channels.map((channel, index) => {
    if (!paidIndexes.includes(index)) return { ...channel, percentualOrcamento: 0 };
    if (index === lastPaidIndex) {
      return { ...channel, percentualOrcamento: Math.max(0, Number((100 - allocated).toFixed(2))) };
    }
    const share = paidRawTotal > 0
      ? Number(((channel.percentualOrcamento / paidRawTotal) * 100).toFixed(2))
      : Number(equalShare.toFixed(2));
    allocated += share;
    return { ...channel, percentualOrcamento: share };
  });
}

function parseMediaPlanPayload(parsed: unknown): MediaPlanConteudo {
  if (!isRecord(parsed)) {
    throw new Error("Plano não é um objeto");
  }

  if (!Array.isArray(parsed.canais) || parsed.canais.length === 0) {
    throw new Error("Campo inválido: canais");
  }

  const canaisRaw = parsed.canais.map((item, index) => {
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
  const canais = normalizePaidMediaBudget(canaisRaw);

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
  const [[profile], [tenant], catalog] = await Promise.all([
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
    db
      .select({ nome: produtosCatalogoTable.nome, descricao: produtosCatalogoTable.descricao })
      .from(produtosCatalogoTable)
      .where(and(eq(produtosCatalogoTable.tenantId, tenantId), eq(produtosCatalogoTable.ativo, true)))
      .limit(20),
  ]);

  // Só existe erro de dados quando o tenant realmente não existe. Um tenant
  // válido nunca deve receber 422 apenas porque o cadastro antigo está parcial.
  if (!profile && !tenant) return null;

  const razaoSocial =
    profile?.razaoSocial?.trim() || tenant?.nomeEmpresa?.trim() || tenant?.name?.trim() || "Empresa";
  const legacyProducts = (profile?.produtos as { nome: string; descricao?: string | null }[] | null) || null;
  const officialProducts = catalog.length > 0 ? catalog : legacyProducts;

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
    produtos: officialProducts,
    site: tenant?.site || null,
  };
}

function buildFallbackMediaPlan(
  profile: MediaPlanProfile,
  keywordsRelevantes: MediaPlanConteudo["keywordsRelevantes"] = [],
  concorrentesEncontrados: MediaPlanConteudo["concorrentesEncontrados"] = [],
): MediaPlanConteudo {
  const nome = profile.nomeFantasia || profile.razaoSocial;
  const segmento = profile.vertical || "seu segmento";
  const produtos = profile.produtos?.map((produto) => produto.nome).filter(Boolean) ?? [];
  const principalProduto = produtos[0];
  const principalKeyword = keywordsRelevantes[0];
  const principalConcorrente = concorrentesEncontrados[0];

  const pontosFortesAtuais: string[] = [];
  if (profile.vertical) pontosFortesAtuais.push(`Atuação definida no segmento ${profile.vertical}.`);
  if (profile.diferenciais) pontosFortesAtuais.push(`Diferenciais comerciais já cadastrados: ${profile.diferenciais}`);
  if (produtos.length > 0) pontosFortesAtuais.push(`Portfólio identificado com ${produtos.length} produto(s) ou serviço(s).`);
  if (profile.site) pontosFortesAtuais.push("Site próprio disponível para receber e converter tráfego.");
  if (profile.instagramUrl) pontosFortesAtuais.push("Instagram já cadastrado como ativo de presença digital.");
  if (pontosFortesAtuais.length === 0) {
    pontosFortesAtuais.push(`Identidade comercial de ${nome} disponível para estruturar a aquisição digital.`);
  }

  const oportunidades: string[] = [];
  if (principalKeyword) {
    oportunidades.push(
      `Explorar a demanda de busca por “${principalKeyword.termo}”${
        principalKeyword.volumeBusca != null ? `, com ${principalKeyword.volumeBusca} buscas/mês nos dados disponíveis` : ""
      }.`,
    );
  }
  if (principalConcorrente) {
    oportunidades.push(
      `Disputar visibilidade orgânica e paga com domínios que já aparecem nas buscas, como ${principalConcorrente.dominio}.`,
    );
  }
  if (!profile.site) oportunidades.push("Criar uma página de conversão simples para transformar campanhas em contatos mensuráveis.");
  if (!profile.instagramUrl) oportunidades.push("Estruturar presença social para prova visual, autoridade e remarketing.");
  if (!profile.publicoAlvo) oportunidades.push("Refinar o público-alvo no cadastro para aumentar a precisão das próximas campanhas.");
  if (oportunidades.length < 3) {
    oportunidades.push(`Criar campanhas por intenção ligadas a ${principalProduto || segmento}, evitando mídia genérica.`);
  }
  if (oportunidades.length < 3) {
    oportunidades.push("Medir origem dos contatos e concentrar orçamento nos canais com melhor custo por oportunidade.");
  }

  const diagnosticoPartes = [
    `${nome} possui dados suficientes no VendorAI para iniciar um plano de aquisição digital`,
    profile.vertical ? `com foco no segmento ${profile.vertical}` : "mesmo com o segmento ainda incompleto no cadastro",
    profile.site || profile.instagramUrl
      ? "e já conta com pelo menos um ativo digital cadastrado"
      : "mas ainda precisa fortalecer os ativos digitais próprios",
  ];

  const conteudo = {
    diagnostico: `${diagnosticoPartes.join(" ")}. O plano abaixo prioriza demanda com intenção, presença social e construção de ativo próprio, sem depender de informações não cadastradas.`,
    pontosFortesAtuais: pontosFortesAtuais.slice(0, 4),
    oportunidades: oportunidades.slice(0, 4),
    canais: [
      {
        canal: "Google Ads — Pesquisa",
        prioridade: "alta",
        motivo: `Capturar pessoas que já procuram por ${principalKeyword?.termo || principalProduto || segmento}, priorizando intenção de compra ou contato.`,
        tiposCampanhaSugeridos: ["Pesquisa por intenção", "Campanha geográfica com conversão"],
        percentualOrcamento: 55,
      },
      {
        canal: "Meta Ads — Instagram e Facebook",
        prioridade: "alta",
        motivo: `Gerar descoberta, prova visual e remarketing para ${nome}, usando ofertas e conteúdos ligados ao que a empresa realmente vende.`,
        tiposCampanhaSugeridos: ["Prova social e demonstração", "Remarketing para visitantes e engajados"],
        percentualOrcamento: 45,
      },
      {
        canal: "SEO e conteúdo",
        prioridade: "media",
        motivo: `Construir presença própria para buscas relacionadas a ${principalProduto || segmento} e reduzir dependência de mídia paga no médio prazo.`,
        tiposCampanhaSugeridos: ["Conteúdo orientado a buscas", "Páginas de serviço e autoridade"],
        percentualOrcamento: 0,
      },
    ],
    pilaresConteudo: [
      `Educação: explicar problemas, dúvidas e critérios de compra relacionados a ${principalProduto || segmento}.`,
      `Prova: mostrar aplicações, resultados, bastidores, diferenciais e evidências reais de ${nome}.`,
      "Conversão: apresentar ofertas, chamadas para contato, orçamento, demonstração ou próximo passo comercial.",
    ],
    acoesImediatas: [
      `Definir uma oferta principal para ${principalProduto || segmento} e uma única conversão prioritária.`,
      "Criar ou revisar a página de destino com proposta de valor, prova e chamada para contato.",
      "Publicar uma campanha de Pesquisa com termos de alta intenção e acompanhamento de conversão.",
      "Criar uma campanha de Meta com prova visual e remarketing para quem interagir com os ativos digitais.",
    ],
    keywordsRelevantes,
    concorrentesEncontrados,
  };

  return conteudo as MediaPlanConteudo;
}

async function generateMediaPlanWithAi(contextoTexto: string): Promise<MediaPlanConteudo> {
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
    throw new Error(`IA não retornou submit_media_plan (stop_reason=${response.stop_reason ?? "unknown"})`);
  }

  return parseMediaPlanPayload(toolBlock.input);
}

export class MediaPlanError extends Error {}

export async function generateMediaPlan(
  tenantId: string,
  geradoPor: string | null,
): Promise<{ plan: typeof mediaPlansTable.$inferSelect }> {
  const profile = await resolveMediaPlanProfile(tenantId);
  if (!profile) {
    // 422 fica reservado ao único caso realmente corrigível pelo cliente:
    // tenant inexistente/sem qualquer fonte persistida de perfil.
    throw new MediaPlanError(
      "Não foi possível localizar os dados deste negócio. Atualize a página e entre novamente antes de gerar o plano.",
    );
  }

  let custoTotal = 0;
  let keywordsRelevantes: MediaPlanConteudo["keywordsRelevantes"] = [];
  let concorrentesEncontrados: MediaPlanConteudo["concorrentesEncontrados"] = [];

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
        "media-plan: falha DataForSEO; geração seguirá sem bloquear o usuário",
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

  let conteudo: MediaPlanConteudo;
  let generationMode: GenerationMode = "ai";
  let fallbackReason: string | null = null;

  try {
    conteudo = await generateMediaPlanWithAi(contextoTexto);
  } catch (err) {
    generationMode = "fallback";
    fallbackReason = err instanceof Error ? err.message : String(err);
    logger.error(
      { err, tenantId, fallbackReason },
      "media-plan: IA indisponível ou inválida; usando plano determinístico persistível",
    );
    conteudo = buildFallbackMediaPlan(profile, keywordsRelevantes, concorrentesEncontrados);
  }

  // Mesmo no caminho da IA, anexa os dados reais de busca fora do payload do
  // modelo. O fallback já nasce com esses dados, mas a atribuição é idempotente.
  conteudo.keywordsRelevantes = keywordsRelevantes;
  conteudo.concorrentesEncontrados = concorrentesEncontrados;

  logDataForSeoCost({ tenantId, feature: "media_plan" }, custoTotal);

  const [plan] = await db
    .insert(mediaPlansTable)
    .values({
      tenantId,
      conteudo,
      contextoUsado: {
        profileSnapshot: contextoTexto,
        generationMode,
        fallbackReason,
      },
      custoUsd: custoTotal.toFixed(4),
      geradoPor,
    })
    .returning();

  if (!plan) {
    throw new Error("media-plan: persistência não retornou o plano criado");
  }

  logger.info(
    { tenantId, planId: plan.id, generationMode },
    "media-plan: plano gerado e persistido",
  );

  return { plan };
}
