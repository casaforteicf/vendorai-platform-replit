/**
 * Criador — segundo dos 4 agentes do Content Autopilot (ver briefing
 * /areas/content-autopilot). Recebe uma keyword aprovada (com ou sem
 * concorrência pesquisada pelo Pesquisador) e produz um artigo completo:
 * título, slug, meta description, corpo em markdown e imagem de capa.
 *
 * Sempre grava com status "otimizando" — ainda não passou pelo Otimizador
 * (score de SEO, linkagem interna), que é o próximo agente a construir.
 * Nunca publica nada sozinho.
 */
import { db, contentAutopilotArticlesTable, contentAutopilotKeywordsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { logger } from "../lib/logger.js";
import { callReplicateFlux11Pro } from "../lib/arch-render-pipeline.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { getConfig } from "./contentAutopilot.js";
import type { ContentAutopilotKeyword } from "@workspace/db";

function slugify(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

interface ParsedArticle {
  titulo: string;
  metaDescription: string;
  conteudoMd: string;
}

function parseArticleResponse(raw: string): ParsedArticle {
  const tituloMatch = raw.match(/^TITULO:\s*(.+)$/m);
  const metaMatch = raw.match(/^META:\s*(.+)$/m);

  // Bug real encontrado no teste (23/08): usar /^---$/m como delimitador
  // cortava o artigo no primeiro `---` que aparecesse DENTRO do corpo
  // (linha horizontal de markdown, comum em textos longos) — split() corta
  // em toda ocorrência, então [1] descartava tudo depois da segunda.
  // Marcador único (===CORPO===) não colide com nada que a IA escreveria
  // naturalmente no meio do texto.
  const marker = "===CORPO===";
  const markerIndex = raw.indexOf(marker);

  if (!tituloMatch || !metaMatch || markerIndex === -1) {
    throw new Error("Resposta da IA não seguiu o formato esperado (TITULO/META/===CORPO===)");
  }
  return {
    titulo: tituloMatch[1].trim(),
    metaDescription: metaMatch[1].trim(),
    conteudoMd: raw.slice(markerIndex + marker.length).trim(),
  };
}

/** Gera o artigo completo (texto) pra uma keyword — não gera imagem nem salva ainda. */
async function writeArticle(keyword: ContentAutopilotKeyword, brandTone: unknown): Promise<ParsedArticle> {
  const competitorContext =
    keyword.serpTop10 && keyword.serpTop10.length > 0
      ? `Os concorrentes que hoje rankeiam no Google pra essa keyword cobrem estes títulos:\n${keyword
          .serpTop10!.slice(0, 5)
          .map((r) => `- ${r.title}`)
          .join("\n")}\nEscreva um artigo mais completo e útil do que esses.`
      : "Não há dados de concorrência disponíveis — escreva com base no seu conhecimento do tema.";

  const toneContext = brandTone ? `Tom de marca a seguir:\n${JSON.stringify(brandTone)}` : "Sem tom de marca definido — use um tom profissional e direto.";

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system:
      "Você escreve artigos de blog em português brasileiro, otimizados pra SEO, pra uma empresa de tecnologia B2B. " +
      "Responda EXATAMENTE nesse formato, sem markdown extra fora do corpo, sem comentário antes ou depois:\n" +
      "TITULO: <título do artigo, até 60 caracteres, com a keyword principal>\n" +
      "META: <meta description, 150-160 caracteres, com call-to-action sutil>\n" +
      "===CORPO===\n" +
      "<corpo do artigo em markdown — use ## pra subtítulos (pelo menos 4 seções), mínimo 800 palavras (o corpo precisa ser longo de verdade, não um resumo), tom natural, sem clichê de IA (nunca comece com 'No mundo atual' ou similar), parágrafos curtos. Pode usar --- como linha divisória dentro do corpo se quiser, isso não quebra nada.>",
    messages: [
      {
        role: "user",
        content: `Keyword principal: "${keyword.termo}" (volume de busca mensal: ${keyword.volumeBusca ?? "desconhecido"})\n\n${competitorContext}\n\n${toneContext}`,
      },
    ],
  });

  const textBlock = msg.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("Resposta da IA sem texto");

  return parseArticleResponse(textBlock.text);
}

/** Gera e persiste a imagem de capa do artigo, retornando a URL pública de storage. */
async function generateCoverImage(titulo: string, keywordTermo: string): Promise<{ url: string; altText: string }> {
  const prompt = `Blog cover image for an article about "${keywordTermo}" — professional B2B SaaS/technology illustration style, clean modern composition, no text overlay, no readable characters or letters in the image.`;
  const outputUrl = await callReplicateFlux11Pro({ prompt, aspectRatio: "16:9" });

  const imgRes = await fetch(outputUrl);
  if (!imgRes.ok) throw new Error(`Falha ao baixar imagem gerada: ${imgRes.status}`);
  const buf = Buffer.from(await imgRes.arrayBuffer());

  const storage = new ObjectStorageService();
  const objectPath = await storage.savePrivateBuffer(buf, "image/jpeg", `content-autopilot-${crypto.randomUUID()}.jpg`);
  const imageUrl = `/api/storage/objects${objectPath.replace(/^\/objects/, "")}`;

  return { url: imageUrl, altText: titulo };
}

export interface GenerateArticleResult {
  articleId: string;
}

/** Orquestra o Criador completo: texto + imagem + grava em content_autopilot_articles. */
export async function generateArticle(tenantId: string, keywordId: string): Promise<GenerateArticleResult> {
  const config = await getConfig(tenantId);
  if (!config) throw new Error("Tenant sem configuração do Content Autopilot — crie a config primeiro");

  const [keyword] = await db
    .select()
    .from(contentAutopilotKeywordsTable)
    .where(and(eq(contentAutopilotKeywordsTable.id, keywordId), eq(contentAutopilotKeywordsTable.tenantId, tenantId)));
  if (!keyword) throw new Error("Keyword não encontrada pra esse tenant");

  const [draft] = await db
    .insert(contentAutopilotArticlesTable)
    .values({ tenantId, keywordId, status: "gerando" } as any)
    .returning({ id: contentAutopilotArticlesTable.id });

  try {
    logger.info({ tenantId, keywordId, termo: keyword.termo }, "content-autopilot: Criador — escrevendo artigo");
    const article = await writeArticle(keyword, config.brandTone);

    logger.info({ tenantId, keywordId }, "content-autopilot: Criador — gerando imagem de capa");
    const imagem = await generateCoverImage(article.titulo, keyword.termo);

    await db
      .update(contentAutopilotArticlesTable)
      .set({
        titulo: article.titulo,
        slug: slugify(article.titulo),
        conteudoMd: article.conteudoMd,
        metaDescription: article.metaDescription,
        imagens: [imagem],
        status: "otimizando",
      } as any)
      .where(eq(contentAutopilotArticlesTable.id, draft.id));

    await db
      .update(contentAutopilotKeywordsTable)
      .set({ status: "em_uso" })
      .where(eq(contentAutopilotKeywordsTable.id, keywordId));

    return { articleId: draft.id };
  } catch (err) {
    await db
      .update(contentAutopilotArticlesTable)
      .set({ status: "erro", erroDetalhe: err instanceof Error ? err.message : String(err) })
      .where(eq(contentAutopilotArticlesTable.id, draft.id));
    throw err;
  }
}
