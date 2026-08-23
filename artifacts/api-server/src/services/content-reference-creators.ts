// Análise de criadores de referência do Instagram — inspirado no fluxo
// do Dalea AI ("point to up to 3 reference creators, Dalea starts
// learning your world"). Busca posts públicos recentes via Business
// Discovery API e extrai padrões (tom, formato, hashtags, cadência) por
// IA, pra alimentar a geração de conteúdo do próprio tenant.
//
// DEPENDÊNCIA REAL, não confirmada em produção ainda: Business Discovery
// é documentada pela Meta como parte do fluxo clássico do Graph API
// (graph.facebook.com, conta vinculada a uma Página do Facebook via
// "Facebook Login for Business"). A conexão ativa do Instagram nesse
// sistema hoje (instagram-oauth.ts) usa o fluxo mais novo e mais simples
// "Instagram API with Instagram Login" (host graph.instagram.com) — não
// há confirmação oficial de que esse token aceita o campo
// business_discovery. Só dá pra confirmar testando com conexão real; se
// falhar, a query abaixo tenta primeiro via graph.facebook.com (rota
// documentada) e captura o erro com mensagem clara em vez de mascarar.
import { and, eq } from "drizzle-orm";
import { db, contentReferenceCreatorsTable, instagramConnectionsTable, type PadroesDetectados } from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { logger } from "../lib/logger.js";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";
const MAX_REFERENCE_CREATORS = 3;

export class ReferenceCreatorError extends Error {}

interface BusinessDiscoveryMedia {
  caption?: string;
  media_type?: string;
  like_count?: number;
  comments_count?: number;
  timestamp?: string;
}

interface BusinessDiscoveryResponse {
  business_discovery?: {
    username: string;
    followers_count?: number;
    media_count?: number;
    media?: { data: BusinessDiscoveryMedia[] };
  };
}

async function fetchPublicSnapshot(
  ownIgUserId: string,
  accessToken: string,
  targetUsername: string,
): Promise<{ followersCount: number | null; mediaCount: number | null; recentMedia: BusinessDiscoveryMedia[] }> {
  const url = new URL(`${GRAPH_BASE}/${ownIgUserId}`);
  url.searchParams.set(
    "fields",
    `business_discovery.username(${targetUsername}){username,followers_count,media_count,media.limit(15){caption,media_type,like_count,comments_count,timestamp}}`,
  );
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    logger.error({ status: res.status, body: text, targetUsername }, "Business Discovery: falha na chamada");
    throw new ReferenceCreatorError(
      `Não foi possível ler dados públicos de @${targetUsername} (${res.status}). Confirme que é uma conta Business/Creator pública — contas pessoais não são acessíveis pela API oficial.`,
    );
  }

  const data = (await res.json()) as BusinessDiscoveryResponse;
  const bd = data.business_discovery;
  if (!bd) {
    throw new ReferenceCreatorError(`@${targetUsername} não retornou dados — confirme que é uma conta Business/Creator pública.`);
  }

  return {
    followersCount: bd.followers_count ?? null,
    mediaCount: bd.media_count ?? null,
    recentMedia: bd.media?.data ?? [],
  };
}

const ANALYSIS_SYSTEM_PROMPT = `Você analisa posts públicos recentes de uma conta do Instagram e extrai padrões
de conteúdo pra servir de referência/inspiração pra outra marca gerar o
próprio conteúdo (NUNCA pra copiar/plagiar — só entender o padrão).
Responda APENAS com um objeto JSON válido, sem markdown, no formato exato:
{
  "tomDeVoz": string (ex: "direto e informal", "técnico e autoritativo"),
  "duracaoTipicaSegundos": string ou null (só se der pra inferir do tipo de mídia, ex: "30-45s"),
  "estiloDeHook": string (como os posts prendem atenção nos primeiros segundos/primeira linha),
  "temasFrequentes": string[] (3 a 6 temas recorrentes),
  "hashtagsFrequentes": string[] (hashtags que aparecem repetidas, sem o #),
  "cadenciaPostagem": string (estimativa a partir dos timestamps, ex: "quase diário", "2-3x por semana"),
  "observacoes": string (1-2 frases sobre o que parece funcionar melhor, baseado em like_count/comments_count relativos entre os posts)
}
Nunca invente dado que não esteja nas legendas/métricas fornecidas.`;

async function analisarPadroes(
  tenantId: string,
  username: string,
  recentMedia: BusinessDiscoveryMedia[],
): Promise<PadroesDetectados> {
  const postsResumo = recentMedia
    .map((m, i) => `Post ${i + 1} (${m.media_type ?? "?"}, ${m.timestamp ?? "?"}): ${m.like_count ?? 0} curtidas, ${m.comments_count ?? 0} comentários. Legenda: ${(m.caption ?? "").slice(0, 300)}`)
    .join("\n\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 700,
    system: ANALYSIS_SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Conta: @${username}\n\n${postsResumo || "(sem posts recentes retornados)"}` }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text.trim() : null;
  if (!raw) throw new ReferenceCreatorError("IA não retornou análise — tente novamente.");

  const cleaned = raw.replace(/^```json\s*|```$/g, "").trim();
  const parsed = JSON.parse(cleaned) as Omit<PadroesDetectados, "baseadoEmPosts">;

  return { ...parsed, baseadoEmPosts: recentMedia.length };
}

export async function listReferenceCreators(tenantId: string) {
  return db.select().from(contentReferenceCreatorsTable).where(eq(contentReferenceCreatorsTable.tenantId, tenantId));
}

export async function addReferenceCreator(tenantId: string, instagramUsername: string) {
  const username = instagramUsername.trim().replace(/^@/, "");
  if (!username) throw new ReferenceCreatorError("Informe um @ válido.");

  const existentes = await listReferenceCreators(tenantId);
  if (existentes.length >= MAX_REFERENCE_CREATORS) {
    throw new ReferenceCreatorError(`Limite de ${MAX_REFERENCE_CREATORS} criadores de referência por tenant.`);
  }
  if (existentes.some((c) => c.instagramUsername.toLowerCase() === username.toLowerCase())) {
    throw new ReferenceCreatorError(`@${username} já está na lista.`);
  }

  const [created] = await db
    .insert(contentReferenceCreatorsTable)
    .values({ tenantId, instagramUsername: username })
    .returning();
  return created;
}

export async function removeReferenceCreator(tenantId: string, id: string) {
  await db
    .delete(contentReferenceCreatorsTable)
    .where(and(eq(contentReferenceCreatorsTable.id, id), eq(contentReferenceCreatorsTable.tenantId, tenantId)));
}

// Roda a busca + análise pra 1 criador e grava o resultado (ou o erro,
// pra aparecer na UI em vez de falhar silenciosamente). Chamado sob
// demanda (botão "Atualizar padrões"), não em background automático —
// Business Discovery tem limite de 30 hashtags/contas únicas por semana
// por conta conectada, então atualização automática recorrente
// queimaria essa cota rápido pra pouco ganho.
export async function refreshReferenceCreatorAnalysis(tenantId: string, id: string): Promise<ContentReferenceCreatorResult> {
  const [creator] = await db
    .select()
    .from(contentReferenceCreatorsTable)
    .where(and(eq(contentReferenceCreatorsTable.id, id), eq(contentReferenceCreatorsTable.tenantId, tenantId)));
  if (!creator) throw new ReferenceCreatorError("Criador de referência não encontrado.");

  const [igConn] = await db
    .select()
    .from(instagramConnectionsTable)
    .where(and(eq(instagramConnectionsTable.tenantId, tenantId)));
  if (!igConn?.accountId || !igConn?.pageAccessToken) {
    const errMsg = "Conecte o Instagram do seu tenant primeiro (Configurações → Integrações) — a análise de referência usa essa conexão pra consultar dados públicos de outras contas.";
    await db.update(contentReferenceCreatorsTable).set({ ultimoErro: errMsg, updatedAt: new Date() }).where(eq(contentReferenceCreatorsTable.id, id));
    throw new ReferenceCreatorError(errMsg);
  }

  try {
    const snapshot = await fetchPublicSnapshot(igConn.accountId, igConn.pageAccessToken, creator.instagramUsername);
    const padroes = await analisarPadroes(tenantId, creator.instagramUsername, snapshot.recentMedia);

    const [updated] = await db
      .update(contentReferenceCreatorsTable)
      .set({ padroesDetectados: padroes, ultimaAnaliseEm: new Date(), ultimoErro: null, updatedAt: new Date() })
      .where(eq(contentReferenceCreatorsTable.id, id))
      .returning();

    logger.info({ tenantId, username: creator.instagramUsername }, "content-reference-creators: padrões atualizados");
    return updated!;
  } catch (err) {
    const message = err instanceof ReferenceCreatorError ? err.message : "Erro inesperado ao analisar essa conta.";
    await db.update(contentReferenceCreatorsTable).set({ ultimoErro: message, updatedAt: new Date() }).where(eq(contentReferenceCreatorsTable.id, id));
    logger.error({ err, tenantId, username: creator.instagramUsername }, "content-reference-creators: falha na análise");
    throw err instanceof ReferenceCreatorError ? err : new ReferenceCreatorError(message);
  }
}

type ContentReferenceCreatorResult = Awaited<ReturnType<typeof listReferenceCreators>>[number];

// Monta o bloco de texto injetado no prompt de geração de conteúdo
// (Reels script / estratégia) a partir dos padrões já analisados —
// só usa criadores com análise bem-sucedida, ignora os com erro/pendente.
export async function buildReferencePatternsPromptBlock(tenantId: string): Promise<string> {
  const creators = await listReferenceCreators(tenantId);
  const comPadroes = creators.filter((c) => c.padroesDetectados);
  if (comPadroes.length === 0) return "";

  const blocos = comPadroes.map((c) => {
    const p = c.padroesDetectados!;
    return `@${c.instagramUsername}: tom "${p.tomDeVoz}", hook "${p.estiloDeHook}"${p.duracaoTipicaSegundos ? `, duração típica ${p.duracaoTipicaSegundos}` : ""}, temas: ${p.temasFrequentes.join(", ")}, cadência: ${p.cadenciaPostagem}. ${p.observacoes}`;
  });

  return `\n## Referências de estilo (inspiração, NUNCA copiar/plagiar)\nO tenant indicou estes criadores como referência de padrão de conteúdo que funciona no nicho:\n${blocos.join("\n")}\n`;
}
